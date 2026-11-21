// @vitest-environment node
/** 요청별 CSP의 최소 출처, 기존 파일 정책, 설치된 Sonner CSS 계약을 검증한다. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

it("기존 전역 보안 헤더와 PDF의 같은 출처 임베드 경계를 유지한다", async () => {
  const rules = await nextConfig.headers?.();
  expect(Array.isArray(rules)).toBe(true);
  const global = rules?.find((rule) => rule.source === "/:path*");
  expect(global?.headers).toEqual(
    expect.arrayContaining([
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ]),
  );
  // 자료실 파일 기본은 sandbox 첨부 경계이고, inline=1 미리보기만 뒤에서 PDF 임베드 정책으로 덮는다(#513).
  const download =
    rules?.filter((rule) => rule.source === "/api/resources/:kind/:id/download") ?? [];
  expect(download).toHaveLength(2);
  const [attachment, inline] = download;
  expect(attachment.has).toBeUndefined();
  expect(attachment.headers).toContainEqual({ key: "X-Frame-Options", value: "SAMEORIGIN" });
  expect(attachment.headers).toContainEqual({
    key: "Content-Security-Policy",
    value: "sandbox; default-src 'none'; frame-ancestors 'self'",
  });
  expect(inline.has).toEqual([{ type: "query", key: "inline", value: "1" }]);
  expect(inline.headers).toEqual([
    {
      key: "Content-Security-Policy",
      value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'; form-action 'self'",
    },
  ]);
  // 같은 키는 뒤 규칙이 우선하므로 API 기본 → 첨부 sandbox → inline 미리보기 순서를 고정한다.
  const apiIndex = rules?.findIndex((rule) => rule.source === "/api/:path*") ?? -1;
  expect(rules?.indexOf(attachment)).toBeGreaterThan(apiIndex);
  expect(rules?.indexOf(inline)).toBeGreaterThan(rules?.indexOf(attachment) ?? -1);
  expect(rules?.find((rule) => rule.source === "/api/:path*")?.headers).toContainEqual({
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'",
  });
  const academic = rules?.find(
    (rule) => rule.source === "/api/academic/submissions/:id/file/:fileId",
  );
  expect(academic?.headers).toContainEqual({
    key: "Content-Security-Policy",
    value: "sandbox; default-src 'none'",
  });
  expect(rules?.indexOf(academic!)).toBeGreaterThan(
    rules?.findIndex((rule) => rule.source === "/api/:path*") ?? -1,
  );
  // #162 검토자 다운로드도 정적 헤더가 Route 응답을 덮으므로 일반 API CSP 뒤에서 sandbox를 고정해야 한다.
  const reviewer = rules?.find(
    (rule) => rule.source === "/api/academic/reviews/submissions/:id/file/:fileId",
  );
  expect(reviewer?.headers).toContainEqual({
    key: "Content-Security-Policy",
    value: "sandbox; default-src 'none'",
  });
  expect(rules?.indexOf(reviewer!)).toBeGreaterThan(
    rules?.findIndex((rule) => rule.source === "/api/:path*") ?? -1,
  );
});

// 공급자 모듈은 실행하지 않고 TypeScript AST의 정적 문자열 인수만 읽는다.
function installedSonnerCss(extension: string) {
  const source = ts.createSourceFile(
    "sonner.js",
    readFileSync(
      new URL(`../../node_modules/sonner/dist/index.${extension}`, import.meta.url),
      "utf8",
    ),
    ts.ScriptTarget.Latest,
    true,
  );
  const values: string[] = [];
  function visit(node: ts.Node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "__insertCSS"
    ) {
      expect(node.arguments.length).toBe(1);
      const argument = node.arguments[0];
      if (!ts.isStringLiteral(argument)) throw new Error("SONNER_CSS_NOT_STATIC");
      values.push(argument.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  expect(values).toHaveLength(1);
  return values[0];
}

it("설치된 CJS/ESM Sonner 스타일이 검토한 hash와 정확히 일치한다", () => {
  for (const extension of ["js", "mjs"]) {
    const css = installedSonnerCss(extension);
    expect(Buffer.byteLength(css)).toBe(14916);
    expect(createHash("sha256").update(css).digest("base64")).toBe(
      "StEaX+se6YS7pqjzrzMIA0KaX9zF/8zAhvQXZAe5epY=",
    );
    expect(
      createHash("sha256")
        .update(css + " ")
        .digest("base64"),
    ).not.toBe("StEaX+se6YS7pqjzrzMIA0KaX9zF/8zAhvQXZAe5epY=");
  }
});

// 생성기의 입력을 바꿔 허용 출처와 실행 모드가 넓어지는 회귀를 검출한다.
describe("요청별 CSP", () => {
  it("production은 nonce와 strict-dynamic을 필수로 두고 출처를 제한한다", async () => {
    const { createContentSecurityPolicy, requireCspNonce } = await import("@/lib/security/csp");
    const nonce = Buffer.alloc(32, 7).toString("base64");
    const policy = createContentSecurityPolicy(nonce, false);
    expect(policy).toContain(`script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`);
    expect(policy).toContain("style-src-attr 'unsafe-inline'");
    expect(policy).toContain("connect-src 'self' https://vercel.com/api/blob/");
    expect(policy).toContain(
      "img-src 'self' data: blob: https://4sompt13gxwuz2x8.public.blob.vercel-storage.com",
    );
    expect(policy).toContain("'sha256-StEaX+se6YS7pqjzrzMIA0KaX9zF/8zAhvQXZAe5epY='");
    expect(policy).toContain("'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='");
    expect(policy).not.toMatch(/unsafe-eval|officeapps|\*|upgrade-insecure-requests/);
    expect(policy.split(";").find((value) => value.trim().startsWith("script-src "))).not.toContain(
      "unsafe-inline",
    );
    expect(createContentSecurityPolicy(nonce, true)).toContain("'unsafe-eval'");
    expect(requireCspNonce(nonce)).toBe(nonce);
    for (const invalid of [null, "", "attacker", `${nonce}; script-src *`]) {
      expect(() => requireCspNonce(invalid)).toThrow("CSP_NONCE_MISSING");
      expect(() => createContentSecurityPolicy(invalid ?? "", false)).toThrow("CSP_NONCE_MISSING");
    }
  });
});

// Auth.js의 네트워크 작업을 대체하되 원본 요청·이벤트·응답의 실제 헤더 의미를 유지한다.
const authState = vi.hoisted(() => ({
  calls: [] as { request: Request; event: unknown }[],
  mode: "next" as "next" | "redirect" | "forbidden" | "error",
}));
vi.mock("@/lib/auth", () => ({
  auth: (next: () => Response) => async (request: Request, event: unknown) => {
    authState.calls.push({ request, event });
    if (authState.mode === "error") throw new Error("SYNTHETIC_AUTH_ERROR");
    const response =
      authState.mode === "redirect"
        ? new Response(null, { status: 302, headers: { location: "/login" } })
        : authState.mode === "forbidden"
          ? new Response(null, { status: 403 })
          : next();
    response.headers.append("set-cookie", "synthetic=session; HttpOnly");
    return response;
  },
}));
vi.mock("@/lib/errors", () => ({ logServerError: vi.fn() }));
import { vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { NextFetchEvent } from "next/dist/server/web/spec-extension/fetch-event";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import proxy, { config } from "../../src/proxy";

beforeEach(() => {
  authState.calls = [];
  authState.mode = "next";
});

function requestAndEvent(path: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  const request = new NextRequest(`https://synthetic.invalid${path}`, init);
  const event = new NextFetchEvent({ request, page: path, context: undefined });
  return { request, event };
}

it("보호 경로에서만 인증하고 API와 정적 자원을 matcher에서 제외한다", async () => {
  for (const path of [
    "/admin",
    "/admin/docs",
    "/admin/report.pdf",
    "/resources",
    "/member/x",
    "/mypage",
  ]) {
    const { request, event } = requestAndEvent(path);
    await proxy(request, event);
    expect(authState.calls.at(-1)).toEqual({ request, event });
  }
  const count = authState.calls.length;
  for (const path of [
    "/",
    "/login",
    "/system-error",
    "/not-found",
    "/administrator",
    "/membership",
    "/api/health",
    "/_next/static/x.js",
  ]) {
    const { request, event } = requestAndEvent(path);
    await proxy(request, event);
  }
  expect(authState.calls).toHaveLength(count);
  for (const path of [
    "/api",
    "/api/health",
    "/_next/static/x.js",
    "/_next/image",
    "/favicon.ico",
    "/images/hero-bg.jpeg",
    "/globe.svg",
  ]) {
    expect(
      unstable_doesMiddlewareMatch({ config, url: `https://synthetic.invalid${path}` }),
      path,
    ).toBe(false);
  }
  for (const path of [
    "/",
    "/login",
    "/system-error",
    "/missing",
    "/apiary",
    "/resources/x/print",
    "/admin/report.pdf",
    "/missing.html",
    "/robots.txt",
    "/images/missing.svg",
  ]) {
    expect(
      unstable_doesMiddlewareMatch({ config, url: `https://synthetic.invalid${path}` }),
      path,
    ).toBe(true);
  }
});

it("외부 nonce를 덮어쓰고 동시 요청과 원본 본문을 보존한다", async () => {
  const body = new FormData();
  body.set("body", "합성 본문 원형");
  const { request, event } = requestAndEvent("/resources", {
    method: "POST",
    body,
    headers: { "x-nonce": "spoofed", "Content-Security-Policy": "script-src *" },
  });
  const reads = [
    vi.spyOn(request, "clone"),
    vi.spyOn(request, "text"),
    vi.spyOn(request, "arrayBuffer"),
    vi.spyOn(request, "formData"),
  ];
  const responses = await Promise.all([
    proxy(request, event),
    (() => {
      const second = requestAndEvent("/resources");
      return proxy(second.request, second.event);
    })(),
  ]);
  const nonces = responses.map((response) => response.headers.get("x-middleware-request-x-nonce"));
  expect(new Set(nonces).size).toBe(2);
  for (const [index, response] of responses.entries()) {
    expect(nonces[index]).toMatch(/^[A-Za-z0-9+/]{43}=$/);
    expect(response.headers.get("Content-Security-Policy")).toContain(`'nonce-${nonces[index]}'`);
    expect(response.headers.get("x-middleware-request-content-security-policy")).toBe(
      response.headers.get("Content-Security-Policy"),
    );
    expect(response.headers.get("set-cookie")).toContain("synthetic=session");
  }
  for (const read of reads) expect(read).not.toHaveBeenCalled();
  expect(request.bodyUsed).toBe(false);
  expect((await request.formData()).get("body")).toBe("합성 본문 원형");
});

it("인증 redirect·거부·장애의 fail-closed와 쿠키를 보존한다", async () => {
  for (const [mode, status] of [
    ["redirect", 302],
    ["forbidden", 403],
    ["error", 307],
  ] as const) {
    authState.mode = mode;
    const { request, event } = requestAndEvent("/admin");
    const response = await proxy(request, event);
    expect(response.status).toBe(status);
    expect(response.headers.get("Content-Security-Policy")).toContain("'strict-dynamic'");
    if (mode === "redirect") expect(response.headers.get("location")).toBe("/login");
    if (mode === "error")
      expect(response.headers.get("location")).toBe("https://synthetic.invalid/system-error");
    else expect(response.headers.get("set-cookie")).toContain("synthetic=session");
  }
});
