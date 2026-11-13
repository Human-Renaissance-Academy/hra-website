/**
 * 자료실 문서의 브라우저 직접 업로드 토큰과 완료 콜백입니다 (#102).
 * 토큰은 현재 로그인 역할, 대상, 파일 이름·종류·크기·경로를 확인한 뒤 발급합니다.
 * Vercel이 서명한 완료 콜백은 취소·DB 저장 실패 파일을 원장에 남깁니다.
 */
import { head } from "@vercel/blob";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { z } from "zod/v4";
import { assertDirectUploadCohort } from "@/features/resources/direct-upload/service";
import { requireDirectUploadPrincipal } from "@/lib/direct-upload-principal";
import { reserveDirectUploadToken } from "@/features/uploads/direct-upload/service";
import { logServerError } from "@/lib/errors";
import { isCurrentResourceUploadUrl, resourceUploadStore } from "@/lib/resource-blob-store";
import {
  isResourceUploadKind,
  maxResourceUploadBytes,
  resourceUploadPath,
  resourceUploadRule,
} from "@/lib/resource-upload-contract";
import { recordResourceUpload } from "@/lib/resource-upload-server";

const requestSchema = z.object({
  kind: z.enum(["class-materials", "guidebooks", "weekly-texts"]),
  fileName: z.string().min(1).max(255),
  size: z.number().int().positive(),
  contentType: z.string(),
  uploadId: z.uuid(),
});
const callbackSchema = requestSchema.pick({ kind: true, fileName: true, uploadId: true }).extend({
  userId: z.uuid(),
  pathname: z.string(),
});

/** 브라우저 업로드와 서버 토큰의 접근 모드를 같은 설정에서 읽습니다. */
export async function GET(): Promise<Response> {
  try {
    return Response.json(
      { access: resourceUploadStore().access },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ error: "업로드 저장소를 사용할 수 없습니다." }, { status: 503 });
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as HandleUploadBody;
    const store = resourceUploadStore();
    const result = await handleUpload({
      body,
      request,
      ...(store.token ? { token: store.token } : {}),
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const { userId, role } = await requireDirectUploadPrincipal(request, [
          "ADMIN",
          "FACULTY",
          "MEMBER",
        ]);
        const parsed = requestSchema.safeParse(clientPayload ? JSON.parse(clientPayload) : null);
        if (!parsed.success || !isResourceUploadKind(parsed.data.kind))
          throw new Error("파일 정보가 올바르지 않습니다.");
        const { kind, fileName, size, contentType, uploadId } = parsed.data;
        if (kind === "guidebooks" && role !== "ADMIN") throw new Error("업로드 권한이 없습니다.");
        if (kind === "class-materials" && role === "MEMBER")
          throw new Error("업로드 권한이 없습니다.");
        if (kind === "weekly-texts" && role === "MEMBER") {
          // 회원은 현재 DB에 기수가 배정된 경우에만 자신의 텍스트를 올립니다.
          await assertDirectUploadCohort(userId);
        }
        const rule = resourceUploadRule(kind, fileName);
        if (
          !rule ||
          size > maxResourceUploadBytes[kind] ||
          (contentType && !rule.acceptedTypes.includes(contentType.toLowerCase())) ||
          pathname !== resourceUploadPath(kind, userId, uploadId, fileName)
        ) {
          throw new Error("허용되지 않은 파일입니다.");
        }

        // URL은 접미사 없는 고유 UUID 경로로 결정됩니다. 토큰 발급 시점에
        // 소유권을 먼저 남겨 업로드 완료 콜백·브라우저 저장이 끊겨도 30일 후
        // 미참조 파일 정리 대상에서 누락되지 않게 합니다.
        return reserveDirectUploadToken({
          expectedUrl: `https://${store.host}/${pathname}`,
          userId,
          contentType: rule.contentType,
          maximumSizeInBytes: maxResourceUploadBytes[kind],
          tokenPayload: { kind, fileName, uploadId, userId, pathname },
        });
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // handleUpload이 콜백 서명을 검증한 뒤에만 호출합니다. 토큰 payload와
        // 실제 Blob 경로를 다시 비교해 다른 파일 URL의 소유권 등록을 막습니다.
        const parsed = callbackSchema.safeParse(tokenPayload ? JSON.parse(tokenPayload) : null);
        if (!parsed.success || !isCurrentResourceUploadUrl(blob.url))
          throw new Error("완료 정보를 확인할 수 없습니다.");
        const { kind, fileName, uploadId, userId, pathname } = parsed.data;
        if (
          pathname !== resourceUploadPath(kind, userId, uploadId, fileName) ||
          blob.pathname !== pathname
        ) {
          throw new Error("완료 경로가 일치하지 않습니다.");
        }
        const stored = await head(blob.url, store.token ? { token: store.token } : undefined);
        if (stored.url !== blob.url || stored.pathname !== pathname)
          throw new Error("파일 저장 정보를 확인할 수 없습니다.");
        await recordResourceUpload(blob.url, userId);
      },
    });
    return Response.json(result);
  } catch (error) {
    logServerError("api/resource-uploads", error);
    return Response.json({ error: "업로드 요청을 처리할 수 없습니다." }, { status: 400 });
  }
}
