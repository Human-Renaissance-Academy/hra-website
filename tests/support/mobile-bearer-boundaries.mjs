/** 원시 불완전 HTTP 본문, 제한 소진 후 재사용, DB 왕복 계측을 격리 서버에서 검증합니다. */
import { connect } from "node:net";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { check, expectStatus, hash, pass } from "./mobile-bearer-http.mjs";

function stalledPost(origin, bytes) {
  const url = new URL(origin);
  return new Promise((resolve, reject) => {
    const socket = connect({ host: "127.0.0.1", port: Number(url.port) });
    let response = "";
    const timer = setTimeout(() => { socket.destroy(); reject(new Error("MOBILE_SLOW_BODY_TIMEOUT")); }, 6_000);
    socket.once("connect", () => socket.write(`POST /api/v1/auth/logout-all HTTP/1.1\r\nHost: ${url.host}\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n${bytes ? "1\r\nx\r\n" : ""}`));
    socket.on("data", chunk => {
      response += chunk.toString("ascii");
      const status = response.match(/^HTTP\/1\.1 (\d{3})/);
      if (status) { clearTimeout(timer); socket.destroy(); resolve(Number(status[1])); }
    });
    socket.once("error", () => { clearTimeout(timer); reject(new Error("MOBILE_SLOW_BODY_SOCKET")); });
  });
}

export async function verifySlowBodies({ origin, http: h }) {
  for (const bytes of [false, true]) {
    const status = await stalledPost(origin, bytes);
    check(bytes ? status === 400 : status >= 400 && status < 600, "SLOW_BODY_STATUS");
    await expectStatus(await h.request("/api/v1/notices"), 200, "SLOW_BODY_SERVER_ALIVE");
  }
  pass("SLOW_LOGOUT_ALL_BOUND");
}

export async function verifyRefreshExhaustion({ http: h, cluster }) {
  // Given: 독립 여정의 시작에서만 예산을 비운다. 아래 12회부터 재사용까지는 초기화하지 않는다.
  cluster.sql("TRUNCATE rate_limit_events");
  const original = await h.login();
  let current = original;
  for (let index = 0; index < 12; index++) {
    const response = await h.refresh(current);
    check(response.status === 200, "BUDGET_ROTATION");
    current = (await response.json()).session;
  }
  const snapshot = () => cluster.sql(`SELECT json_build_object('access',access_hash,'refresh',refresh_hash,'rotated',rotated_at,
    'history',(SELECT count(*) FROM mobile_session_refresh_history h WHERE h.session_id=s.id)) FROM mobile_sessions s WHERE refresh_hash='${hash(current.refreshToken)}'`);
  const before = snapshot();
  // When: 현재 토큰을 반복 제시해도 추가 자격을 발급하지 않는다.
  for (let index = 0; index < 3; index++) {
    const response = await h.refresh(current);
    check(response.status === 429, "BUDGET_13TH_429");
    const body = await response.json();
    check(body.error.code === "RATE_LIMITED" && body.error.retryAfterSeconds > 0 &&
      response.headers.get("retry-after") === String(body.error.retryAfterSeconds) && !body.session, "BUDGET_RETRY_AFTER");
    check(snapshot() === before, "BUDGET_NO_ROTATION");
  }
  await expectStatus(await h.me(current), 200, "BUDGET_CURRENT_ALIVE");
  cluster.sql(`UPDATE mobile_sessions SET created_at=created_at-interval '20 seconds',rotated_at=rotated_at-interval '20 seconds' WHERE refresh_hash='${hash(current.refreshToken)}'`);
  // Then: 소진된 예산도 오래된 소비 토큰의 가족 회수를 막지 못한다.
  await expectStatus(await h.refresh(original), 401, "BUDGET_REPLAY");
  await expectStatus(await h.me(current), 401, "BUDGET_ATTACKER_REVOKED");
  await expectStatus(await h.refresh(current), 401, "BUDGET_FAMILY_REVOKED");
  pass("REFRESH_EXHAUSTION_REPLAY");
  cluster.sql("TRUNCATE rate_limit_events");
}

export async function measureStatements({ cluster, http: h }) {
  const session = await h.login();
  const path = join(cluster.root, "mobile-statements.count");
  const count = () => existsSync(path) ? statSync(path).size : 0;
  const before = count();
  await expectStatus(await h.me(session), 200, "ME_MEASURE");
  const me = count() - before, mutationStart = count();
  await expectStatus(await h.json("/api/v1/auth/logout-all", undefined, h.bearer(session)), 204, "MUTATION_MEASURE");
  const mutation = count() - mutationStart;
  check(me > 0 && mutation > 0, "STATEMENT_COUNTER_ACTIVE");
  console.log(`PASS MOBILE_DB_STATEMENTS me=${me} logout-all=${mutation} method=counting-proxy`);
}
