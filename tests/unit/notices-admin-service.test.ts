/**
 * 관리자 공지 서비스의 모든 진입점 재인가와 반환 DTO 제한을 검증합니다.
 * 저장소 mock은 접근 여부와 내부 필드 차단을 관찰하는 경계로만 사용합니다.
 */
import { beforeEach, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  listNotices: vi.fn(), findNotice: vi.fn(), findNoticeTarget: vi.fn(),
  insertNotice: vi.fn(), updateNotice: vi.fn(), deleteNotice: vi.fn(),
  togglePin: vi.fn(), toggleStatus: vi.fn(),
}));
vi.mock("@/features/notices/admin/repository", () => repository);
import * as service from "@/features/notices/admin/service";
import type { NoticeActor } from "@/features/notices/admin/service";

const actor = { userId: "admin-1", role: "ADMIN" };
const id = "10000000-0000-4000-8000-000000000001";
const input = { title: "합성 공지", content: "합성 본문", status: "DRAFT", pinned: false } as const;
const calls = [
  { name: "listAdminNotices", run: (a: NoticeActor) => service.listAdminNotices(a) },
  { name: "getAdminNotice", run: (a: NoticeActor) => service.getAdminNotice(a, id) },
  { name: "createNotice", run: (a: NoticeActor) => service.createNotice(a, input) },
  { name: "updateNotice", run: (a: NoticeActor) => service.updateNotice(a, id, input) },
  { name: "deleteNotice", run: (a: NoticeActor) => service.deleteNotice(a, id) },
  { name: "togglePin", run: (a: NoticeActor) => service.togglePin(a, id) },
  { name: "toggleStatus", run: (a: NoticeActor) => service.toggleStatus(a, id) },
];

beforeEach(() => vi.resetAllMocks());

it.each(calls)("$name은 비관리자와 빈 actor를 저장소 접근 전에 거부한다", async ({ run }) => {
  // 준비: 각 전역 비관리자 역할과 빈 주체를 사용합니다.
  for (const invalid of [
    { userId: "member-1", role: "MEMBER" }, { userId: "faculty-1", role: "FACULTY" },
    { userId: "pending-1", role: "PENDING" }, { userId: "", role: "ADMIN" },
    { userId: "", role: "" },
  ]) {
    // 실행: Web adapter를 우회한 서비스 호출입니다.
    await expect(run(invalid)).rejects.toThrow("NOTICE_ADMIN_REQUIRED");
    // 확인: 모든 저장소 진입점에 접근하지 않았습니다.
    for (const call of Object.values(repository)) expect(call).not.toHaveBeenCalled();
  }
});

it("새 서비스 함수가 인가 검사 목록에서 누락되지 않는다", () => {
  // 준비: 서비스의 실제 함수 export입니다.
  // 실행: 검사 목록과 비교합니다.
  const names = Object.keys(service).sort();
  // 확인: 모든 진입점이 위 거부 검사에 포함됩니다.
  expect(names).toEqual(calls.map(call => call.name).sort());
});

it("목록 DTO는 여섯 표시 필드만 반환한다", async () => {
  // 준비: 내부 열이 섞인 저장소 결과입니다.
  const createdAt = new Date(0);
  repository.listNotices.mockResolvedValue([{ ...input, id, createdAt, authorId: "내부", viewCount: 7 }]);
  // 실행: 관리자 목록 조회입니다.
  const result = await service.listAdminNotices(actor);
  // 확인: 필드 값과 whitelist입니다.
  expect(result).toEqual([{ id, ...input, createdAt }]);
  expect(Object.keys(result[0])).toEqual(["id", "title", "content", "status", "pinned", "createdAt"]);
});

it("편집 DTO는 폼 네 필드만 반환한다", async () => {
  // 준비: 추가 내부 열이 있는 행입니다.
  repository.findNotice.mockResolvedValue({ ...input, id, authorId: "내부" });
  // 실행: 편집 조회입니다.
  const result = await service.getAdminNotice(actor, id);
  // 확인: 저장소 행 전체를 노출하지 않습니다.
  expect(result).toEqual(input);
});

it.each(["getAdminNotice", "togglePin", "toggleStatus"] as const)("%s의 누락 결과는 null이다", async name => {
  // 준비: 해당 저장소 결과가 없습니다.
  repository.findNotice.mockResolvedValue(null);
  repository.togglePin.mockResolvedValue(null);
  repository.toggleStatus.mockResolvedValue(null);
  // 실행: 서비스 조회 또는 반전입니다.
  const result = await service[name](actor, id);
  // 확인: 누락 상태를 유지합니다.
  expect(result).toBeNull();
});

it.each([
  { name: "고정", run: () => service.togglePin(actor, id), saved: { pinned: true }, mock: repository.togglePin },
  { name: "게시", run: () => service.toggleStatus(actor, id), saved: { status: "PUBLISHED" }, mock: repository.toggleStatus },
])("$name 반전 DTO는 해당 명령의 저장 필드만 반환한다", async ({ run, saved, mock }) => {
  // 준비: RETURNING에 내부 열이 추가된 결과입니다.
  mock.mockResolvedValue({ ...saved, id, authorId: "내부" });
  // 실행: 한 번의 반전 명령입니다.
  const result = await run();
  // 확인: 저장값만 전달하며 존재 조회는 하지 않습니다.
  expect(result).toEqual(saved);
  expect(mock).toHaveBeenCalledExactlyOnceWith(id);
  expect(repository.findNoticeTarget).not.toHaveBeenCalled();
});

it("생성은 현재 관리자를 작성자로 전달한다", async () => {
  // 준비: 검증된 폼 입력입니다.
  // 실행: 생성 서비스입니다.
  await service.createNotice(actor, input);
  // 확인: 작성자 출처는 actor입니다.
  expect(repository.insertNotice).toHaveBeenCalledExactlyOnceWith(input, actor.userId);
});

it.each(["updateNotice", "deleteNotice"] as const)("%s는 선행 조회 누락 시 쓰기를 생략한다", async name => {
  // 준비: 기존 존재 확인이 실패합니다.
  repository.findNoticeTarget.mockResolvedValue(null);
  // 실행: 수정 또는 삭제 서비스입니다.
  const result = name === "updateNotice" ? await service.updateNotice(actor, id, input) : await service.deleteNotice(actor, id);
  // 확인: 누락 결과와 쓰기 미실행입니다.
  expect(result).toBe(false);
  expect(repository.updateNotice).not.toHaveBeenCalled(); expect(repository.deleteNotice).not.toHaveBeenCalled();
});

it("수정은 선행 조회 뒤 실제 변경 실패도 유지한다", async () => {
  // 준비: 조회 후 삭제 경합으로 변경 행이 없습니다.
  repository.findNoticeTarget.mockResolvedValue({ id }); repository.updateNotice.mockResolvedValue(false);
  // 실행: 수정 서비스입니다.
  const result = await service.updateNotice(actor, id, input);
  // 확인: 성공으로 오인하지 않습니다.
  expect(result).toBe(false);
  expect(repository.updateNotice).toHaveBeenCalledExactlyOnceWith(id, input);
});

it("삭제는 선행 확인 뒤 기존 void 삭제를 성공으로 처리한다", async () => {
  // 준비: 대상의 ID가 있습니다.
  repository.findNoticeTarget.mockResolvedValue({ id });
  // 실행: 삭제 서비스입니다.
  const result = await service.deleteNotice(actor, id);
  // 확인: 기존 삭제 경합 의미를 유지합니다.
  expect(result).toBe(true);
  expect(repository.deleteNotice).toHaveBeenCalledExactlyOnceWith(id);
});
