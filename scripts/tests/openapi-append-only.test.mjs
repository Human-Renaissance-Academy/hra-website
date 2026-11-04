/**
 * OpenAPI 추가 전용 검증의 허용·거부 경계를 합성 JSON으로 고정합니다.
 * 실제 DB·네트워크·Git을 열지 않고 진단 코드만 비교합니다.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { routePathFromFile, validateOpenApiAppendOnly } from "../_lib/openapi-append-only.mjs";

function fixture() {
  return {
    openapi: "3.1.1",
    info: { title: "합성 API", version: "0.1.0" },
    paths: {
      "/api/v1/notices": {
        get: { operationId: "listNotices", responses: {
          "200": { content: { "application/json": { schema: { $ref: "#/components/schemas/NoticeList" } } } },
        } },
      },
    },
    components: { schemas: {
      NoticeList: { type: "object", properties: { items: { type: "array", items: { $ref: "#/components/schemas/Notice" } } } },
      Notice: { type: "object", properties: { id: { type: "string" } } },
    } },
  };
}
const routes = ["/api/v1/notices"];
const validate = (current, previous = null, routePaths = routes) =>
  validateOpenApiAppendOnly({ previous, current, routePaths });

test("현 계약의 형태·구현 경로·로컬 참조가 정확하면 self 검사 통과", () => {
  assert.deepEqual(validate(fixture()), []);
});

test("기존 값을 보존한 새 path와 새 schema만 허용하고 객체 key 순서는 무시", () => {
  const prior = fixture(), current = structuredClone(prior);
  current.paths["/api/v1/me"] = { get: { operationId: "getMe", responses: {
    "200": { content: { "application/json": { schema: { $ref: "#/components/schemas/Me" } } } },
  } } };
  current.components.schemas.Me = { type: "object", properties: { name: { type: "string" } } };
  current.paths["/api/v1/notices"].get = {
    responses: current.paths["/api/v1/notices"].get.responses,
    operationId: "listNotices",
  };
  assert.deepEqual(validate(current, prior, [...routes, "/api/v1/me"]), []);
});

test("기존 path의 삭제·설명·응답 변경을 모두 차단한다", () => {
  const prior = fixture(), removed = fixture(), changed = fixture();
  delete removed.paths["/api/v1/notices"];
  removed.paths["/api/v1/me"] = { get: { operationId: "getMe", responses: {} } };
  changed.paths["/api/v1/notices"].get.summary = "설명 문구도 계약의 일부";
  assert.ok(validate(removed, prior, ["/api/v1/me"]).includes("OPENAPI_PATH_CHANGED"));
  assert.deepEqual(validate(changed, prior), ["OPENAPI_PATH_CHANGED"]);
  const status = fixture(); status.paths["/api/v1/notices"].get.responses["201"] = { description: "새 상태" };
  assert.deepEqual(validate(status, prior), ["OPENAPI_PATH_CHANGED"]);
});

test("기존 component 삭제·수정은 거부하고 새 category/entry는 추가 가능", () => {
  const prior = fixture(), removed = fixture(), changed = fixture(), added = fixture();
  delete removed.components.schemas.Notice;
  changed.components.schemas.Notice.properties.id.type = "integer";
  added.components.responses = { RateLimited: { description: "합성 새 응답" } };
  assert.ok(validate(removed, prior).includes("OPENAPI_COMPONENT_CHANGED"));
  assert.deepEqual(validate(changed, prior), ["OPENAPI_COMPONENT_CHANGED"]);
  assert.deepEqual(validate(added, prior), []);
});

test("기존 info/version 변경과 새 root 기능은 명시적 정책 수정 전 차단한다", () => {
  const prior = fixture(), changed = fixture(), extra = fixture();
  changed.info.version = "0.2.0";
  extra.servers = [{ url: "https://untrusted.invalid" }];
  assert.deepEqual(validate(changed, prior), ["OPENAPI_ROOT_CHANGED"]);
  assert.deepEqual(validate(extra, prior), ["OPENAPI_INVALID"]);
  const version = fixture(); version.openapi = "3.2.0";
  assert.deepEqual(validate(version), ["OPENAPI_INVALID"]);
  const category = fixture(); category.components.unreviewed = {};
  assert.deepEqual(validate(category), ["OPENAPI_INVALID"]);
  const schema = fixture(); schema.components.schemas.Notice = "string은 schema 객체가 아님";
  assert.deepEqual(validate(schema), ["OPENAPI_INVALID"]);
});

test("불완전한 경로 변수와 중복 변수 이름은 구현 경로로 인정하지 않는다", () => {
  for (const path of ["/api/v1/users/{bad", "/api/v1/users/{}", "/api/v1/users/{id}/{id}"]) {
    const current = fixture();
    current.paths[path] = current.paths["/api/v1/notices"];
    delete current.paths["/api/v1/notices"];
    assert.ok(validate(current, null, [path]).includes("OPENAPI_INVALID"));
  }
});

test("없는 schema·외부 ref·미지원 JSON Pointer를 거부한다", () => {
  for (const reference of [
    "#/components/schemas/Missing", "https://untrusted.invalid/schema.json",
    "#/components/schemas/Notice~1Other", "#/components/responses/Notice",
  ]) {
    const current = fixture();
    current.paths["/api/v1/notices"].get.responses["200"].content["application/json"].schema.$ref = reference;
    assert.deepEqual(validate(current), ["OPENAPI_REF_INVALID"]);
  }
});

test("중복 operationId와 구현 경로 누락·추가·중복 route 입력을 거부한다", () => {
  const current = fixture();
  current.paths["/api/v1/me"] = { get: { operationId: "listNotices", responses: { "200": { description: "합성 응답" } } } };
  assert.deepEqual(validate(current, null, [...routes, "/api/v1/me"]), ["OPENAPI_OPERATION_ID_DUPLICATE"]);
  assert.ok(validate(current).includes("OPENAPI_ROUTE_MISMATCH"));
  assert.deepEqual(validate(fixture(), null, [...routes, ...routes]), ["OPENAPI_ROUTE_MISMATCH"]);
});

test("operation에 하나 이상의 응답 코드가 없으면 OpenAPI 계약으로 인정하지 않는다", () => {
  const current = fixture();
  current.paths["/api/v1/notices"].get.responses = {};
  assert.deepEqual(validate(current), ["OPENAPI_INVALID"]);
});

test("잘못된 이전·현재 JSON 객체는 예외나 원문 없이 고정 코드로 실패", () => {
  const current = fixture(); current.info.hidden = () => true;
  assert.deepEqual(validate(current), ["OPENAPI_INVALID"]);
  const cyclic = fixture(); cyclic.info.self = cyclic;
  assert.deepEqual(validate(cyclic), ["OPENAPI_INVALID"]);
  assert.deepEqual(validate(fixture(), { paths: {} }), ["OPENAPI_PRIOR_INVALID"]);
});

test("단일 동적 Route만 OpenAPI 변수로 대응하고 catch-all·이탈 경로는 거부", () => {
  assert.equal(routePathFromFile("src/app/api/v1/resources/[id]/route.ts"), "/api/v1/resources/{id}");
  assert.equal(routePathFromFile("src/app/api/v1/me/route.ts"), "/api/v1/me");
  for (const invalid of [
    "src/app/api/v1/resources/[...slug]/route.ts",
    "src/app/api/v1/resources/[[...slug]]/route.ts",
    "src/app/api/v1/resources/../me/route.ts",
    "src/app/api/v1/resources/./me/route.ts",
    "src/app/api/v1/resources/[id]/[id]/route.ts",
    "src/app/api/v1/resources\\me/route.ts",
    "src/app/api/v1/route.ts",
    "src/app/api/v2/notices/route.ts",
  ]) assert.equal(routePathFromFile(invalid), null);
});

test("동적 ID 뒤 정적 하위 자원 Route와 같은 접두어의 목록·상세·파일 경로를 각각 추가 전용으로 대응", () => {
  // 공동 자료 API(#272)처럼 목록·상세·파일이 한 접두어를 공유해도 Route 파일마다 OpenAPI 경로 하나로 대응해야 합니다.
  assert.equal(routePathFromFile("src/app/api/v1/resources/class-materials/route.ts"), "/api/v1/resources/class-materials");
  assert.equal(routePathFromFile("src/app/api/v1/resources/class-materials/[id]/route.ts"), "/api/v1/resources/class-materials/{id}");
  assert.equal(routePathFromFile("src/app/api/v1/resources/guidebooks/[id]/file/route.ts"), "/api/v1/resources/guidebooks/{id}/file");
  const prior = fixture(), current = fixture();
  const added = ["/api/v1/resources/weekly-texts", "/api/v1/resources/weekly-texts/{id}", "/api/v1/resources/weekly-texts/{id}/file"];
  added.forEach((path, index) => {
    current.paths[path] = { get: { operationId: `weeklyText${index}`, responses: { "200": { description: "합성 응답" } } } };
  });
  assert.deepEqual(validate(current, prior, [...routes, ...added]), []);
  // 파일 Route만 남기고 OpenAPI에서 빠뜨리면 구현 불일치로 거부합니다.
  const missing = structuredClone(current);
  delete missing.paths["/api/v1/resources/weekly-texts/{id}/file"];
  assert.deepEqual(validate(missing, prior, [...routes, ...added]), ["OPENAPI_ROUTE_MISMATCH"]);
});

/** #439: 고정 목록 operation의 인증 표기만 정정되는 합성 계약 쌍을 만듭니다. */
function authRevisionPair(path = "/api/v1/me") {
  const operation = (revised) => ({
    operationId: "getMe",
    description: revised ? "모바일 Bearer 또는 Web 쿠키가 필요합니다." : "Web 쿠키만 지원합니다.",
    ...(revised ? { security: [{ bearerAuth: [] }] } : {}),
    parameters: [{ name: "Origin", in: "header", required: !revised, schema: { type: "string" }, description: revised ? "쿠키만 필수" : "필수" }],
    responses: { "200": { description: "성공", headers: { Vary: { schema: { type: "string", const: revised ? "Cookie, Authorization" : "Cookie" } } } } },
  });
  const make = (revised) => ({
    openapi: "3.1.1", info: { title: "합성 API", version: "0.1.0" },
    paths: { [path]: { get: operation(revised) } },
    components: { schemas: {} },
  });
  return { prior: make(false), current: make(true) };
}

test("고정 목록 operation의 설명·security·Origin·Vary 정정만 허용한다", () => {
  const { prior, current } = authRevisionPair();
  assert.deepEqual(validate(current, prior, ["/api/v1/me"]), []);
});

test("고정 목록 밖 operation의 같은 인증 표기 변경은 계속 차단한다", () => {
  const { prior, current } = authRevisionPair("/api/v1/notices");
  assert.deepEqual(validate(current, prior, ["/api/v1/notices"]), ["OPENAPI_PATH_CHANGED"]);
});

test("고정 목록 operation이라도 허용 필드 밖 변경이나 잘못된 정정 값은 차단한다", () => {
  const extra = authRevisionPair(); extra.current.paths["/api/v1/me"].get.responses["200"].description = "바뀜";
  const noSecurity = authRevisionPair(); delete noSecurity.current.paths["/api/v1/me"].get.security;
  const anonymous = authRevisionPair(); anonymous.current.paths["/api/v1/me"].get.security = [{}];
  const vary = authRevisionPair(); vary.current.paths["/api/v1/me"].get.responses["200"].headers.Vary.schema.const = "Cookie";
  const origin = authRevisionPair(); origin.current.paths["/api/v1/me"].get.parameters[0].required = true;
  const method = authRevisionPair(); method.current.paths["/api/v1/me"].post = { operationId: "postMe", responses: { "200": { description: "x" } } };
  for (const { prior, current } of [extra, noSecurity, anonymous, vary, origin, method]) {
    assert.deepEqual(validate(current, prior, ["/api/v1/me"]), ["OPENAPI_PATH_CHANGED"]);
  }
});

test("실제 정본의 Bearer 수용 operation에는 쿠키 전용 문구가 남지 않는다", () => {
  const spec = JSON.parse(readFileSync(new URL("../../packages/contracts/openapi.json", import.meta.url), "utf8"));
  for (const [path, item] of Object.entries(spec.paths)) {
    for (const [method, operation] of Object.entries(item)) {
      if (!operation.security?.some((entry) => "bearerAuth" in entry)) continue;
      assert.doesNotMatch(operation.description, /Bearer 인증은 아직 지원하지 않|^현재는 Auth\.js Web 세션 쿠키가 필요/, `${method} ${path}`);
      for (const response of Object.values(operation.responses)) {
        if (response.headers?.Vary) assert.equal(response.headers.Vary.schema.const, "Cookie, Authorization", `${method} ${path}`);
      }
    }
  }
});
