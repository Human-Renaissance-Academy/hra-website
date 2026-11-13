/**
 * 직접 업로드의 검증된 예상 URL을 예약한 뒤 고정 경로 토큰 제한값을 반환합니다.
 * 종류별 권한·파일·대상 검증은 먼저 완료되어야 하며 서버 put 업로드와 구분합니다.
 */
import "server-only";
import { recordResourceUpload } from "@/lib/resource-upload-server";

type DirectUploadTokenInput = {
  expectedUrl: string;
  userId: string;
  contentType: string;
  maximumSizeInBytes: number;
  tokenPayload: Record<string, string | number>;
};

/** 예약 실패는 그대로 전파하여 SDK가 업로드 토큰을 생성하지 못하게 합니다. */
export async function reserveDirectUploadToken(input: DirectUploadTokenInput) {
  await recordResourceUpload(input.expectedUrl, input.userId);
  return {
    allowedContentTypes: [input.contentType],
    maximumSizeInBytes: input.maximumSizeInBytes,
    validUntil: Date.now() + 15 * 60 * 1000,
    addRandomSuffix: false,
    allowOverwrite: false,
    tokenPayload: JSON.stringify(input.tokenPayload),
  };
}
