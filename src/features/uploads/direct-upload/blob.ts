/**
 * 이미지 직접 업로드 완료 시 Blob HEAD 메타데이터의 공통 동등 조건을 검사합니다.
 * 문서 resource 콜백의 경로 전용 검증이나 저장 전 실제 바이트 검증을 대체하지 않습니다.
 */
import "server-only";
import { head, type PutBlobResult } from "@vercel/blob";

/** 경로·양수 크기·상한·MIME을 검사하며 비공개 저장소 토큰을 HEAD에 전달합니다. */
export async function matchesStoredDirectImage(
  blob: Pick<PutBlobResult, "url" | "pathname">,
  maximumSizeInBytes: number,
  contentType: string,
  token?: string,
): Promise<boolean> {
  const stored = token ? await head(blob.url, { token }) : await head(blob.url);
  return !(
    stored.url !== blob.url ||
    stored.pathname !== blob.pathname ||
    stored.size < 1 ||
    stored.size > maximumSizeInBytes ||
    stored.contentType !== contentType
  );
}
