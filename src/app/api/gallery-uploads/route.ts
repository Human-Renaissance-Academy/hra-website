/** 갤러리 이미지의 관리자 전용 직접 업로드 토큰·완료 콜백입니다 (#102). */
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { z } from "zod/v4";
import { galleryExistsForDirectUpload } from "@/features/gallery/admin/service";
import { requireDirectUploadPrincipal } from "@/lib/direct-upload-principal";
import { reserveDirectUploadToken } from "@/features/uploads/direct-upload/service";
import { matchesStoredDirectImage } from "@/features/uploads/direct-upload/blob";
import { projectBlobHost } from "@/lib/blob-host";
import { logServerError } from "@/lib/errors";
import {
  galleryImageRule,
  galleryUploadPath,
  maxGalleryImageBytes,
} from "@/lib/gallery-upload-contract";
import { isProjectBlobUrl } from "@/lib/resource-download";
import { recordResourceUpload } from "@/lib/resource-upload-server";

const requestSchema = z.object({
  galleryId: z.uuid(),
  uploadId: z.uuid(),
  fileName: z.string().min(1).max(255),
  size: z.number().int().positive().max(maxGalleryImageBytes),
  contentType: z.string(),
});
const callbackSchema = requestSchema
  .pick({ galleryId: true, uploadId: true, fileName: true, contentType: true })
  .extend({ userId: z.uuid(), pathname: z.string() });

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as HandleUploadBody;
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const { userId } = await requireDirectUploadPrincipal(request, ["ADMIN"]);
        const parsed = requestSchema.safeParse(clientPayload ? JSON.parse(clientPayload) : null);
        if (!parsed.success) throw new Error("파일 정보가 올바르지 않습니다.");
        const rule = galleryImageRule(parsed.data.fileName, parsed.data.contentType);
        if (!rule) throw new Error("이미지 형식이 올바르지 않습니다.");
        const expectedPath = galleryUploadPath(
          parsed.data.galleryId,
          userId,
          parsed.data.uploadId,
          rule.extension,
        );
        if (pathname !== expectedPath) throw new Error("업로드 대상이 올바르지 않습니다.");
        const gallery = await galleryExistsForDirectUpload(
          { userId, role: "ADMIN" },
          parsed.data.galleryId,
        );
        if (!gallery) throw new Error("앨범을 찾을 수 없습니다.");
        return reserveDirectUploadToken({
          expectedUrl: `https://${projectBlobHost}/${pathname}`,
          userId,
          contentType: rule.contentType,
          maximumSizeInBytes: maxGalleryImageBytes,
          tokenPayload: { ...parsed.data, userId, pathname },
        });
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const parsed = callbackSchema.safeParse(tokenPayload ? JSON.parse(tokenPayload) : null);
        if (!parsed.success || !isProjectBlobUrl(blob.url))
          throw new Error("완료 정보를 확인할 수 없습니다.");
        const rule = galleryImageRule(parsed.data.fileName, parsed.data.contentType);
        if (
          !rule ||
          parsed.data.pathname !==
            galleryUploadPath(
              parsed.data.galleryId,
              parsed.data.userId,
              parsed.data.uploadId,
              rule.extension,
            ) ||
          blob.pathname !== parsed.data.pathname
        )
          throw new Error("완료 경로가 일치하지 않습니다.");
        if (!(await matchesStoredDirectImage(blob, maxGalleryImageBytes, rule.contentType)))
          throw new Error("파일 저장 정보를 확인할 수 없습니다.");
        await recordResourceUpload(blob.url, parsed.data.userId);
      },
    });
    return Response.json(result);
  } catch (error) {
    logServerError("api/gallery-uploads", error);
    return Response.json({ error: "업로드 요청을 처리할 수 없습니다." }, { status: 400 });
  }
}
