/**
 * 언론보도 관리자 서비스의 모든 진입 인가와 DTO 허용 필드를 검증합니다.
 * 웹 adapter를 우회해도 비관리자는 저장소를 호출할 수 없습니다.
 */
import { beforeEach, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  listItems: vi.fn(), getItem: vi.fn(), getMaxOrder: vi.fn(), insertItem: vi.fn(),
  updateItem: vi.fn(), deleteItem: vi.fn(), reorderItems: vi.fn(),
}));
vi.mock("@/features/press/admin/repository", () => repository);

import * as service from "@/features/press/admin/service";

const admin = { userId: "admin-1", role: "ADMIN" };
const input = { title: "합성 기사", source: "합성 매체", url: "https://press.invalid/article", publishedAt: "2026-10-24" };
const calls = {
  listAdminItems: (actor: service.PressActor) => service.listAdminItems(actor),
  getAdminItem: (actor: service.PressActor) => service.getAdminItem(actor, "id"),
  createItem: (actor: service.PressActor) => service.createItem(actor, input),
  updateItem: (actor: service.PressActor) => service.updateItem(actor, "id", input),
  deleteItem: (actor: service.PressActor) => service.deleteItem(actor, "id"),
  reorderItems: (actor: service.PressActor) => service.reorderItems(actor, ["id"]),
};

beforeEach(() => { vi.resetAllMocks(); });

it("모든 서비스 export가 인가 검사 대상에 포함된다", () => {
  // 준비 및 실행: 실제 런타임 export를 열거합니다.
  // 검증: 새 export 추가도 검사 누락으로 실패해야 합니다.
  expect(Object.keys(service).sort()).toEqual(Object.keys(calls).sort());
});

for (const [name, call] of Object.entries(calls)) {
  it.each([null, undefined, {}, { userId: 1, role: "ADMIN" }])(`${name}은 런타임의 빈 주체 %j도 거부한다`, async actor => {
    // 준비: 타입 검사를 우회하는 외부 adapter의 잘못된 주체입니다.
    // 실행: 런타임 호출 경계를 검사합니다.
    await expect(Reflect.apply(call, undefined, [actor])).rejects.toThrow("PRESS_ADMIN_REQUIRED");
    // 검증: 저장소는 호출되지 않습니다.
    for (const method of Object.values(repository)) expect(method).not.toHaveBeenCalled();
  });
  it.each([
    { userId: "member-1", role: "MEMBER" }, { userId: "faculty-1", role: "FACULTY" },
    { userId: "pending-1", role: "PENDING" }, { userId: "", role: "ADMIN" },
    { userId: "", role: "" },
  ])(`${name}은 유효하지 않은 주체 %j를 저장소 접근 전에 거부한다`, async actor => {
    // 준비: 웹 인가를 우회한 비관리자 또는 빈 주체입니다.
    // 실행: 서비스를 직접 호출합니다.
    await expect(call(actor)).rejects.toThrow("PRESS_ADMIN_REQUIRED");
    // 검증: 읽기와 쓰기 모두 시작하지 않습니다.
    for (const method of Object.values(repository)) expect(method).not.toHaveBeenCalled();
  });
}

it("목록 DTO는 저장소의 추가 열을 제거한다", async () => {
  // 준비: 향후 추가될 내부 열도 포함합니다.
  const row = { id: "id", ...input, publishedAt: new Date(input.publishedAt), viewCount: 99, order: 3, internal: "비공개" };
  repository.listItems.mockResolvedValueOnce([row]);
  // 실행: 인가된 목록 호출입니다.
  const result = await service.listAdminItems(admin);
  // 검증: 네 표시 필드만 남습니다.
  expect(result).toStrictEqual([{ id: "id", title: input.title, source: input.source, publishedAt: row.publishedAt }]);
});

it("편집 DTO는 여섯 입력 필드만 허용한다", async () => {
  // 준비: 전체 DB 행에 내부 메타데이터가 있습니다.
  const row = { id: "id", ...input, publishedAt: new Date(input.publishedAt), description: null, imageUrl: null, createdAt: new Date(0), viewCount: 9, internal: "비공개" };
  repository.getItem.mockResolvedValueOnce(row);
  // 실행: 편집 조회입니다.
  const result = await service.getAdminItem(admin, "id");
  // 검증: 행 타입이 DTO로 그대로 노출되지 않습니다.
  expect(result).toStrictEqual({ title: input.title, source: input.source, url: input.url, publishedAt: row.publishedAt, description: null, imageUrl: null });
});

it("편집 대상이 없으면 null을 유지한다", async () => {
  // 준비: 누락된 행입니다.
  repository.getItem.mockResolvedValueOnce(null);
  // 실행 및 검증: 빈 DTO로 위장하지 않습니다.
  expect(await service.getAdminItem(admin, "id")).toBeNull();
});

it.each([null, 7])("최대 순서 %s 다음 값과 기존 날짜·null 변환으로 생성한다", async maxOrder => {
  // 준비: 별도 최댓값 조회입니다.
  repository.getMaxOrder.mockResolvedValueOnce(maxOrder);
  // 실행: 새 기사 생성입니다.
  await service.createItem(admin, input);
  // 검증: 기존 비원자 정책과 저장값을 유지합니다.
  expect(repository.insertItem).toHaveBeenCalledExactlyOnceWith({ ...input, publishedAt: new Date(input.publishedAt), description: null, imageUrl: null }, (maxOrder ?? 0) + 1);
});

it.each([0, 2])("순서 실제 변경 건수 %s를 요청과 비교한다", async affected => {
  // 준비: 저장소가 반환한 실제 건수입니다.
  repository.reorderItems.mockResolvedValueOnce(affected);
  // 실행 및 검증: adapter의 메시지 판단에 필요한 값만 반환합니다.
  expect(await service.reorderItems(admin, ["a", "b"])).toEqual({ matched: affected === 2, affected });
});
