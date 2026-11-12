/** 관리자 업무와 교수진 공용 생성 서비스의 인가·DTO 경계를 검증합니다. */
import { beforeEach, expect, it, vi } from "vitest";
const repository = vi.hoisted(() => ({ listMaterials: vi.fn(), getMaterial: vi.fn(),
  getMutationTarget: vi.fn(), replaceMaterialFile: vi.fn(), updateMaterialText: vi.fn(), deleteMaterial: vi.fn() }));
const upload = vi.hoisted(() => ({ insertMaterial: vi.fn() }));
vi.mock("@/features/class-materials/admin/repository", () => repository);
vi.mock("@/features/class-materials/upload/repository", () => upload);
import { listAdminMaterials, getAdminMaterial, getAdminMutationTarget, updateAdminMaterial,
  deleteAdminMaterial, type ClassMaterialActor } from "@/features/class-materials/admin/service";
import { createUploadedMaterial } from "@/features/class-materials/upload/service";

const id = "11111111-1111-4111-8111-111111111111";
const admin = { userId: id, role: "ADMIN" };
const textFields = { title: "합성 강의", weekNumber: 2, lectureTitle: null, audience: "STUDENT" as const, classDate: null };
const input = { ...textFields, fileUrl: "https://fixture.invalid/new.pdf", fileName: "합성.pdf" };
const entries = [
  { name: "list", run: (actor: ClassMaterialActor) => listAdminMaterials(actor) },
  { name: "get", run: (actor: ClassMaterialActor) => getAdminMaterial(actor, id) },
  { name: "target", run: (actor: ClassMaterialActor) => getAdminMutationTarget(actor, id) },
  { name: "update", run: (actor: ClassMaterialActor) => updateAdminMaterial(actor, { id, textFields }) },
  { name: "delete", run: (actor: ClassMaterialActor) => deleteAdminMaterial(actor, id) },
];
beforeEach(() => vi.resetAllMocks());
for (const entry of entries) {
  it.each([
    { userId: id, role: "MEMBER" }, { userId: id, role: "FACULTY" },
    { userId: id, role: "PENDING" }, { userId: "", role: "ADMIN" }, { userId: "", role: "" },
  ])(`${entry.name}는 잘못된 관리자 주체 %j를 저장소 전에 거절한다`, async (actor) => {
    // 준비·실행: 모든 서비스 진입을 Web 없이 호출합니다.
    await expect(entry.run(actor)).rejects.toThrow("CLASS_MATERIAL_ADMIN_REQUIRED");
    // 검증: 조회·변경 저장소 모두 실행되지 않습니다.
    for (const method of Object.values(repository)) expect(method).not.toHaveBeenCalled();
  });
}
it.each(["MEMBER", "PENDING", "UNKNOWN", ""])("%s는 공용 생성 저장소에 도달하지 않는다", async (role) => {
  // 준비·실행: 업로드 권한이 없는 역할입니다.
  await expect(createUploadedMaterial({ userId: id, role }, input)).rejects.toThrow("CLASS_MATERIAL_UPLOAD_REQUIRED");
  // 검증: 파일 참조 저장을 시작하지 않습니다.
  expect(upload.insertMaterial).not.toHaveBeenCalled();
});
it("빈 관리자 주체도 공용 생성 저장소에 도달하지 않는다", async () => {
  // 준비·실행: 역할만 있고 계정 ID가 없습니다.
  await expect(createUploadedMaterial({ userId: "", role: "ADMIN" }, input)).rejects.toThrow("CLASS_MATERIAL_UPLOAD_REQUIRED");
  // 검증: ID가 없는 작성자를 저장하지 않습니다.
  expect(upload.insertMaterial).not.toHaveBeenCalled();
});
it.each(["ADMIN", "FACULTY"])("%s 생성은 세션 주체를 작성자로 전달한다", async (role) => {
  // 준비·실행: 허용된 두 업로드 역할입니다.
  await createUploadedMaterial({ userId: id, role }, input);
  // 검증: 생성 서비스는 관리자 모듈을 경유하지 않습니다.
  expect(upload.insertMaterial).toHaveBeenCalledExactlyOnceWith(input, id);
});
it("목록과 편집 DTO는 저장소에 추가된 내부 열을 제외한다", async () => {
  // 준비: 저장소 결과에 내부 원본 URL을 넣습니다.
  const row = { id, ...textFields, createdAt: new Date(0), uploaderName: "합성 교수", fileName: "합성.pdf", fileUrl: "private://secret" };
  repository.listMaterials.mockResolvedValue([row]);
  repository.getMaterial.mockResolvedValue(row);
  // 실행·검증: 표시 계약의 필드만 반환합니다.
  expect(await listAdminMaterials(admin)).toEqual([{ id, title: row.title, weekNumber: 2,
    lectureTitle: null, audience: "STUDENT", createdAt: row.createdAt, uploaderName: "합성 교수" }]);
  expect(await getAdminMaterial(admin, id)).toEqual({ title: row.title, weekNumber: 2,
    lectureTitle: null, audience: "STUDENT", fileName: "합성.pdf" });
});
it("파일 교체는 이전 URL과 텍스트를 한 번에 저장소로 전달한다", async () => {
  // 준비: 낙관적 조건이 일치하는 파일 교체입니다.
  const file = { url: input.fileUrl, fileName: input.fileName, previousUrl: "old" };
  repository.replaceMaterialFile.mockResolvedValue(false);
  // 실행·검증: 경합 결과를 그대로 반환하고 텍스트 전용 쓰기는 실행하지 않습니다.
  expect(await updateAdminMaterial(admin, { id, textFields, file })).toBe(false);
  expect(repository.replaceMaterialFile).toHaveBeenCalledExactlyOnceWith(id, textFields, file);
  expect(repository.updateMaterialText).not.toHaveBeenCalled();
});
it("삭제 대상이 없으면 실제 삭제를 시작하지 않는다", async () => {
  // 준비: 조회에서 대상이 없습니다.
  repository.getMutationTarget.mockResolvedValue(undefined);
  // 실행·검증: 기존 누락 결과를 유지합니다.
  expect(await deleteAdminMaterial(admin, id)).toBe(false);
  expect(repository.deleteMaterial).not.toHaveBeenCalled();
});
