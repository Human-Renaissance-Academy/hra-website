/**
 * 공개 sitemap에 넣을 경로 목록을 결정하는 Application Service입니다.
 *
 * 역할:
 * - 공개 정적 경로(홈·소개·커리큘럼 등)와 공개된 동적 콘텐츠(게시 공지·수료생 이야기·갤러리)만 반환합니다.
 * - 관리자(/admin)·회원(/member, /mypage, /resources)·인증(/login 등)·학사(/academic)·지원서 작성·승인 대기
 *   경로와 비공개 ID는 어떤 경우에도 포함하지 않습니다.
 * - 사이트 주소·환경별 색인 여부는 Web 경계(src/app/sitemap.ts)가 정합니다. 이 서비스는 상대 경로만 반환합니다.
 */
import "server-only";

import { z } from "zod/v4";
import { logServerError } from "@/lib/errors";
import {
  listAlumniStorySitemapRows,
  listGallerySitemapRows,
  listPublishedNoticeSitemapRows,
  type SitemapContentRow,
} from "./repository";

/** sitemap 한 항목의 상대 경로와 선택적 수정 시각입니다. */
export type PublicSitemapEntry = {
  path: string;
  lastModified?: Date;
};

// 공개 헤더 메뉴에 있는 정적 공개 경로입니다. 보호 경로(/pending 등)는 넣지 않습니다.
// /recruitment/apply 는 크롤링은 허용하지만, 모집 기간에 따라 내용이 바뀌는 지원서 진입 화면이고
// 모집안내(/recruitment)에서 바로 연결되므로 sitemap에는 별도로 넣지 않습니다.
export const PUBLIC_STATIC_SITEMAP_PATHS = [
  "/",
  "/about",
  "/curriculum",
  "/faculty",
  "/cohorts",
  "/recruitment",
  "/notices",
  "/press",
  "/gallery",
  "/alumni",
  "/faq",
] as const;

// 종류별 최대 항목 수. sitemap 한 파일의 상한(50,000)보다 충분히 작게 제한합니다.
const maxEntriesPerKind = 5000;

// 공개 상세 경로가 받는 ID 형식과 같게 UUID만 허용해 예상 밖 값이 URL에 섞이지 않게 합니다.
const contentIdSchema = z.uuid();

/** 행을 상세 경로 항목으로 바꾸고 형식이 맞지 않는 ID는 버립니다. */
function toEntries(prefix: string, rows: readonly SitemapContentRow[]): PublicSitemapEntry[] {
  return rows
    .filter((row) => contentIdSchema.safeParse(row.id).success)
    .map((row) => ({ path: `${prefix}/${row.id}`, lastModified: row.updatedAt }));
}

/**
 * 정적 공개 경로 뒤에 게시된 동적 콘텐츠 경로를 붙여 반환합니다.
 * DB 조회가 실패하면 오류를 기록하고 정적 경로만 반환해 robots가 안내한 sitemap이 500이 되지 않게 합니다.
 */
export async function listPublicSitemapEntries(): Promise<PublicSitemapEntry[]> {
  const staticEntries: PublicSitemapEntry[] = PUBLIC_STATIC_SITEMAP_PATHS.map((path) => ({ path }));

  try {
    const [noticeRows, alumniRows, galleryRows] = await Promise.all([
      listPublishedNoticeSitemapRows(maxEntriesPerKind),
      listAlumniStorySitemapRows(maxEntriesPerKind),
      listGallerySitemapRows(maxEntriesPerKind),
    ]);
    return [
      ...staticEntries,
      ...toEntries("/notices", noticeRows),
      ...toEntries("/alumni", alumniRows),
      ...toEntries("/gallery", galleryRows),
    ];
  } catch (error) {
    logServerError("sitemap/dynamic-content", error);
    return staticEntries;
  }
}
