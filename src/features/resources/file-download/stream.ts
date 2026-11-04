/**
 * 공동 자료 API 파일 응답의 공급자 스트림 취소·오류 정리 경계입니다.
 * 응답 시작 뒤에는 JSON 오류로 바꿀 수 없으므로 원문 없는 고정 스트림 오류만 전달합니다.
 * 기존 Web 다운로드 경로(`/api/resources/[kind]/[id]/download`)의 보호 스트림과 같은 정리 순서를 따릅니다.
 */
import "server-only";
import { logServerError } from "@/lib/errors";

/** 공급자 reader를 한 번만 해제하고, 클라이언트 취소를 공급자 스트림까지 전파합니다. */
export function protectedResourceStream(source: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  let released = false;
  let terminal = false;
  let cancelled = false;
  const release = () => { if (!released) { released = true; reader.releaseLock(); } };
  // 취소 실패 원인·사용자 취소 사유는 로그에 남기지 않고 고정 코드만 기록합니다.
  const cancelReader = async () => {
    try { await reader.cancel(); }
    catch { logServerError("api-v1/resources/file/cancel", new Error("RESOURCE_STREAM_CANCEL_FAILED")); }
    finally { release(); }
  };
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await reader.read();
        if (cancelled) return;
        if (next.done) { terminal = true; release(); controller.close(); }
        else controller.enqueue(next.value);
      } catch {
        if (cancelled) return;
        terminal = true;
        logServerError("api-v1/resources/file/stream", new Error("RESOURCE_STREAM_INTERRUPTED"));
        await cancelReader();
        // 정리 중 응답이 취소되었으면 닫힌 controller에 오류를 다시 보내지 않습니다.
        if (!cancelled) controller.error(new Error("파일 전송이 중단되었습니다."));
      }
    },
    async cancel() {
      cancelled = true;
      if (terminal) return;
      terminal = true;
      await cancelReader();
    },
  });
}
