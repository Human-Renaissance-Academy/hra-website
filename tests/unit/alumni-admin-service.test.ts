/** 관리자 서비스의 모든 진입점 재인가·DTO 제한·업로드 순서와 실패 복구를 검증합니다. */
import { beforeEach, expect, it, vi } from "vitest";
const repository = vi.hoisted(() => ({
  listAdminItems: vi.fn(), getAdminStory: vi.fn(), findCreatedStory: vi.fn(), getMaxOrder: vi.fn(),
  insertStory: vi.fn(), listReferencedImages: vi.fn(), getExistingImage: vi.fn(), updateStory: vi.fn(),
  insertImages: vi.fn(), togglePin: vi.fn(), reorderStories: vi.fn(), deleteStory: vi.fn(),
}));
const mocks = vi.hoisted(() => ({ upload: vi.fn(), cleanup: vi.fn() }));
vi.mock("@/features/alumni/admin/repository", () => repository);
vi.mock("@/lib/create-with-blobs", () => ({ cleanupCreatedBlobs: mocks.cleanup }));
import * as service from "@/features/alumni/admin/service";

const actor = { userId: "admin-1", role: "ADMIN" };
const story = { name: "합성", quote: "문구", content: "본문", isFeatured: true };
const command = { id: "story-1", story, directUrls: ["https://direct.invalid/a"], upload: mocks.upload };
const operations = [
  (actor: service.AlumniActor) => service.listAdminItems(actor),
  (actor: service.AlumniActor) => service.getAdminStory(actor, "story-1"),
  (actor: service.AlumniActor) => service.createStory(actor, command),
  (actor: service.AlumniActor) => service.updateStory(actor, command),
  (actor: service.AlumniActor) => service.togglePin(actor, "story-1"),
  (actor: service.AlumniActor) => service.reorderStories(actor, ["story-1"]),
  (actor: service.AlumniActor) => service.deleteStory(actor, "story-1"),
];
beforeEach(() => {
  vi.resetAllMocks();
  mocks.upload.mockResolvedValue(["https://legacy.invalid/a"]);
  repository.getMaxOrder.mockResolvedValue(3);
  repository.getExistingImage.mockResolvedValue({ imageUrl: null });
  repository.updateStory.mockResolvedValue(true);
});

it.each(operations)("서비스 진입은 비관리자·빈 사용자·빈 역할을 저장소와 업로드 전에 거절한다", async run => {
  for (const denied of [{ userId: "member-1", role: "MEMBER" }, { userId: "", role: "ADMIN" }, { userId: "", role: "" }]) {
    await expect(run(denied)).rejects.toThrow("ALUMNI_ADMIN_REQUIRED");
  }
  await expect(Reflect.apply(run, undefined, [null])).rejects.toThrow("ALUMNI_ADMIN_REQUIRED");
  await expect(Reflect.apply(run, undefined, [{}])).rejects.toThrow("ALUMNI_ADMIN_REQUIRED");
  for (const mock of Object.values(repository)) expect(mock).not.toHaveBeenCalled();
  expect(mocks.upload).not.toHaveBeenCalled();
});

it("목록 DTO는 다섯 표시 필드 외의 내부 열을 제거한다", async () => {
  const item = { id: "story-1", name: "합성", quote: "문구", content: "본문", pinned: false };
  repository.listAdminItems.mockResolvedValue([{ ...item, viewCount: 99, createdAt: new Date(0) }]);
  expect(await service.listAdminItems(actor)).toEqual([item]);
});

it("편집 DTO는 여섯 기본값 외의 내부 열을 제거한다", async () => {
  const defaults = { ...story, title: null, imageUrl: null };
  repository.getAdminStory.mockResolvedValue({ ...defaults, id: "story-1", pinned: false, viewCount: 99 });
  expect(await service.getAdminStory(actor, "story-1")).toEqual(defaults);
});

it("이미 생성된 요청 키는 업로드와 삽입을 다시 실행하지 않는다", async () => {
  repository.findCreatedStory.mockResolvedValue({ id: "story-1" });
  await service.createStory(actor, command);
  expect(mocks.upload).not.toHaveBeenCalled();
  expect(repository.insertStory).not.toHaveBeenCalled();
});

it("생성은 최대 순서 조회 후 업로드하고 서버 사진을 직접 사진보다 먼저 저장한다", async () => {
  await service.createStory(actor, command);
  expect(repository.getMaxOrder.mock.invocationCallOrder[0]).toBeLessThan(mocks.upload.mock.invocationCallOrder[0]);
  expect(mocks.upload.mock.invocationCallOrder[0]).toBeLessThan(repository.insertStory.mock.invocationCallOrder[0]);
  expect(repository.insertStory).toHaveBeenCalledWith({ id: "story-1", story,
    uploadedUrls: ["https://legacy.invalid/a", "https://direct.invalid/a"] }, 4);
});

it("배치 실패 후 글이 없으면 서버 업로드만 정리하고 원래 실패를 전파한다", async () => {
  const failure = new Error("QA_INSERT_FAILED");
  repository.insertStory.mockRejectedValue(failure);
  await expect(service.createStory(actor, command)).rejects.toBe(failure);
  expect(repository.findCreatedStory).toHaveBeenCalledTimes(2);
  expect(mocks.cleanup).toHaveBeenCalledExactlyOnceWith(["https://legacy.invalid/a"]);
});

it("커밋 응답 유실 후 참조된 서버 사진은 정리하지 않는다", async () => {
  repository.findCreatedStory.mockResolvedValueOnce(undefined).mockResolvedValueOnce({ id: "story-1" });
  repository.insertStory.mockRejectedValue(new Error("QA_RESPONSE_LOST"));
  repository.listReferencedImages.mockResolvedValue([{ url: "https://legacy.invalid/a" }]);
  await service.createStory(actor, command);
  expect(mocks.cleanup).toHaveBeenCalledExactlyOnceWith([]);
});

it("없는 수정 대상은 업로드를 실행하지 않는다", async () => {
  repository.getExistingImage.mockResolvedValue(undefined);
  expect(await service.updateStory(actor, command)).toEqual({ success: false, message: "수료생 이야기를 찾을 수 없습니다." });
  expect(mocks.upload).not.toHaveBeenCalled();
});

it("수정은 직접 사진 먼저 저장하고 조건부 갱신 성공 뒤 첨부를 삽입한다", async () => {
  await service.updateStory(actor, command);
  expect(repository.getExistingImage.mock.invocationCallOrder[0]).toBeLessThan(mocks.upload.mock.invocationCallOrder[0]);
  expect(repository.updateStory).toHaveBeenCalledWith({ id: "story-1", story,
    uploadedUrls: ["https://direct.invalid/a", "https://legacy.invalid/a"] }, null);
  expect(repository.updateStory.mock.invocationCallOrder[0]).toBeLessThan(repository.insertImages.mock.invocationCallOrder[0]);
});

it("조건부 갱신 충돌은 첨부 삽입과 Blob 정리를 실행하지 않는다", async () => {
  repository.updateStory.mockResolvedValue(false);
  expect((await service.updateStory(actor, command)).success).toBe(false);
  expect(repository.insertImages).not.toHaveBeenCalled();
  expect(mocks.cleanup).not.toHaveBeenCalled();
});

it("고정 DTO는 저장소가 추가한 내부 열을 제거한다", async () => {
  repository.togglePin.mockResolvedValue({ pinned: true, viewCount: 99 });
  expect(await service.togglePin(actor, "story-1")).toEqual({ pinned: true });
});
