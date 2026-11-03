/**
 * 공개 페이지 검증에서 브라우저의 외부 통신을 차단하는 공통 픽스처다.
 * 격리 원점 환경 변수가 없는 일반 Playwright 실행은 기존 동작을 유지한다.
 */
import { test as base, expect } from "@playwright/test";

export { expect };
export type { Page } from "@playwright/test";

export const test = base.extend({
  context: async ({ context }, runFixture) => {
    const configured = process.env.HRA_PUBLIC_E2E_ORIGIN;
    if (!configured) { await runFixture(context); return; }
    // Playwright의 TS 로더와 별도 ESM 리포터 사이의 모듈 캐시를 공유하지 않는다.
    const targetOrigin = new URL(configured);
    if (targetOrigin.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(targetOrigin.hostname) ||
        targetOrigin.username || targetOrigin.password || targetOrigin.origin !== configured) {
      throw new Error("E2E_PUBLIC_ORIGIN_INVALID");
    }
    const origin = targetOrigin.origin;
    let blocked = 0;
    let routeFailed = false;
    const active = new Set<Promise<void>>();
    // 브라우저 URL 의미를 바꾸지 않도록 리디렉션은 따라가지 않고 실패 처리한다.
    // 이 검증의 여섯 공개 명세는 직접 응답하는 페이지에만 의존한다.
    await context.route("**/*", (route) => {
      const work = (async () => {
        if (new URL(route.request().url()).origin !== origin) {
          blocked += 1;
          await route.abort("blockedbyclient");
          return;
        }
        const response = await route.fetch({ maxRedirects: 0 });
        if ([301, 302, 303, 307, 308].includes(response.status())) {
          blocked += 1;
          await response.dispose();
          await route.abort("blockedbyclient");
          return;
        }
        await route.fulfill({ response });
        await response.dispose();
      })();
      active.add(work);
      // 반환한 Promise는 Playwright가 관찰하며 파생 rejection을 방치하지 않는다.
      return work.then(() => { active.delete(work); }, () => {
        active.delete(work);
        routeFailed = true;
        throw new Error("E2E_PUBLIC_ROUTE_FAILED");
      });
    });
    // production 공개 화면은 WebSocket을 사용하지 않으므로 연결 전에 모두 차단한다.
    await context.routeWebSocket(/.*/, async (socket) => {
      blocked += 1;
      await socket.close();
    });
    try { await runFixture(context); }
    finally {
      // 종료 대기 중에도 새 요청은 마지막 등록 우선순위의 거부 규칙으로 차단한다.
      // 라우트를 없앤 뒤 기다리면 context가 닫히기 전 외부 통신 허용 틈이 생긴다.
      await context.route("**/*", async (route) => {
        if (new URL(route.request().url()).origin !== origin) blocked += 1;
        await route.abort("blockedbyclient");
      });
      while (active.size) {
        const settled = await Promise.allSettled([...active]);
        if (settled.some(result => result.status === "rejected")) routeFailed = true;
      }
      if (routeFailed) throw new Error("E2E_PUBLIC_ROUTE_FAILED");
      expect(blocked, "외부 브라우저 요청은 허용하지 않는다").toBe(0);
    }
  },
});
