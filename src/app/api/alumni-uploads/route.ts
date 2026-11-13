/** 수료생 사진의 관리자 전용 업로드 토큰과 완료 콜백입니다 (#102). */
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { z } from "zod/v4";
import { requireDirectUploadPrincipal } from "@/lib/direct-upload-principal";
import { reserveDirectUploadToken } from "@/features/uploads/direct-upload/service";
import { matchesStoredDirectImage } from "@/features/uploads/direct-upload/blob";
import {
  alumniImageRule,
  alumniUploadPath,
  maxAlumniImageBytes,
} from "@/lib/alumni-upload-contract";
import { projectBlobHost } from "@/lib/blob-host";
import { logServerError } from "@/lib/errors";
import { isProjectBlobUrl } from "@/lib/resource-download";
import { recordResourceUpload } from "@/lib/resource-upload-server";

const requestSchema = z.object({
  storyId: z.uuid(),
  uploadId: z.uuid(),
  fileName: z.string().min(1).max(255),
  size: z.number().int().positive().max(maxAlumniImageBytes),
  contentType: z.string(),
});
const callbackSchema = requestSchema
  .pick({ storyId: true, uploadId: true, fileName: true, contentType: true })
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
        if (!parsed.success) throw new Error("사진 정보가 올바르지 않습니다.");
        const rule = alumniImageRule(parsed.data.fileName, parsed.data.contentType);
        if (
          !rule ||
          pathname !==
            alumniUploadPath(parsed.data.storyId, userId, parsed.data.uploadId, rule.extension)
        ) {
          throw new Error("업로드 경로가 올바르지 않습니다.");
        }
        // 콜백·저장 요청이 중단돼도 업로드를 추적할 수 있도록 토큰 발급 시 원장에 남깁니다.
        return reserveDirectUploadToken({
          expectedUrl: `https://${projectBlobHost}/${pathname}`,
          userId,
          contentType: rule.contentType,
          maximumSizeInBytes: maxAlumniImageBytes,
          tokenPayload: { ...parsed.data, userId, pathname },
        });
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const parsed = callbackSchema.safeParse(tokenPayload ? JSON.parse(tokenPayload) : null);
        if (!parsed.success || !isProjectBlobUrl(blob.url))
          throw new Error("완료 정보를 확인할 수 없습니다.");
        const rule = alumniImageRule(parsed.data.fileName, parsed.data.contentType);
        if (
          !rule ||
          parsed.data.pathname !==
            alumniUploadPath(
              parsed.data.storyId,
              parsed.data.userId,
              parsed.data.uploadId,
              rule.extension,
            ) ||
          blob.pathname !== parsed.data.pathname
        )
          throw new Error("완료 경로가 일치하지 않습니다.");
        if (!(await matchesStoredDirectImage(blob, maxAlumniImageBytes, rule.contentType)))
          throw new Error("사진 저장 정보를 확인할 수 없습니다.");
        await recordResourceUpload(blob.url, parsed.data.userId);
      },
    });
    return Response.json(result);
  } catch (error) {
    logServerError("api/alumni-uploads", error);
    return Response.json({ error: "업로드 요청을 처리할 수 없습니다." }, { status: 400 });
  }
}
