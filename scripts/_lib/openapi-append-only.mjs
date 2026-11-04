/**
 * OpenAPI v1의 추가 전용 소스 계약을 검사하는 순수 함수입니다.
 * 기존 경로·컴포넌트의 의미를 추측하지 않고 JSON 값 전체를 보수적으로 고정합니다.
 * 파일·Git·DB·네트워크 접근과 사용자 입력의 원문 출력은 호출자 책임입니다.
 */

const rootKeys = ["components", "info", "openapi", "paths"];
const methods = new Set(["get", "post", "put", "patch", "delete", "head", "options"]);
const componentCategories = new Set(["schemas", "responses", "parameters", "examples", "requestBodies", "headers", "securitySchemes", "links", "callbacks", "pathItems"]);
const referencePrefix = "#/components/schemas/";
const componentName = /^[A-Za-z][A-Za-z0-9_-]*$/;

/**
 * #439: 모바일 Bearer 이중 전송(#438) 반영으로 기존 operation의 인증 표기만 실제 동작에 맞춰
 * 한 번 정정할 수 있는 고정 목록입니다. 새 operation은 이 목록에 추가하지 않습니다.
 * 허용 필드는 description·security·Origin 헤더 매개변수의 required/description·Vary 응답 헤더뿐입니다.
 */
const authWordingRevisions = new Set([
  "get /api/v1/me", "get /api/v1/resources/guidebooks",
  "get /api/v1/assignments", "get /api/v1/assignments/{id}", "get /api/v1/assignments/{id}/submission",
  "post /api/v1/submissions", "post /api/v1/uploads/intents", "delete /api/v1/uploads/intents/{id}",
  "post /api/v1/uploads/{id}/verify", "post /api/v1/uploads", "get /api/v1/submissions/{id}/files/{fileId}",
]);

/** 정정 허용 필드를 제거한 사본입니다. 이 사본이 이전·현재에서 같아야 정정으로 인정합니다. */
function withoutAuthWording(operation) {
  const copy = structuredClone(operation);
  delete copy.description;
  delete copy.security;
  if (Array.isArray(copy.parameters)) {
    for (const parameter of copy.parameters) {
      if (plain(parameter) && parameter.name === "Origin" && parameter.in === "header") {
        delete parameter.required;
        delete parameter.description;
      }
    }
  }
  for (const response of Object.values(copy.responses ?? {})) {
    if (plain(response) && plain(response.headers)) delete response.headers.Vary;
  }
  return copy;
}

/** 정정 후 값은 쿠키 또는 Bearer 이중 전송 표기만 허용합니다(Bearer 요청은 Origin을 생략할 수 있음). */
function authWordingValid(operation) {
  if (typeof operation.description !== "string" || operation.description.length === 0 ||
      canonical(operation.security) !== canonical([{ bearerAuth: [] }])) return false;
  const origins = (operation.parameters ?? []).filter(item => plain(item) && item.name === "Origin" && item.in === "header");
  if (!origins.every(item => item.required === false && typeof item.description === "string")) return false;
  return Object.values(operation.responses ?? {}).every(response => !plain(response) || !plain(response.headers) ||
    !Object.hasOwn(response.headers, "Vary") ||
    canonical(response.headers.Vary) === canonical({ schema: { type: "string", const: "Cookie, Authorization" } }));
}

/** 응답별 Vary 헤더 존재 여부가 이전·현재에서 같아야 합니다(삭제·추가 금지). */
function varyPresenceKept(before, after) {
  const names = Object.keys(before.responses ?? {});
  if (canonical([...names].sort()) !== canonical(Object.keys(after.responses ?? {}).sort())) return false;
  const has = (response) => plain(response) && plain(response.headers) && Object.hasOwn(response.headers, "Vary");
  return names.every(name => has(before.responses[name]) === has(after.responses[name]));
}

/**
 * 정정은 이전 operation이 아직 옛 형태일 때만 한 번 허용합니다: security가 없고
 * 존재하는 모든 Vary가 `Cookie`이며 Origin 매개변수의 required가 불리언입니다.
 * 이미 정정된 operation은 이후 정확히 보존해야 합니다.
 */
function legacyAuthShape(operation) {
  if (Object.hasOwn(operation, "security")) return false;
  const origins = (operation.parameters ?? []).filter(item => plain(item) && item.name === "Origin" && item.in === "header");
  if (!origins.every(item => typeof item.required === "boolean")) return false;
  return Object.values(operation.responses ?? {}).every(response => !plain(response) || !plain(response.headers) ||
    !Object.hasOwn(response.headers, "Vary") ||
    canonical(response.headers.Vary) === canonical({ schema: { type: "string", const: "Cookie" } }));
}

/** 경로 항목이 같거나, 허용 목록 operation의 인증 표기만 정정되었는지 확인합니다. */
function pathPreserved(path, before, after) {
  if (canonical(before) === canonical(after)) return true;
  if (!plain(after) || canonical(Object.keys(before).sort()) !== canonical(Object.keys(after).sort())) return false;
  return Object.entries(before).every(([method, operation]) => {
    const next = after[method];
    if (canonical(operation) === canonical(next)) return true;
    return authWordingRevisions.has(`${method} ${path}`) && plain(operation) && plain(next) &&
      legacyAuthShape(operation) && varyPresenceKept(operation, next) &&
      canonical(withoutAuthWording(operation)) === canonical(withoutAuthWording(next)) && authWordingValid(next);
  });
}

/** JSON 객체만 허용하며 배열과 사용자 정의 prototype은 제외합니다. */
function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value));
}

/** 순환·함수·비유한 숫자와 과도한 중첩은 JSON 계약으로 인정하지 않습니다. */
function jsonValue(value, visiting = new Set(), depth = 0) {
  if (depth > 64) return false;
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (!Array.isArray(value) && !plain(value)) return false;
  if (visiting.has(value)) return false;
  visiting.add(value);
  const entries = Array.isArray(value) ? value : Object.values(value);
  const valid = entries.every(item => jsonValue(item, visiting, depth + 1));
  visiting.delete(value);
  return valid;
}

/** 객체 key 순서만 정규화하고 배열 순서·실제 값은 그대로 비교합니다. */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (plain(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

/** 검사 가능한 최소 OpenAPI 3.1.1 형태를 정본으로 제한합니다. */
function documentShape(value) {
  return plain(value) && jsonValue(value) &&
    Object.keys(value).sort().join() === rootKeys.join() &&
    value.openapi === "3.1.1" && plain(value.info) &&
    typeof value.info.title === "string" && value.info.title.length > 0 &&
    typeof value.info.version === "string" && value.info.version.length > 0 &&
    plain(value.paths) && Object.keys(value.paths).length > 0 &&
    plain(value.components) && plain(value.components.schemas) &&
    Object.keys(value.components).every(name => componentCategories.has(name)) &&
    Object.values(value.components).every(category => plain(category) && Object.values(category).every(plain));
}

/** OpenAPI 경로 변수는 완전한 `{name}` 한 세그먼트로만 인정합니다. */
function validApiPath(path) {
  if (typeof path !== "string" || !path.startsWith("/api/v1/")) return false;
  const names = new Set();
  for (const segment of path.slice("/api/v1/".length).split("/")) {
    const dynamic = /^\{([A-Za-z][A-Za-z0-9_]*)\}$/.exec(segment);
    if (dynamic) {
      if (names.has(dynamic[1])) return false;
      names.add(dynamic[1]);
    } else if (!/^[A-Za-z0-9][A-Za-z0-9._~-]*$/.test(segment)) return false;
  }
  return true;
}

/** `src/app`의 정적·단일 동적 Route 파일을 OpenAPI 경로로 바꿉니다. */
export function routePathFromFile(path) {
  if (typeof path !== "string" || !path.startsWith("src/app/api/v1/") ||
      !path.endsWith("/route.ts") || path.includes("\\") || path.includes("\0")) return null;
  const parts = path.split("/");
  if (parts.some(part => !part || part === "." || part === "..")) return null;
  const routeParts = parts.slice(4, -1);
  if (routeParts.length === 0) return null;
  const names = new Set();
  const output = [];
  for (const part of routeParts) {
    const dynamic = /^\[([A-Za-z][A-Za-z0-9_]*)\]$/.exec(part);
    if (dynamic) {
      if (names.has(dynamic[1])) return null;
      names.add(dynamic[1]);
      output.push(`{${dynamic[1]}}`);
    } else if (/^[A-Za-z0-9][A-Za-z0-9._~-]*$/.test(part)) {
      output.push(part);
    } else return null;
  }
  return `/api/v1/${output.join("/")}`;
}

/** 로컬 스키마 참조와 고유 operationId만 인정합니다. */
function inspectCurrent(current, diagnostics) {
  const ids = new Set();
  for (const [path, item] of Object.entries(current.paths)) {
    if (!validApiPath(path) || !plain(item) || !Object.keys(item).length) {
      diagnostics.add("OPENAPI_INVALID");
      continue;
    }
    for (const [method, operation] of Object.entries(item)) {
      if (!methods.has(method) || !plain(operation) || typeof operation.operationId !== "string" ||
          !/^[A-Za-z][A-Za-z0-9_]*$/.test(operation.operationId) || !plain(operation.responses) ||
          Object.keys(operation.responses).length === 0) {
        diagnostics.add("OPENAPI_INVALID");
        continue;
      }
      if (ids.has(operation.operationId)) diagnostics.add("OPENAPI_OPERATION_ID_DUPLICATE");
      ids.add(operation.operationId);
    }
  }
  for (const category of Object.values(current.components)) {
    if (!Object.keys(category).every(name => componentName.test(name))) diagnostics.add("OPENAPI_INVALID");
  }
  const visit = value => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!plain(value)) return;
    for (const [key, child] of Object.entries(value)) {
      if (key === "$ref") {
        if (typeof child !== "string" || !child.startsWith(referencePrefix) ||
            !componentName.test(child.slice(referencePrefix.length)) ||
            !Object.hasOwn(current.components.schemas, child.slice(referencePrefix.length))) {
          diagnostics.add("OPENAPI_REF_INVALID");
        }
      } else visit(child);
    }
  };
  visit(current);
}

/**
 * 현재 계약의 구조·Route·참조를 검사하고 이전 계약의 기존 값을 변경 없이 보존합니다.
 * 결과는 원문·경로를 담지 않는 정렬된 고정 진단 코드만 포함합니다.
 */
export function validateOpenApiAppendOnly({ previous = null, current, routePaths } = {}) {
  const diagnostics = new Set();
  if (!documentShape(current)) return ["OPENAPI_INVALID"];
  inspectCurrent(current, diagnostics);

  if (!Array.isArray(routePaths) || routePaths.some(path => typeof path !== "string") ||
      new Set(routePaths).size !== routePaths.length ||
      canonical([...routePaths].sort()) !== canonical(Object.keys(current.paths).sort())) {
    diagnostics.add("OPENAPI_ROUTE_MISMATCH");
  }

  if (previous !== null) {
    if (!documentShape(previous)) diagnostics.add("OPENAPI_PRIOR_INVALID");
    else {
      for (const key of rootKeys.filter(key => key !== "paths" && key !== "components")) {
        if (canonical(previous[key]) !== canonical(current[key])) diagnostics.add("OPENAPI_ROOT_CHANGED");
      }
      for (const [path, item] of Object.entries(previous.paths)) {
        if (!Object.hasOwn(current.paths, path) || !pathPreserved(path, item, current.paths[path])) {
          diagnostics.add("OPENAPI_PATH_CHANGED");
        }
      }
      for (const [category, entries] of Object.entries(previous.components)) {
        if (!plain(current.components[category])) { diagnostics.add("OPENAPI_COMPONENT_CHANGED"); continue; }
        for (const [name, entry] of Object.entries(entries)) {
          if (!Object.hasOwn(current.components[category], name) || canonical(entry) !== canonical(current.components[category][name])) {
            diagnostics.add("OPENAPI_COMPONENT_CHANGED");
          }
        }
      }
    }
  }
  return [...diagnostics].sort();
}
