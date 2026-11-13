/** 본문 편집기 이미지의 직접 업로드 토큰·완료 콜백·삽입 전 검증 API입니다 (#102). */
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { z } from "zod/v4";
import { requireDirectUploadPrincipal } from "@/lib/direct-upload-principal";
import { reserveDirectUploadToken } from "@/features/uploads/direct-upload/service";
import { matchesStoredDirectImage } from "@/features/uploads/direct-upload/blob";
import { auth } from "@/lib/auth";
import { projectBlobHost } from "@/lib/blob-host";
import {
  editorImageContentTypes,
  editorImagePath,
  maxEditorImageBytes,
} from "@/lib/editor-image-upload-contract";
import { validateEditorImageReference } from "@/lib/editor-image-upload-server";
import { logServerError } from "@/lib/errors";
import { reserveUploadAttempt } from "@/lib/rate-limit";
import { extractClientIp } from "@/lib/rate-limit-core";
import { isProjectBlobUrl } from "@/lib/resource-download";
import { recordResourceUpload } from "@/lib/resource-upload-server";

const requestSchema = z.object({
  uploadId: z.uuid(),
  extension: z.enum(["jpg", "png", "webp", "gif"]),
  size: z.number().int().positive().max(maxEditorImageBytes),
});
const callbackSchema = requestSchema
  .pick({ uploadId: true, extension: true })
  .extend({ userId: z.uuid(), pathname: z.string() });
const verifySchema = z.object({ type: z.literal("editor.verify"), url: z.url() });

export async function POST(request: Request): Promise<Response> {
  try {
    const raw = await request.json();
    const verification = verifySchema.safeParse(raw);
    if (verification.success) {
      const session = await auth();
      if (!session?.user?.id || !["ADMIN", "FACULTY", "MEMBER"].includes(session.user.role)) {
        return Response.json({ error: "업로드 권한이 없습니다." }, { status: 403 });
      }
      const valid = await validateEditorImageReference(session.user.id, verification.data.url);
      return valid
        ? Response.json({ url: verification.data.url })
        : Response.json({ error: "이미지를 확인할 수 없습니다." }, { status: 400 });
    }

    const result = await handleUpload({
      body: raw as HandleUploadBody,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const { userId } = await requireDirectUploadPrincipal(request, [
          "ADMIN",
          "FACULTY",
          "MEMBER",
        ]);
        const limit = await reserveUploadAttempt(extractClientIp(request.headers));
        if (limit.blocked) throw new Error("업로드 요청이 너무 많습니다.");
        const parsed = requestSchema.safeParse(clientPayload ? JSON.parse(clientPayload) : null);
        if (
          !parsed.success ||
          pathname !== editorImagePath(parsed.data.uploadId, parsed.data.extension)
        ) {
          throw new Error("이미지 정보가 올바르지 않습니다.");
        }
        return reserveDirectUploadToken({
          expectedUrl: `https://${projectBlobHost}/${pathname}`,
          userId,
          contentType: editorImageContentTypes[parsed.data.extension],
          maximumSizeInBytes: maxEditorImageBytes,
          tokenPayload: { ...parsed.data, userId, pathname },
        });
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const parsed = callbackSchema.safeParse(tokenPayload ? JSON.parse(tokenPayload) : null);
        if (!parsed.success || !isProjectBlobUrl(blob.url))
          throw new Error("완료 정보를 확인할 수 없습니다.");
        if (
          parsed.data.pathname !== editorImagePath(parsed.data.uploadId, parsed.data.extension) ||
          blob.pathname !== parsed.data.pathname
        )
          throw new Error("완료 경로가 일치하지 않습니다.");
        if (
          !(await matchesStoredDirectImage(
            blob,
            maxEditorImageBytes,
            editorImageContentTypes[parsed.data.extension],
          ))
        )
          throw new Error("이미지 저장 정보를 확인할 수 없습니다.");
        await recordResourceUpload(blob.url, parsed.data.userId);
      },
    });
    return Response.json(result);
  } catch (error) {
    logServerError("api/editor-image-uploads", error);
    return Response.json({ error: "업로드 요청을 처리할 수 없습니다." }, { status: 400 });
  }
}
