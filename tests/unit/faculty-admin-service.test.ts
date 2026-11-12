/** 교수진 관리자 서비스의 모든 진입점 재인가와 표시 DTO 화이트리스트를 검증합니다. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  listFacultyRows: vi.fn(), getFacultyRow: vi.fn(), insertFaculty: vi.fn(),
  getExistingImage: vi.fn(), updateFacultyRow: vi.fn(), deleteFacultyRow: vi.fn(),
}));
const upload = vi.hoisted(() => vi.fn());
vi.mock("@/features/faculty/admin/repository", () => repository);
vi.mock("@/lib/server-upload-intent", () => ({ uploadWithOwnedIntent: upload }));
import * as service from "@/features/faculty/admin/service";

const actor = { userId: "admin-1", role: "ADMIN" };
const input = { name: "합성 교수", category: "CLASSICS" as const, order: 0,
  directImageUrl: null, image: undefined };
const calls = {
  listAdminFaculty: (actor: service.FacultyActor) => service.listAdminFaculty(actor),
  getAdminFaculty: (actor: service.FacultyActor) => service.getAdminFaculty(actor, "faculty-1"),
  createAdminFaculty: (actor: service.FacultyActor) => service.createAdminFaculty(actor, input),
  updateAdminFaculty: (actor: service.FacultyActor) => service.updateAdminFaculty(actor, "faculty-1", input),
  deleteAdminFaculty: (actor: service.FacultyActor) => service.deleteAdminFaculty(actor, "faculty-1"),
};
beforeEach(() => vi.resetAllMocks());

it("서비스의 모든 함수가 인가 검사 목록에 포함된다", () => {
  // 준비·실행·확인: 새 함수가 추가되어도 인가 테스트 누락을 허용하지 않습니다.
  expect(Object.keys(service).sort()).toEqual(Object.keys(calls).sort());
});

describe.each(Object.entries(calls))("%s 관리자 재인가", (_name, run) => {
  it.each([null, undefined])("주체 %s 호출도 저장소 이전에 거부한다", async actor => {
    // 준비·실행: 타입 경계를 우회한 런타임 호출을 재현합니다.
    await expect(Reflect.apply(run, undefined, [actor])).rejects.toThrow("FACULTY_ADMIN_REQUIRED");
    // 확인: 저장소와 업로드는 시작하지 않습니다.
    for (const fn of Object.values(repository)) expect(fn).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });
  it.each([
    { userId: "member-1", role: "MEMBER" },
    { userId: "faculty-1", role: "FACULTY" },
    { userId: "pending-1", role: "PENDING" },
    { userId: "", role: "ADMIN" },
    { userId: "", role: "" },
  ])("$role / $userId 주체는 저장소·업로드 이전에 거부한다", async actor => {
    // 준비: 비관리자 또는 비어 있는 주체입니다.
    // 실행: Web adapter를 거치지 않고 서비스를 호출합니다.
    await expect(run(actor)).rejects.toThrow("FACULTY_ADMIN_REQUIRED");
    // 확인: 어떤 저장소 함수나 업로드도 시작하지 않습니다.
    for (const fn of Object.values(repository)) expect(fn).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });
});

const row = { id: "faculty-1", name: "합성 교수", category: "CLASSICS", currentPosition: null,
  formerPosition: "전직", imageUrl: null, order: 3, createdAt: new Date(0), internalMemo: "내부" };
it("목록은 저장소의 여분 열을 제외한 다섯 필드만 반환한다", async () => {
  // 준비: 미래 내부 열을 포함한 행입니다.
  repository.listFacultyRows.mockResolvedValue([row]);
  // 실행·확인: 목록 DTO는 명시적 화이트리스트입니다.
  expect(await service.listAdminFaculty(actor)).toEqual([{ id: row.id, name: row.name, category: row.category,
    currentPosition: null, formerPosition: "전직" }]);
});

it("편집은 저장소의 여분 열을 제외한 일곱 필드만 반환한다", async () => {
  // 준비: 목록 외 사진·순서와 내부 열이 있는 행입니다.
  repository.getFacultyRow.mockResolvedValue(row);
  // 실행·확인: 클라이언트 폼의 표시 계약만 반환합니다.
  expect(await service.getAdminFaculty(actor, row.id)).toEqual({ id: row.id, name: row.name, category: row.category,
    currentPosition: null, formerPosition: "전직", imageUrl: null, order: 3 });
});

it("편집 대상이 없으면 null을 유지한다", async () => {
  // 준비: 누락 행입니다.
  repository.getFacultyRow.mockResolvedValue(null);
  // 실행·확인: adapter가 notFound를 선택할 수 있습니다.
  expect(await service.getAdminFaculty(actor, "missing")).toBeNull();
});
