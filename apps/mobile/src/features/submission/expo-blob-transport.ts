/** SDK 58 File.upload의 논리적 PUT 시도입니다. redirect·연결 복구 재전송은 JS 옵션으로 끌 수 없습니다.
 * UploadOptions와 Android FileSystemUploadTask의 OkHttp 기본 정책을 따르므로 항상 서버 verify가 뒤따릅니다.
 */
import { File, UploadType } from 'expo-file-system';
import type { BlobPutTransport } from './blob-upload';

export const expoBlobTransport: BlobPutTransport = async (request) => {
  const result = await new File(request.fileUri).upload(request.url, {
    httpMethod: 'PUT', uploadType: UploadType.BINARY_CONTENT, headers: { ...request.headers },
    signal: request.signal, sessionType: 'foreground',
    onProgress: ({ bytesSent }) => request.onProgress(bytesSent),
  });
  let body: unknown = null;
  try { body = JSON.parse(result.body); } catch (error) { if (!(error instanceof SyntaxError)) throw error; }
  return { status: result.status, body };
};
