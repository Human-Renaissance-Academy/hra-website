// @vitest-environment node
/** 회원 관리자 서비스의 모든 인가 진입점·본인 보호·DTO whitelist를 고정합니다. */
import { beforeEach, expect, it, vi } from "vitest";
const repository = vi.hoisted(() => ({
  listUsers: vi.fn(), getUser: vi.fn(), listCohorts: vi.fn(), findUserId: vi.fn(),
  findCohortIds: vi.fn(), updateGroup: vi.fn(), deleteUser: vi.fn(),
}));
vi.mock("@/features/users/admin/repository", () => repository);
import { listAdminUsers, listAdminCohorts, getAdminUser, changeAdminUserGroup, deleteAdminUser,
  type UserAdminActor } from "@/features/users/admin/service";

const actor = { userId: "10000000-0000-4000-8000-000000000001", role: "ADMIN" };
const target = "10000000-0000-4000-8000-000000000002";
const row = { id: target, name: "합성 회원", email: "member@qa.invalid", role: "MEMBER", cohortId: null,
  image: null, createdAt: new Date(0), updatedAt: new Date(1), hasPassword: false,
  passwordHash: "비공개", sessionVersion: 9, tokens: "비공개" };
const entries = [
  ["listAdminUsers", (principal: UserAdminActor) => listAdminUsers(principal)],
  ["listAdminCohorts", (principal: UserAdminActor) => listAdminCohorts(principal)],
  ["getAdminUser", (principal: UserAdminActor) => getAdminUser(principal, target)],
  ["changeAdminUserGroup", (principal: UserAdminActor) => changeAdminUserGroup(principal, { userId: target, groupValue: "FACULTY" })],
  ["deleteAdminUser", (principal: UserAdminActor) => deleteAdminUser(principal, target)],
] as const;

beforeEach(() => {
  vi.resetAllMocks();
  repository.listUsers.mockResolvedValue([row]);
  repository.getUser.mockResolvedValue(row);
  repository.listCohorts.mockResolvedValue([{ id: target, name: "20기", internal: true }]);
  repository.findUserId.mockResolvedValue({ id: target });
  repository.updateGroup.mockResolvedValue(1);
  repository.deleteUser.mockResolvedValue(1);
});

for (const [name, run] of entries) {
  it.each([
    { userId: actor.userId, role: "MEMBER" },
    { userId: actor.userId, role: "FACULTY" },
    { userId: actor.userId, role: "PENDING" },
    { userId: "", role: "ADMIN" },
  ])(`${name}는 잘못된 주체 %j에서 모든 저장소 접근 전에 거부한다`, async principal => {
    // 준비: 저장소는 성공하도록 설정하여 인가 누락을 다른 오류가 가리지 않습니다.
    // 실행·검증: 각 진입점이 독립적으로 주체를 검사합니다.
    await expect(run(principal)).rejects.toThrow("USERS_ADMIN_REQUIRED");
    for (const call of Object.values(repository)) expect(call).not.toHaveBeenCalled();
  });
}

it.each(["change", "delete"])("본인 %s는 존재 조회보다 먼저 거부한다", async operation => {
  // 준비: 입력 대상이 검증된 주체와 같습니다.
  // 실행: 본인 보호는 서비스에 있어 다른 adapter도 우회할 수 없습니다.
  const result = operation === "change"
    ? await changeAdminUserGroup(actor, { userId: actor.userId, groupValue: "PENDING" })
    : await deleteAdminUser(actor, actor.userId);
  // 검증: 어떠한 저장소 호출도 없습니다.
  expect(result).toEqual(operation === "change"
    ? { success: false, message: "자기 자신의 그룹은 변경할 수 없습니다." }
    : { kind: "result", result: { success: false, message: "자기 자신은 삭제할 수 없습니다." } });
  for (const call of Object.values(repository)) expect(call).not.toHaveBeenCalled();
});

it("목록 DTO는 내부 열이 있는 저장소 행에서도 일곱 표시 열만 반환한다", async () => {
  // 준비: 저장소 행에 인증 정보가 함께 있습니다.
  // 실행·검증: 명시 DTO 매핑으로 내부 열을 제거합니다.
  const result = await listAdminUsers(actor);
  expect(result).toEqual([{ id: target, name: row.name, email: row.email, role: row.role,
    cohortId: null, image: null, createdAt: row.createdAt }]);
  expect(Object.keys(result[0] ?? {})).toEqual(["id", "name", "email", "role", "cohortId", "image", "createdAt"]);
});

it("상세 DTO는 아홉 표시 열만 반환하고 비밀번호는 존재 여부로 제한한다", async () => {
  // 준비·실행: 저장소 부가 열을 서비스 결과와 분리합니다.
  const result = await getAdminUser(actor, target);
  // 검증: 값과 정확한 열 순서를 모두 검사합니다.
  expect(result).toEqual({ id: target, name: row.name, email: row.email, role: row.role,
    cohortId: null, image: null, createdAt: row.createdAt, updatedAt: row.updatedAt, hasPassword: false });
  expect(Object.keys(result ?? {})).toEqual(["id", "name", "email", "role", "cohortId", "image", "createdAt", "updatedAt", "hasPassword"]);
});

it("기수 DTO는 ID와 이름만 반환한다", async () => {
  // 준비·실행·검증: 드롭다운에 내부 메타데이터가 섞이지 않습니다.
  expect(await listAdminCohorts(actor)).toEqual([{ id: target, name: "20기" }]);
});
