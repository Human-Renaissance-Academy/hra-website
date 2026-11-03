// @vitest-environment node
/**
 * 관리자 가이드북 서비스의 모든 진입점 재인가와 DTO 공개 범위를 검증합니다.
 * 저장소만 격리해 비관리자 요청이 PostgreSQL에 도달하지 않는지 확인합니다.
 */
import { beforeEach, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  listGuidebooks: vi.fn(), findGuidebook: vi.fn(), insertGuidebook: vi.fn(),
  replaceGuidebookFile: vi.fn(), updateGuidebookTitle: vi.fn(), deleteGuidebook: vi.fn(),
}));
vi.mock("@/features/guidebooks/admin/repository", () => repository);
import * as service from "@/features/guidebooks/admin/service";

const actor = { userId: "admin-1", role: "ADMIN" };
const id = "11111111-1111-4111-8111-111111111111";
const input = { title: "새 안내", fileUrl: "https://fixture.invalid/new.pdf", fileName: "새.pdf" };
const row = { id, ...input, createdAt: new Date(0), internal: "비공개" };
const entries = [
  { name: "목록", run: service.listAdminGuidebooks },
  { name: "편집", run: (actor: service.GuidebookActor) => service.getAdminGuidebook(actor, id) },
  { name: "수정 대상", run: (actor: service.GuidebookActor) => service.getGuidebookUpdateTarget(actor, id) },
  { name: "생성", run: (actor: service.GuidebookActor) => service.createAdminGuidebook(actor, input) },
  { name: "파일 교체", run: (actor: service.GuidebookActor) => service.replaceAdminGuidebookFile(actor, id, { ...input, previousFileUrl: "https://fixture.invalid/old.pdf" }) },
  { name: "제목 수정", run: (actor: service.GuidebookActor) => service.updateAdminGuidebookTitle(actor, id, input.title) },
  { name: "삭제", run: (actor: service.GuidebookActor) => service.deleteAdminGuidebook(actor, id) },
];

beforeEach(() => {
  vi.resetAllMocks();
  repository.listGuidebooks.mockResolvedValue([row]);
  repository.findGuidebook.mockResolvedValue(row);
  repository.replaceGuidebookFile.mockResolvedValue(true);
  repository.updateGuidebookTitle.mockResolvedValue(true);
  repository.deleteGuidebook.mockResolvedValue(true);
});

it.each(entries)("$name 진입은 비관리자·빈 주체를 저장소 전에 거부한다", async ({ run }) => {
  // 준비: 권한 부족·빈 역할·빈 사용자 ID를 각각 제공합니다.
  for (const denied of [
    { userId: "member-1", role: "MEMBER" }, { userId: "faculty-1", role: "FACULTY" },
    { userId: "pending-1", role: "PENDING" }, { userId: "", role: "" }, { userId: "", role: "ADMIN" },
  ]) {
    // 실행: 웹 외 호출도 동일 서비스 경계로 들어옵니다.
    await expect(run(denied)).rejects.toThrow("GUIDEBOOK_ADMIN_REQUIRED");
    // 검증: 어떤 저장소 함수에도 도달하지 않습니다.
    for (const method of Object.values(repository)) expect(method).not.toHaveBeenCalled();
  }
});

it("목록 DTO는 표시 필드만 반환한다", async () => {
  // 준비: 저장소 행에는 원본 URL과 내부 필드가 포함됩니다.
  // 실행: 관리자 목록을 조회합니다.
  const result = await service.listAdminGuidebooks(actor);
  // 검증: 필요한 값만 새 객체로 제공합니다.
  expect(result).toEqual([{ id, title: input.title, fileName: input.fileName, createdAt: row.createdAt }]);
});

it("편집 DTO는 제목·파일명만 반환한다", async () => {
  // 준비: 전체 행을 반환하는 기존 findFirst를 유지합니다.
  // 실행: 편집 데이터를 조회합니다.
  const result = await service.getAdminGuidebook(actor, id);
  // 검증: ID·파일 URL·내부 필드는 폼 DTO 밖에 있습니다.
  expect(result).toEqual({ title: input.title, fileName: input.fileName });
});

it("수정 대상 DTO는 낙관적 비교에 필요한 URL만 반환한다", async () => {
  // 준비: 전체 저장소 행입니다.
  // 실행: 파일 검증 전 대상을 조회합니다.
  const result = await service.getGuidebookUpdateTarget(actor, id);
  // 검증: 비교용 참조 외에는 제공하지 않습니다.
  expect(result).toEqual({ fileUrl: input.fileUrl });
});
