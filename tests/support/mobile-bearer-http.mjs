/** 실제 HTTP 공통 경계. 실패에는 상태·고정 사례명만 남기고 응답 원문과 자격 증명은 숨긴다. */
import { createHash } from "node:crypto";
import { academicG1Actors } from "./academic-g1-fixture.mjs";
import { qaPassword } from "./resource-qa-postgres.mjs";

export function check(value, code) { if (!value) throw new Error(`MOBILE_${code}`); }
export const pass = code => console.log(`PASS MOBILE_${code}`);
export const hash = value => createHash("sha256").update(value).digest("hex");

export function createMobileHttp(origin) {
  const request = async (path, options = {}) => {
    const response = await fetch(`${origin}${path}`, { ...options, redirect: "manual", signal: AbortSignal.timeout(30_000) });
    if (path.startsWith("/api/v1/auth/")) {
      check(response.headers.get("cache-control") === "private, no-store", "AUTH_CACHE");
      check(!response.headers.has("set-cookie"), "AUTH_COOKIE");
    }
    return response;
  };
  const json = (path, body, headers = {}) => request(path, { method: "POST",
    headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const login = async (name = "studentA") => {
    const response = await json("/api/v1/auth/login", { email: academicG1Actors[name].email, password: qaPassword });
    check(response.status === 200, `LOGIN_${name.toUpperCase()}_${response.status}`);
    const body = await response.json();
    check(body.user.id === academicG1Actors[name].id, "LOGIN_ID");
    return body.session;
  };
  const bearer = session => ({ Authorization: `Bearer ${session.accessToken}` });
  const me = session => request("/api/v1/me", { headers: bearer(session) });
  const refresh = session => json("/api/v1/auth/refresh", { refreshToken: session.refreshToken });
  return { request, json, login, bearer, me, refresh };
}

/** 쿠키도 합성하지 않고 Auth.js의 정상 CSRF/credentials 왕복으로 얻는다. */
export async function webLogin(origin) {
  const csrfResponse = await fetch(`${origin}/api/auth/csrf`, { redirect: "manual" });
  const pairs = csrfResponse.headers.getSetCookie().map(value => value.split(";", 1)[0]);
  const csrf = await csrfResponse.json();
  const response = await fetch(`${origin}/api/auth/callback/credentials`, { method: "POST", redirect: "manual",
    headers: { Origin: origin, Cookie: pairs.join("; "), "Content-Type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1" },
    body: new URLSearchParams({ csrfToken: csrf.csrfToken, email: academicG1Actors.studentA.email, password: qaPassword, callbackUrl: origin }) });
  await response.body?.cancel();
  return [...pairs, ...response.headers.getSetCookie().map(value => value.split(";", 1)[0])].join("; ");
}

export async function expectStatus(response, status, code) {
  check(response.status === status, `${code}_STATUS_${response.status}`);
  if (status >= 400) {
    const body = await response.json();
    check(typeof body.error?.code === "string" && typeof body.error.requestId === "string", `${code}_ENVELOPE`);
    return body;
  }
  await response.body?.cancel();
}
