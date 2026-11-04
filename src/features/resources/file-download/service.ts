/**
 * 공동 자료 API의 원본 파일을 서버에서 읽어 첨부 스트림으로 전달하는 공용 경계입니다.
 *
 * 역할:
 * - DB 값도 신뢰하지 않고 기존 `resourceBlobAccess`로 프로젝트 공개 저장소·지정 비공개 저장소만 허용합니다.
 * - 비공개 토큰은 기존 `resourceBlobToken`에서만 읽고 응답·로그에 넣지 않습니다.
 * - 저장 위치는 서버에서만 사용하며 클라이언트에는 첨부 스트림만 반환합니다(리다이렉트·서명 URL 미사용).
 *
 * 인가는 호출하는 자료별 Application Service가 먼저 수행해야 합니다.
 */
import "server-only";
import { get } from "@vercel/blob";
import { logServerError } from "@/lib/errors";
import { resourceBlobToken } from "@/lib/resource-blob-store";
import { attachmentDisposition, resourceBlobAccess } from "@/lib/resource-download";
import { protectedResourceStream } from "./stream";

/** 서비스가 Route에 전달하는 고정 실패 코드입니다. 원인·저장 위치는 담지 않습니다. */
export class ResourceFileError extends Error {
  constructor(readonly code: "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND") {
    super(code);
    this.name = "ResourceFileError";
  }
}

/** 공급자 응답 헤더 대기에 적용하는 상한입니다. 기존 학사 Blob 읽기와 같은 60초입니다. */
const RESOURCE_BLOB_TIMEOUT_MS = 60_000;

/** 파일 API 성공 응답의 고정 보안 헤더입니다. 정적 next.config 헤더와 같은 sandbox CSP를 사용합니다. */
export const RESOURCE_FILE_SECURITY_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "sandbox; default-src 'none'",
} as const;

/**
 * 인가를 마친 파일 행을 첨부 응답으로 엽니다.
 * 허용되지 않은 저장소·빈 URL·공급자 404는 NOT_FOUND, 그 밖의 공급자·설정 실패는 그대로 전파해 Route가 503으로 바꿉니다.
 */
export async function openResourceAttachment(
  file: { fileUrl: string | null; fileName: string | null } | null | undefined,
  signal?: AbortSignal,
): Promise<Response> {
  const fileUrl = file?.fileUrl;
  const access = fileUrl ? resourceBlobAccess(fileUrl) : null;
  if (!file || !fileUrl || !access) throw new ResourceFileError("NOT_FOUND");

  // 요청 취소와 시간 상한을 합쳐 공급자 헤더 대기를 중단합니다.
  // 헤더를 받은 뒤에는 상한을 해제해 느린 모바일 회선의 큰 파일 본문 전송이 60초에 끊기지 않게 하고 요청 취소만 전파합니다.
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(new Error("RESOURCE_BLOB_TIMEOUT")), RESOURCE_BLOB_TIMEOUT_MS);
  const abortSignal = signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal;
  let blob: Awaited<ReturnType<typeof get>>;
  try {
    abortSignal.throwIfAborted();
    blob = access === "private"
      ? await get(fileUrl, {
          access, token: resourceBlobToken(fileUrl),
          storeId: new URL(fileUrl).hostname.split(".")[0], useCache: false, abortSignal,
        })
      : await get(fileUrl, { access: "public", abortSignal });
  } finally {
    clearTimeout(timer);
  }
  // 공급자는 200 외에 본문 없는 304만 반환하며, 둘 다 아니면 원본이 없는 것으로 봅니다.
  if (!blob || blob.statusCode !== 200) throw new ResourceFileError("NOT_FOUND");
  let headers: Headers;
  try {
    // 스트림 reader를 잠그기 전에 헤더를 먼저 검증해 실패 시 원본 스트림을 직접 취소할 수 있게 합니다.
    headers = new Headers({
      ...RESOURCE_FILE_SECURITY_HEADERS,
      "Content-Type": blob.blob.contentType || "application/octet-stream",
      "Content-Disposition": attachmentDisposition(file.fileName),
    });
  } catch (error) {
    // 응답 구성 실패(잘못된 저장 MIME 등)에도 공급자 연결을 정리한 뒤 Route의 503 처리로 넘깁니다.
    await blob.stream.cancel().catch(() => {
      logServerError("api-v1/resources/file/cancel", new Error("RESOURCE_STREAM_CANCEL_FAILED"));
    });
    throw error;
  }
  return new Response(protectedResourceStream(blob.stream), { headers });
}
