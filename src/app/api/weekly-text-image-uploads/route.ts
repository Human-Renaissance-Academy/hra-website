/** 관리자 주차별 텍스트 사진의 직접 업로드 토큰·완료 콜백입니다 (#102). */
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { z } from "zod/v4";
import { requireDirectUploadPrincipal } from "@/lib/direct-upload-principal";
import { reserveDirectUploadToken } from "@/features/uploads/direct-upload/service";
import { matchesStoredDirectImage } from "@/features/uploads/direct-upload/blob";
import { logServerError } from "@/lib/errors";
import { isCurrentResourceUploadUrl, resourceUploadStore } from "@/lib/resource-blob-store";
import { recordResourceUpload } from "@/lib/resource-upload-server";
import { galleryImageRule, maxGalleryImageBytes } from "@/lib/gallery-upload-contract";
import { weeklyTextImagePath } from "@/lib/weekly-text-image-upload-contract";

const requestSchema = z.object({
  requestId: z.uuid(),
  uploadId: z.uuid(),
  fileName: z.string().min(1).max(255),
  size: z.number().int().positive().max(maxGalleryImageBytes),
  contentType: z.string(),
});
const callbackSchema = requestSchema
  .pick({ requestId: true, uploadId: true, fileName: true, contentType: true })
  .extend({ userId: z.uuid(), pathname: z.string() });

/** 토큰 발급 경로와 브라우저의 업로드 접근 모드를 맞춥니다. */
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
        const { userId } = await requireDirectUploadPrincipal(request, ["ADMIN"]);
        const parsed = requestSchema.safeParse(clientPayload ? JSON.parse(clientPayload) : null);
        if (!parsed.success) throw new Error("사진 정보가 올바르지 않습니다.");
        const rule = galleryImageRule(parsed.data.fileName, parsed.data.contentType);
        if (
          !rule ||
          pathname !==
            weeklyTextImagePath(parsed.data.requestId, userId, parsed.data.uploadId, rule.extension)
        ) {
          throw new Error("업로드 경로가 올바르지 않습니다.");
        }
        return reserveDirectUploadToken({
          expectedUrl: `https://${store.host}/${pathname}`,
          userId,
          contentType: rule.contentType,
          maximumSizeInBytes: maxGalleryImageBytes,
          tokenPayload: { ...parsed.data, userId, pathname },
        });
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const parsed = callbackSchema.safeParse(tokenPayload ? JSON.parse(tokenPayload) : null);
        if (!parsed.success || !isCurrentResourceUploadUrl(blob.url))
          throw new Error("완료 정보를 확인할 수 없습니다.");
        const rule = galleryImageRule(parsed.data.fileName, parsed.data.contentType);
        if (
          !rule ||
          parsed.data.pathname !==
            weeklyTextImagePath(
              parsed.data.requestId,
              parsed.data.userId,
              parsed.data.uploadId,
              rule.extension,
            ) ||
          blob.pathname !== parsed.data.pathname
        )
          throw new Error("완료 경로가 일치하지 않습니다.");
        if (
          !(await matchesStoredDirectImage(
            blob,
            maxGalleryImageBytes,
            rule.contentType,
            store.token,
          ))
        )
          throw new Error("사진 저장 정보를 확인할 수 없습니다.");
        await recordResourceUpload(blob.url, parsed.data.userId);
      },
    });
    return Response.json(result);
  } catch (error) {
    logServerError("api/weekly-text-image-uploads", error);
    return Response.json({ error: "업로드 요청을 처리할 수 없습니다." }, { status: 400 });
  }
}
