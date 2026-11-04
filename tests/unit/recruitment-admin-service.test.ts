/** 기수 서비스의 모든 진입점에서 재인가와 표시값 제한을 검증합니다. */
import { beforeEach, expect, it, vi } from "vitest";
const repository = vi.hoisted(() => ({ listCohorts: vi.fn(), getCohort: vi.fn(), getCohortImage: vi.fn(), insertCohort: vi.fn(), updateCohort: vi.fn(), hasDeleteGuards: vi.fn(), getDeletionReferences: vi.fn(), deleteCohort: vi.fn(), isSubmissionReferenceError: vi.fn() }));
vi.mock("@/features/recruitment/admin/repository", () => repository);
import { listAdminCohorts, getAdminCohort, createAdminCohort, updateAdminCohort, deleteAdminCohort, type CohortActor } from "@/features/recruitment/admin/service";
const actor = { userId: "admin-1", role: "ADMIN" };
const id = "11111111-1111-4111-8111-111111111111";
const input = { name: "20기", description: null, startDate: null, endDate: null, isActive: true, imageUrl: null };
const upload = vi.fn(async () => ({ imageUrl: null, error: null }));
const entries = [
  ["list", (a: CohortActor) => listAdminCohorts(a)],
  ["get", (a: CohortActor) => getAdminCohort(a, id)],
  ["create", (a: CohortActor) => createAdminCohort(a, input)],
  ["update", (a: CohortActor) => updateAdminCohort(a, id, { ...input, shouldRemoveImage: false, uploadImage: upload })],
  ["delete", (a: CohortActor) => deleteAdminCohort(a, id)],
] as const;
beforeEach(() => { vi.clearAllMocks(); });
it.each(entries)("%s 서비스는 비관리자·빈 역할·빈 식별자에서 저장소와 업로드를 호출하지 않는다", async (_name, run) => {
  // 준비: 역할 또는 로그인 식별자가 없는 합성 주체입니다.
  for (const invalid of [{ userId: "member-1", role: "MEMBER" }, { userId: "faculty-1", role: "FACULTY" }, { userId: "", role: "ADMIN" }, { userId: "admin-1", role: "" }]) {
    // 실행: Web 어댑터 없이 서비스를 직접 호출합니다.
    await expect(run(invalid)).rejects.toThrow("COHORT_ADMIN_REQUIRED");
    // 확인: 모든 저장소 진입과 업로드가 차단됩니다.
    for (const method of Object.values(repository)) expect(method).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  }
  for (const invalid of [undefined, null, {}]) {
    await expect(Reflect.apply(run, undefined, [invalid])).rejects.toThrow("COHORT_ADMIN_REQUIRED");
    for (const method of Object.values(repository)) expect(method).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  }
});
it("목록 DTO는 저장소의 부가 열을 반환하지 않는다", async () => {
  repository.listCohorts.mockResolvedValue([{ ...input, id, order: 7, createdAt: new Date(0), internal: "비공개" }]);
  expect(await listAdminCohorts(actor)).toEqual([{ id, name: "20기", description: null, isActive: true, startDate: null, endDate: null }]);
});
it("편집 DTO는 폼의 여섯 필드만 반환한다", async () => {
  repository.getCohort.mockResolvedValue({ ...input, id, order: 7, createdAt: new Date(0) });
  expect(await getAdminCohort(actor, id)).toEqual(input);
});
it("누락된 편집 DTO는 undefined를 유지한다", async () => {
  repository.getCohort.mockResolvedValue(undefined);
  expect(await getAdminCohort(actor, id)).toBeUndefined();
});
it.each([
  [false, false, false, "제출 보존 설정을 확인할 수 없어 기수를 삭제할 수 없습니다."],
  [true, true, false, "지원서가 연결된 기수는 삭제할 수 없습니다."],
  [true, false, false, "기수를 찾을 수 없습니다."],
  [true, false, true, "기수가 삭제되었습니다."],
] as const)("삭제 보호 %s·참조 %s·삭제 행 %s 결과를 유지한다", async (guards, references, deleted, message) => {
  repository.hasDeleteGuards.mockResolvedValue(guards);
  repository.getDeletionReferences.mockResolvedValue(references);
  repository.deleteCohort.mockResolvedValue(deleted);
  expect(await deleteAdminCohort(actor, id)).toEqual({ success: guards && !references && deleted, message });
  expect(repository.getDeletionReferences.mock.calls).toEqual(guards ? [[id]] : []);
  expect(repository.deleteCohort.mock.calls).toEqual(guards && !references ? [[id]] : []);
});
it.each([true, false])("삭제 DB 오류는 알려진 참조 여부 %s에 따라 안내 또는 원문 전파한다", async known => {
  const error = new Error("합성 DB 오류");
  repository.hasDeleteGuards.mockRejectedValue(error);
  repository.isSubmissionReferenceError.mockReturnValue(known);
  const result = deleteAdminCohort(actor, id);
  if (known) await expect(result).resolves.toEqual({ success: false, message: "지원서가 연결된 기수는 삭제할 수 없습니다." });
  else await expect(result).rejects.toBe(error);
});
