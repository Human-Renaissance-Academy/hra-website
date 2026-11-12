/**
 * 승인된 회원에게 자료실 파일을 같은 출처로 스트리밍합니다.
 * 응답의 Content-Disposition에 DB의 원본 파일명을 넣어 한글 이름으로 저장합니다.
 * 승인 회원 확인 뒤 API v1 자료 경로와 같은 사용자별 조회 예산(#444)을 예약하며,
 * 초과는 429와 `Retry-After`, 제한 저장소 장애는 자료를 제공하지 않는 503(fail-closed)입니다.
 */
import { get } from "@vercel/blob";
import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { classMaterialReadFilter } from "@/features/class-materials/access";
import {
  enforceResourceReadLimit,
  ResourceReadLimitUnavailableError,
  ResourceReadRateLimitError,
} from "@/features/resources/read-limit";
import { db } from "@/lib/db";
import { classLogImages, classMaterials, guidebooks, weeklyTextImages, weeklyTexts } from "@/lib/db/schema";
import { logServerError } from "@/lib/errors";
import { requireSharedResourceReader } from "@/lib/resource-access";
import { attachmentDisposition, resourceBlobAccess } from "@/lib/resource-download";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ kind: string; id: string }> };

/** 이 경로가 제공하는 자료 종류입니다. 아래 조회 분기와 같은 목록을 유지합니다. */
const resourceKinds = new Set(["class-materials", "guidebooks", "weekly-texts", "weekly-text-images", "class-log-images"]);

/** 빈도 제한 429·저장소 장애 503 평문 응답의 공통 헤더입니다. */
const limitErrorHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } as const;

/** 응답 시작 뒤의 읽기·취소 실패도 고정 오류로 처리하고 공급자 reader를 정리합니다. */
function protectedStream(source: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  let released = false;
  let terminal = false;
  let cancelled = false;
  const release = () => {
    if (!released) {
      released = true;
      reader.releaseLock();
    }
  };
  // 취소 성공 여부만 반환하여 공급자 오류·cause·사용자 취소 사유를 전달하지 않습니다.
  const cancelReader = async () => {
    try {
      await reader.cancel();
      return true;
    } catch {
      return false;
    } finally {
      release();
    }
  };
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await reader.read();
        if (cancelled) return;
        if (next.done) {
          terminal = true;
          release();
          controller.close();
        } else {
          controller.enqueue(next.value);
        }
      } catch {
        if (cancelled) return;
        terminal = true;
        logServerError("resources/download/stream", new Error("파일 전송이 중단되었습니다."));
        await cancelReader();
        // 정리가 끝나기 전에 응답이 취소되었으면 닫힌 controller에 오류를 다시 보내지 않습니다.
        if (!cancelled) controller.error(new Error("파일 전송이 중단되었습니다."));
      }
    },
    async cancel() {
      cancelled = true;
      if (terminal) return;
      terminal = true;
      if (!await cancelReader()) {
        logServerError("resources/download/cancel", new Error("파일 전송 취소에 실패했습니다."));
      }
    },
  });
}

export async function GET(request: Request, { params }: Context): Promise<Response> {
  const session = await requireSharedResourceReader();
  const { kind, id } = await params;
  const parsedId = z.uuid().safeParse(id);
  // 알 수 없는 자료 종류도 잘못된 ID처럼 예산을 쓰지 않고 먼저 404로 끝냅니다(#444).
  if (!parsedId.success || !resourceKinds.has(kind)) return new Response("자료를 찾을 수 없습니다.", { status: 404 });

  // 인증·승인 역할 확인(미로그인·승인 대기는 위에서 이동)과 입력 확인 뒤에만 사용자 id로 조회 예산을 예약합니다.
  // 브라우저가 직접 여는 링크·<img> 경로라 기존 응답처럼 한국어 평문 본문을 유지하고 MIME 추측만 막습니다.
  try {
    await enforceResourceReadLimit(session.user.id);
  } catch (error) {
    if (error instanceof ResourceReadRateLimitError) {
      return new Response("요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", {
        status: 429,
        headers: { ...limitErrorHeaders, "Retry-After": String(error.retryAfterSeconds) },
      });
    }
    // 제한 저장소 장애는 예약 어댑터가 이미 기록했으므로 고정 문구의 503만 반환합니다.
    if (error instanceof ResourceReadLimitUnavailableError) {
      return new Response("잠시 후 다시 시도해 주세요.", { status: 503, headers: limitErrorHeaders });
    }
    throw error;
  }

  let file: { fileUrl: string; fileName: string | null } | undefined;
  let image = false;
  if (kind === "class-materials") {
    [file] = await db.select({ fileUrl: classMaterials.fileUrl, fileName: classMaterials.fileName })
      .from(classMaterials)
      .where(and(eq(classMaterials.id, parsedId.data), classMaterialReadFilter(session.user)))
      .limit(1);
  } else if (kind === "guidebooks") {
    [file] = await db.select({ fileUrl: guidebooks.fileUrl, fileName: guidebooks.fileName })
      .from(guidebooks).where(eq(guidebooks.id, parsedId.data)).limit(1);
  } else if (kind === "weekly-texts") {
    [file] = await db.select({ fileUrl: weeklyTexts.fileUrl, fileName: weeklyTexts.fileName })
      .from(weeklyTexts).where(eq(weeklyTexts.id, parsedId.data)).limit(1);
  } else if (kind === "weekly-text-images") {
    const [row] = await db.select({ fileUrl: weeklyTextImages.url })
      .from(weeklyTextImages).where(eq(weeklyTextImages.id, parsedId.data)).limit(1);
    file = row ? { ...row, fileName: null } : undefined;
    image = true;
  } else if (kind === "class-log-images") {
    const [row] = await db.select({ fileUrl: classLogImages.url })
      .from(classLogImages).where(eq(classLogImages.id, parsedId.data)).limit(1);
    file = row ? { ...row, fileName: null } : undefined;
    image = true;
  } else {
    return new Response("자료를 찾을 수 없습니다.", { status: 404 });
  }

  const access = file?.fileUrl ? resourceBlobAccess(file.fileUrl) : null;
  if (!file?.fileUrl || !access) {
    return new Response("파일을 찾을 수 없습니다.", { status: 404 });
  }

  try {
    // 비공개 저장소의 URL은 DB에서만 읽으며, 서버 토큰은 브라우저로 보내지 않습니다.
    const privateToken = process.env.RESOURCE_PRIVATE_READ_WRITE_TOKEN;
    if (access === "private" && !privateToken) {
      throw new Error("비공개 자료 저장소가 연결되지 않았습니다.");
    }
    const blob = access === "private"
      ? await get(file.fileUrl, {
          access: "private", token: privateToken,
          storeId: new URL(file.fileUrl).hostname.split(".")[0], useCache: false,
        })
      : await get(file.fileUrl, { access: "public" });
    if (!blob || blob.statusCode !== 200) {
      return new Response("파일을 찾을 수 없습니다.", { status: 404 });
    }
    const contentType = blob.blob.contentType || "application/octet-stream";
    if (image && !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(contentType)) {
      // 거부한 본문도 취소하여 연결을 정리하며, 취소 실패가 기존 404 응답을 바꾸지 않게 합니다.
      try {
        await blob.stream.cancel();
      } catch {
        logServerError("resources/download/cancel", new Error("파일 전송 취소에 실패했습니다."));
      }
      return new Response("파일을 찾을 수 없습니다.", { status: 404 });
    }
    const inlinePdf = !image && new URL(request.url).searchParams.get("inline") === "1" &&
      file.fileName?.toLowerCase().endsWith(".pdf") && contentType === "application/pdf";
    return new Response(protectedStream(blob.stream), {
      headers: {
        "Content-Type": contentType,
        ...(image ? {} : { "Content-Disposition": attachmentDisposition(file.fileName, inlinePdf) }),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    logServerError("resources/download", error);
    return new Response("파일을 내려받을 수 없습니다.", { status: 502 });
  }
}
