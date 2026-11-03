// @vitest-environment node
/**
 * 모든 보호 경로에 공통 이중 인증 어댑터가 실제 연결되었는지 검사합니다.
 * 서비스 대신 경로 입력 오류를 관찰하므로 저장소 호출 없이 인증 우선순위를 검증합니다.
 */
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ authenticate: vi.fn(), validate: vi.fn(), auth: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/features/auth/mobile-session/service", () => ({ authenticateAccessToken: mocks.authenticate, validateMobileSession: mocks.validate }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { GET as me } from "@/app/api/v1/me/route";
import { GET as guidebooks } from "@/app/api/v1/resources/guidebooks/route";
import { GET as assignments } from "@/app/api/v1/assignments/route";
import { GET as assignment } from "@/app/api/v1/assignments/[id]/route";
import { GET as submission } from "@/app/api/v1/assignments/[id]/submission/route";
import { POST as finalize } from "@/app/api/v1/submissions/route";
import { POST as intent } from "@/app/api/v1/uploads/intents/route";
import { DELETE as cancel } from "@/app/api/v1/uploads/intents/[id]/route";
import { POST as verify } from "@/app/api/v1/uploads/[id]/verify/route";
import { GET as file } from "@/app/api/v1/submissions/[id]/files/[fileId]/route";
import { MobileSessionStorageError } from "@/features/auth/mobile-session/types";

const id = "10000000-0000-4000-8000-000000000001";
const context = { params: Promise.resolve({ id, fileId: id }) };
const families = [
  { name: "me", method: "GET", run: (request: Request) => me(request) },
  { name: "guidebooks", method: "GET", run: (request: Request) => guidebooks(request) },
  { name: "assignments", method: "GET", run: (request: Request) => assignments(request) },
  { name: "assignment", method: "GET", run: (request: Request) => assignment(request, context) },
  { name: "submission", method: "GET", run: (request: Request) => submission(request, context) },
  { name: "finalize", method: "POST", run: (request: Request) => finalize(request) },
  { name: "intent", method: "POST", run: (request: Request) => intent(request) },
  { name: "cancel", method: "DELETE", run: (request: Request) => cancel(request, context) },
  { name: "verify", method: "POST", run: (request: Request) => verify(request, context) },
  { name: "file", method: "GET", run: (request: Request) => file(request, context) },
] as const;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ user: { id, role: "MEMBER" } });
  mocks.authenticate.mockResolvedValue({ userId: id, role: "MEMBER", sessionVersion: 1, sessionId: id });
  mocks.validate.mockResolvedValue({ userId: id, role: "MEMBER" });
});

it.each(families)("$name: tri-state와 저장소 오류는 경로 입력보다 우선한다", async (family) => {
  // Given: query는 모든 경로에서 거부되며 cookie는 유효함
  const scenarios = [
    { header: undefined, status: 400, code: "INVALID_INPUT" },
    { header: "Bearer valid", status: 400, code: "INVALID_INPUT" },
    { header: "Basic unsupported", status: 401, code: "UNAUTHENTICATED" },
    { header: "Bearer unknown", status: 401, code: "UNAUTHENTICATED" },
    { header: "Bearer storage", status: 503, code: "UNAVAILABLE" },
  ];
  for (const scenario of scenarios) {
    mocks.authenticate.mockImplementation(async (token: string) => {
      if (token === "storage") throw new MobileSessionStorageError();
      return token === "valid" ? { userId: id, role: "MEMBER", sessionVersion: 1, sessionId: id } : null;
    });
    const request = new Request("https://qa.invalid/api/v1/test?unsupported=1", {
      method: family.method, headers: { Origin: "https://qa.invalid", Cookie: "valid", ...(scenario.header ? { Authorization: scenario.header } : {}) },
    });
    // When
    const response = await family.run(request);
    // Then
    expect(response.status, `${family.name}/${scenario.header}`).toBe(scenario.status);
    expect((await response.json()).error.code).toBe(scenario.code);
    expect(response.headers.get("vary")?.toLowerCase()).toContain("authorization");
    expect(response.headers.get("vary")?.toLowerCase()).toContain("cookie");
  }
  expect(mocks.auth).not.toHaveBeenCalled();
});
