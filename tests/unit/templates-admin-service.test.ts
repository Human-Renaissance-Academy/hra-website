/**
 * 관리자 양식 서비스의 재인가와 최소 DTO·사전 조회 순서를 검증합니다.
 * 저장소만 격리하여 거부된 주체가 어떤 저장소 함수에도 도달하지 못하게 합니다.
 */
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ listTemplates: vi.fn(), findById: vi.fn(), findBySlug: vi.fn(),
  insertTemplate: vi.fn(), updateTemplate: vi.fn(), unpublishTemplate: vi.fn() }));
vi.mock("@/features/report-templates/admin/repository", () => mocks);
import { createAdminTemplate, getAdminTemplate, hasDuplicateSlug, listAdminTemplates,
  prepareTemplateUpdate, unpublishAdminTemplate, updateAdminTemplate, type TemplateActor,
  type TemplateInput } from "@/features/report-templates/admin/service";

const id = "11111111-1111-4111-8111-111111111111";
const actor = { userId: "admin-1", role: "ADMIN" };
const input: TemplateInput = { slug: "sample", title: "합성 양식", category: "template", reportCategory: "classic-book",
  description: null, version: "1.0", body: "합성 본문", published: true, order: 2 };
const row = { ...input, id, updatedAt: new Date(0), createdAt: new Date(1), futureField: "내부 정보" };
const entries: readonly [string, (actor: TemplateActor) => Promise<unknown>][] = [
  ["list", value => listAdminTemplates(value)], ["get", value => getAdminTemplate(value, id)],
  ["duplicate", value => hasDuplicateSlug(value, input.slug)],
  ["prepare", value => prepareTemplateUpdate(value, id, input.slug)],
  ["create", value => createAdminTemplate(value, input)],
  ["update", value => updateAdminTemplate(value, id, input)],
  ["unpublish", value => unpublishAdminTemplate(value, id)],
];
beforeEach(() => vi.resetAllMocks());

for (const [name, run] of entries) {
  it.each([{ userId: id, role: "MEMBER" }, { userId: id, role: "FACULTY" },
    { userId: id, role: "PENDING" }, { userId: "", role: "ADMIN" },
    { userId: "", role: "" }])(`${name}는 비관리자·빈 주체를 저장소 전에 거부한다 (%j)`, async value => {
    // 준비: 유효한 저장소 결과가 인가 누락을 가리지 않게 합니다.
    mocks.listTemplates.mockResolvedValue([row]); mocks.findById.mockResolvedValue(row);
    mocks.findBySlug.mockResolvedValue(row);
    // 실행·검증: 모든 서비스 진입점이 거부하고 저장소는 호출되지 않습니다.
    await expect(run(value)).rejects.toThrow("TEMPLATE_ADMIN_REQUIRED");
    for (const mock of Object.values(mocks)) expect(mock).not.toHaveBeenCalled();
  });
}

it("목록 DTO는 정확한 표시 필드만 반환한다", async () => {
  // 준비: 저장소 결과에 내부 필드를 섞습니다.
  mocks.listTemplates.mockResolvedValue([row]);
  // 실행: 관리자 조회입니다.
  const result = await listAdminTemplates(actor);
  // 검증: 목록의 아홉 키만 남습니다.
  expect(result).toEqual([{ id, slug: "sample", title: "합성 양식", category: "template", reportCategory: "classic-book",
    version: "1.0", published: true, order: 2, updatedAt: new Date(0) }]);
  expect(Object.keys(result[0])).toEqual(["id", "slug", "title", "category", "reportCategory", "version", "published", "order", "updatedAt"]);
});

it("편집 DTO는 ID와 폼 필드만 반환한다", async () => {
  // 준비: 메타데이터를 포함한 저장소 행입니다.
  mocks.findById.mockResolvedValue(row);
  // 실행·검증: 폼의 최소 초기값 계약만 반환합니다.
  expect(await getAdminTemplate(actor, id)).toEqual({ id, ...input });
});

it("다른 대상의 slug가 있으면 이전 대상 조회를 생략한다", async () => {
  // 준비: 다른 양식의 slug입니다.
  mocks.findBySlug.mockResolvedValue({ id: "other" });
  // 실행·검증: 중복 판단이 다음 조회보다 먼저입니다.
  expect(await prepareTemplateUpdate(actor, id, "sample")).toEqual({ kind: "duplicate" });
  expect(mocks.findById).not.toHaveBeenCalled();
});

it("자기 slug는 허용하며 조회 순서와 이전 slug를 유지한다", async () => {
  // 준비: 자기 slug와 기존 대상입니다.
  mocks.findBySlug.mockResolvedValue({ id }); mocks.findById.mockResolvedValue({ id, slug: "old" });
  // 실행·검증: slug 조회 후 ID 조회를 합니다.
  expect(await prepareTemplateUpdate(actor, id, "sample")).toEqual({ kind: "ready", oldSlug: "old" });
  expect(mocks.findBySlug).toHaveBeenCalledExactlyOnceWith("sample");
  expect(mocks.findById).toHaveBeenCalledExactlyOnceWith(id);
  expect(mocks.findBySlug.mock.invocationCallOrder[0]).toBeLessThan(mocks.findById.mock.invocationCallOrder[0]);
});

it("누락 대상의 비공개는 쓰기 없이 종료한다", async () => {
  // 준비: 대상이 없습니다.
  mocks.findById.mockResolvedValue(undefined);
  // 실행·검증: 원래 누락 응답을 어댑터가 만들 수 있습니다.
  expect(await unpublishAdminTemplate(actor, id)).toBeNull();
  expect(mocks.unpublishTemplate).not.toHaveBeenCalled();
});

it("비공개 서비스는 저장 완료 후 slug만 반환한다", async () => {
  // 준비: 비공개 저장을 지연합니다.
  const entered = Promise.withResolvers<void>(); const persisted = Promise.withResolvers<void>();
  mocks.findById.mockResolvedValue(row);
  mocks.unpublishTemplate.mockImplementation(() => { entered.resolve(); return persisted.promise; });
  let completed = false;
  // 실행: 저장 완료 전 반환 여부를 확인합니다.
  const pending = unpublishAdminTemplate(actor, id).then(value => { completed = true; return value; });
  await entered.promise;
  await Promise.resolve();
  await Promise.resolve();
  expect(completed).toBe(false); persisted.resolve();
  // 검증: 완료 후 캐시에 필요한 slug만 반환합니다.
  expect(await pending).toEqual({ slug: "sample" });
});
