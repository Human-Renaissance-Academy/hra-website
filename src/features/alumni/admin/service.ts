/**
 * 수료생 관리자 업무의 재인가와 저장 순서를 소유합니다.
 * Web 입력·캐시·이동은 어댑터에 남기고 표시용 DTO만 반환합니다.
 */
import "server-only";
import { cleanupCreatedBlobs } from "@/lib/create-with-blobs";
import * as repository from "./repository";
import type { AlumniStoryInput } from "./repository";

export type AlumniActor = { userId: string; role: string };
export type AlumniSaveCommand = {
  readonly id: string;
  readonly story: AlumniStoryInput;
  readonly directUrls: readonly string[];
  readonly upload: () => Promise<string[]>;
};

/** 다른 어댑터를 통한 직접 호출도 홈페이지 관리자만 허용합니다. */
function assertAdmin(actor: AlumniActor): void {
  if (!actor || actor.role !== "ADMIN" || typeof actor.userId !== "string" || !actor.userId) {
    throw new Error("ALUMNI_ADMIN_REQUIRED");
  }
}

/** 목록에 필요한 다섯 필드만 반환합니다. */
export async function listAdminItems(actor: AlumniActor) {
  assertAdmin(actor);
  return (await repository.listAdminItems()).map(item => ({
    id: item.id, name: item.name, quote: item.quote, content: item.content, pinned: item.pinned,
  }));
}

/** 편집 폼에는 여섯 기본값만 제공합니다. */
export async function getAdminStory(actor: AlumniActor, id: string) {
  assertAdmin(actor);
  const story = await repository.getAdminStory(id);
  return story ? {
    name: story.name, title: story.title, quote: story.quote, content: story.content,
    imageUrl: story.imageUrl, isFeatured: story.isFeatured,
  } : null;
}

/** 존재·최대 순서 조회 후 업로드하고 기존 배치 실패 복구 순서를 유지합니다. */
export async function createStory(actor: AlumniActor, command: AlumniSaveCommand): Promise<void> {
  assertAdmin(actor);
  const { id, story } = command;
  const alreadyCreated = await repository.findCreatedStory(id);
  if (!alreadyCreated) {
    const maxOrder = await repository.getMaxOrder();
    const nextOrder = (maxOrder ?? 0) + 1;
    const legacyUrls = await command.upload();
    const uploadedUrls = [...legacyUrls, ...command.directUrls];
    try {
      await repository.insertStory({ id, story, uploadedUrls }, nextOrder);
    } catch (error) {
      // 커밋 후 응답 유실 가능성을 확인한 뒤 미참조 Blob만 정리합니다.
      const existing = await repository.findCreatedStory(id);
      if (!existing) {
        await cleanupCreatedBlobs(legacyUrls);
        throw error;
      }
      const referenced = uploadedUrls.length > 0 ? await repository.listReferencedImages(id) : [];
      const referencedUrls = new Set(referenced.map(row => row.url));
      await cleanupCreatedBlobs(legacyUrls.filter(url => !referencedUrls.has(url)));
    }
  }
}

/** 대상 조회·업로드·조건부 갱신·첨부 삽입 순서를 유지합니다. */
export async function updateStory(actor: AlumniActor, command: AlumniSaveCommand) {
  assertAdmin(actor);
  const { id, story } = command;
  const existing = await repository.getExistingImage(id);
  if (!existing) return { success: false, message: "수료생 이야기를 찾을 수 없습니다." };
  const uploadedUrls = [...command.directUrls, ...await command.upload()];
  if (!await repository.updateStory({ id, story, uploadedUrls }, existing.imageUrl)) {
    return { success: false, message: "수료생 이야기 정보가 변경됐습니다. 새로고침 후 다시 시도해주세요." };
  }
  if (uploadedUrls.length > 0) await repository.insertImages(id, uploadedUrls);
  return { success: true, message: "" };
}

/** 단일 반전 명령의 저장값만 제공합니다. */
export async function togglePin(actor: AlumniActor, id: string) {
  assertAdmin(actor);
  const updated = await repository.togglePin(id);
  return updated ? { pinned: updated.pinned } : null;
}

/** 실제 변경 건수로 전체 요청의 일치 여부를 판단합니다. */
export async function reorderStories(actor: AlumniActor, ids: readonly string[]) {
  assertAdmin(actor);
  const { affected } = await repository.reorderStories(ids);
  return { affected, matched: affected === ids.length };
}

/** 관리자만 기존 파일을 보존하는 멱등 삭제를 실행합니다. */
export async function deleteStory(actor: AlumniActor, id: string): Promise<void> {
  assertAdmin(actor);
  await repository.deleteStory(id);
}
