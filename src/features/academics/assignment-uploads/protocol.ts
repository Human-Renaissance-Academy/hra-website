/**
 * 과제 업로드의 Vercel SDK 토큰·서명 완료 영수증 프로토콜을 소유합니다.
 * 기존 Web API와 API v1은 동일 인가·예산·서명 검증을 사용하고 HTTP 오류/본문 읽기만 선택합니다.
 */
import "server-only";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { z } from "zod/v4";
import { authorizeAssignmentUploadToken } from "@/features/academics/assignment-uploads/server";
import { AcademicUploadError, academicUploadPath, assertAcademicUploadsEnabled } from "@/features/academics/assignment-uploads/contract";
import { academicSubmissionStore, matchesAcademicBlob } from "@/features/academics/assignment-uploads/store";
import { getUploadReceiptRecord, recordUploadReceipt } from "@/features/academics/assignment-uploads/repository";
import { assertUploadOrigin, readUploadJson, uploadErrorResponse } from "@/features/academics/assignment-uploads/http";
import { reserveUploadAttempt } from "@/lib/rate-limit";
import { extractClientIp } from "@/lib/rate-limit-core";
import { createAcademicObservation, type AcademicObservation } from "@/lib/academic-observability";

/** 기본값은 기존 Web API 계약이며 v1만 엄격한 HTTP 입력·공통 오류·비공개 헤더를 제공합니다. */
type UploadProtocolOptions = {
  readBody?: (request: Request) => Promise<unknown>;
  errorResponse?: (error: unknown, observation: AcademicObservation) => Response;
  responseHeaders?: Readonly<Record<string, string>>;
  // v1 어댑터만 토큰 요청에 인증 범위·Origin 정책을 제공하며 callback에는 적용하지 않습니다.
  tokenTransport?: {
    run: (handler: () => Promise<Response>) => Promise<Response>;
    assertOrigin: (request: Request) => void | Promise<void>;
  };
};
// 원본 JSON의 추가 속성을 보존해 SDK가 서명 검증에 같은 본문을 사용하게 한다.
const bodySchema=z.discriminatedUnion("type",[
  z.object({type:z.literal("blob.generate-client-token"),payload:z.object({pathname:z.string(),multipart:z.boolean(),clientPayload:z.string().nullable()}).passthrough()}).passthrough(),
  z.object({type:z.literal("blob.upload-completed"),payload:z.object({blob:z.object({url:z.string(),pathname:z.string(),downloadUrl:z.string(),contentType:z.string(),contentDisposition:z.string(),etag:z.string()}).passthrough(),tokenPayload:z.string().nullable().optional()}).passthrough()}).passthrough(),
]);
// Zod가 반환한 새 객체는 키 순서를 바꿀 수 있으므로 검증 뒤에도 원본 JSON을 SDK에 전달한다.
function isUploadBody(value:unknown):value is HandleUploadBody {return bodySchema.safeParse(value).success;}
/** JSON을 재구성하지 않고 그대로 SDK에 넘겨 공급자 서명의 원본 키 순서·추가 속성을 보존합니다. */
export async function handleAssignmentUploadProtocol(request: Request, options: UploadProtocolOptions = {}): Promise<Response> {
  let observation=createAcademicObservation("UPLOAD_TOKEN","UPLOAD_INTENT");
  try{
    assertAcademicUploadsEnabled();
    const body=await (options.readBody ?? readUploadJson)(request);if(!isUploadBody(body))throw new AcademicUploadError("INVALID_FILE");
    if(body.type==="blob.upload-completed")observation=createAcademicObservation("UPLOAD_RECEIPT","UPLOAD_INTENT");
    const execute = async (): Promise<Response> => {
    try {
    const result=await handleUpload({body,request,token:academicSubmissionStore().token,
      onBeforeGenerateToken:async(pathname,payload,multipart)=>{
        await (options.tokenTransport?.assertOrigin ?? assertUploadOrigin)(request);
        let input:unknown;try{input=JSON.parse(payload??"");}catch{throw new AcademicUploadError("INVALID_FILE");}
        const authorization=await authorizeAssignmentUploadToken(input,pathname,multipart,observation);
        const reservation=await reserveUploadAttempt(extractClientIp(request.headers));
        if(reservation.blocked)throw new AcademicUploadError("RATE_LIMITED",reservation.retryAfterSec);
        return authorization;
      },
      onUploadCompleted:async({blob,tokenPayload})=>{
        // SDK 서명 검증 뒤 실행한다. 사용자 세션 없이도 기존 원장 수신만 멱등 기록하며 VERIFIED로 만들지 않는다.
        let payload:unknown;try{payload=JSON.parse(tokenPayload??"");}catch{throw new AcademicUploadError("NOT_FOUND");}
        const selected=z.object({uploadIntentId:z.uuid()}).strict().safeParse(payload);if(!selected.success)throw new AcademicUploadError("NOT_FOUND");
        // SDK가 검증한 공급자 서명은 사용자 로그인 증명이 아니므로 actor는 null로 유지합니다.
        observation.identify({resourceId:selected.data.uploadIntentId});
        observation.emit("AUTHORIZED");
        const receipt=await getUploadReceiptRecord(selected.data.uploadIntentId);
        if(!receipt || receipt.storageKey!==academicUploadPath(selected.data.uploadIntentId) || blob.pathname!==receipt.storageKey || !matchesAcademicBlob(blob.url,receipt.storageKey))throw new AcademicUploadError("NOT_FOUND");
        await recordUploadReceipt(selected.data.uploadIntentId);
      },
    });
    observation.emit("COMPLETED");
    return Response.json(result,{headers:{"Cache-Control":"no-store",...options.responseHeaders,"X-Request-Id":observation.correlationId}});
    } catch(error) { return (options.errorResponse ?? uploadErrorResponse)(error, observation); }
    };
    // 검증된 원본 객체를 한 번만 읽고 SDK에 그대로 전달합니다. 완료 권한은 SDK 서명만 제공합니다.
    return body.type === "blob.generate-client-token" && options.tokenTransport
      ? options.tokenTransport.run(execute) : execute();
  }catch(error){return (options.errorResponse ?? uploadErrorResponse)(error,observation);}
}
