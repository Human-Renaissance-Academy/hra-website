// @vitest-environment node
/** 관리자 갤러리의 관계 조회·CASE 원자성·대표 사진 조건·삭제 종속 행을 격리 PostgreSQL에서 검증합니다. */
import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { createQaPostgres } from "../support/resource-qa-postgres.mjs";
import { createPsqlTransport, qaDatabaseUrl, qaNeonEndpoint } from "../support/neon-psql-transport.mjs";

const mocks = vi.hoisted(() => {
  const state: { database: NeonHttpDatabase<typeof schema> | undefined } = { database: undefined };
  return state;
});
vi.mock("@/lib/db", () => ({ get db() {
  if (!mocks.database) throw new Error("격리 DB 준비 전 호출");
  return mocks.database;
} }));
import * as service from "@/features/gallery/admin/service";
import * as repository from "@/features/gallery/admin/repository";

const bin = process.env.HRA_TEST_PG_BIN;
const actor = { userId: "admin-1", role: "ADMIN" };
const id = "81000000-0000-4000-8000-000000000001";
const otherId = "81000000-0000-4000-8000-000000000002";
const a = "82000000-0000-4000-8000-000000000001";
const b = "82000000-0000-4000-8000-000000000002";
const c = "82000000-0000-4000-8000-000000000003";
const url = "https://gallery.invalid/a.png";

describe.skipIf(!bin)("관리자 갤러리 실제 PostgreSQL", () => {
  let cluster: ReturnType<typeof createQaPostgres>;
  const previousFetch = neonConfig.fetchFunction;
  const previousEndpoint = neonConfig.fetchEndpoint;
  beforeAll(() => {
    cluster = createQaPostgres(bin);
    cluster.sql(`CREATE TABLE galleries (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title varchar(300) NOT NULL, description text,
      cover_image_url text, view_count integer NOT NULL DEFAULT 0, created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now());
      CREATE TABLE gallery_images (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), gallery_id uuid NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
      url text NOT NULL, alt varchar(255), "order" integer NOT NULL, created_at timestamp NOT NULL DEFAULT now());`);
    const transport = createPsqlTransport(cluster.environment);
    neonConfig.fetchEndpoint = qaNeonEndpoint;
    neonConfig.fetchFunction = async (input: unknown, options: RequestInit) => {
      if (String(input) !== qaNeonEndpoint || options.method !== "POST" ||
        new Headers(options.headers).get("Neon-Connection-String") !== qaDatabaseUrl) {
        throw new Error("격리 SQL 범위 이외 요청 차단");
      }
      return Response.json(await transport(JSON.parse(String(options.body))));
    };
    mocks.database = drizzle(neon(qaDatabaseUrl), { schema });
  }, 30_000);
  beforeEach(() => {
    cluster.sql(`TRUNCATE galleries CASCADE;
      INSERT INTO galleries(id,title,description,cover_image_url,view_count,created_at) VALUES
      ('${id}','새 앨범','설명','${url}',7,'2026-10-02'),('${otherId}','빈 앨범',NULL,NULL,3,'2026-10-01');
      INSERT INTO gallery_images(id,gallery_id,url,alt,"order",created_at) VALUES
      ('${a}','${id}','${url}','늦은 사진',2,'2026-10-02'),
      ('${b}','${id}','https://gallery.invalid/b.png','첫 사진',2,'2026-10-01'),
      ('${c}','${id}','https://gallery.invalid/c.png',NULL,3,'2026-10-01');`);
  });
  afterAll(() => {
    neonConfig.fetchFunction = previousFetch; neonConfig.fetchEndpoint = previousEndpoint;
    mocks.database = undefined; cluster?.close();
  });
  it("목록 작성일 역순·사진 수와 편집 동점 순서를 유지한다", async () => {
    // 준비: 날짜와 사진 순서가 서로 다른 합성 행입니다.
    // 실행: 실제 목록과 편집 관계 쿼리를 수행합니다.
    const albums = await service.listAdminAlbums(actor);
    const edit = await service.getAdminGallery(actor, id);
    // 확인: 사진 수·동점 생성일 정렬과 기존 조회수 보존입니다.
    expect(albums.map(row => [row.id, row.images.length])).toEqual([[id, 3], [otherId, 0]]);
    expect(edit?.images.map(image => image.id)).toEqual([b, a, c]);
    expect(cluster.sql(`SELECT view_count FROM galleries WHERE id='${id}'`)).toBe("7");
  });
  it("CASE는 요청 순서 전체를 0 기반으로 저장한다", async () => {
    // 준비: 동일 앨범의 세 사진입니다.
    // 실행: 단일 CASE SQL을 호출합니다.
    const result = await service.reorderAdminImages(actor, id, [c, a, b]);
    // 확인: 변경 건수와 실제 순서를 검증합니다.
    expect(result).toEqual({ matched: true, affected: 3 });
    expect((await service.getAdminGallery(actor, id))?.images.map(image => [image.id, image.order])).toEqual([[c, 0], [a, 1], [b, 2]]);
  });
  it.each(["누락", "중복", "다른 앨범"])("CASE %s 요청은 어떤 사진도 부분 갱신하지 않는다", async kind => {
    // 준비: 누락·중복 또는 소속이 바뀐 ID를 구성합니다.
    if (kind === "다른 앨범") cluster.sql(`UPDATE gallery_images SET gallery_id='${otherId}' WHERE id='${c}'`);
    const ids = kind === "누락" ? [a, otherId] : kind === "중복" ? [a, a] : [a, c];
    const before = cluster.sql('SELECT id,"order" FROM gallery_images ORDER BY id');
    // 실행: 잠금·건수 검사를 포함한 실제 CASE를 수행합니다.
    const result = await service.reorderAdminImages(actor, id, ids);
    // 확인: 요청 전체 실패이며 기존 정렬 값은 그대로입니다.
    expect(result).toEqual({ matched: false, affected: 0 });
    expect(cluster.sql('SELECT id,"order" FROM gallery_images ORDER BY id')).toBe(before);
  });
  it("대표 사진 삭제는 현재 남은 사진의 order·createdAt 첫 항목을 선택한다", async () => {
    // 준비: 대표 사진보다 생성 시각이 빠른 동점 사진이 남아 있습니다.
    // 실행: 사진 행 삭제 후 조건부 대표 사진 SQL을 수행합니다.
    const result = await service.deleteAdminImage(actor, id, a);
    // 확인: 현재 DB 사진이 선택되고 조회수는 건드리지 않습니다.
    expect(result).toEqual({ kind: "deleted" });
    expect(cluster.sql(`SELECT cover_image_url,view_count FROM galleries WHERE id='${id}'`)).toBe("https://gallery.invalid/b.png|7");
  });
  it("다른 관리자의 대표 사진 변경은 이전 URL 조건으로 보호한다", async () => {
    // 준비: 이전 사진 조회 이후 대표 사진이 다른 URL로 바뀌었습니다.
    cluster.sql(`UPDATE galleries SET cover_image_url='https://gallery.invalid/new.png' WHERE id='${id}'`);
    // 실행: 이전 삭제 URL로 대표 사진을 갱신합니다.
    await repository.refreshCover(id, url);
    // 확인: 새 대표 사진을 덮어쓰지 않습니다.
    expect(cluster.sql(`SELECT cover_image_url FROM galleries WHERE id='${id}'`)).toBe("https://gallery.invalid/new.png");
  });
  it("마지막 대표 사진 삭제는 NULL로 갱신한다", async () => {
    // 준비: 대표 사진 한 장만 남깁니다.
    cluster.sql(`DELETE FROM gallery_images WHERE id<>'${a}'`);
    // 실행: 마지막 사진을 삭제합니다.
    const result = await service.deleteAdminImage(actor, id, a);
    // 확인: 남은 사진이 없으므로 NULL입니다.
    expect(result).toEqual({ kind: "deleted" });
    expect(cluster.sql(`SELECT cover_image_url IS NULL FROM galleries WHERE id='${id}'`)).toBe("t");
  });
  it("앨범 삭제는 사진 종속 행을 삭제하고 없는 행은 false다", async () => {
    // 준비: 사진 세 장이 연결된 앨범입니다.
    // 실행: 부모 DELETE returning을 수행합니다.
    const deleted = await service.deleteAdminGallery(actor, id);
    // 확인: 부모·종속 행 결과와 0행 계약입니다.
    expect(deleted).toBe(true);
    expect(cluster.sql(`SELECT count(*) FROM gallery_images WHERE gallery_id='${id}'`)).toBe("0");
    expect(await repository.deleteGallery(id)).toBe(false);
  });
  it("사진 추가 순서는 기존 사진 수를 사용하고 기존 대표 사진·조회수는 유지한다", async () => {
    // 준비: 0 기반 연속 순서가 아닌 기존 앨범 스냅샷입니다.
    const gallery = await service.getGallerySnapshot(actor, id);
    if (!gallery) throw new Error("합성 앨범 누락");
    // 실행: 실물 검증이 끝난 새 URL을 저장합니다.
    const result = await service.saveGalleryImages(actor, { gallery, urls: ["https://gallery.invalid/new.png"] });
    // 확인: 최대 순서가 아닌 기존 length=3을 그대로 사용합니다.
    expect(result).toEqual({ kind: "saved" });
    expect(cluster.sql(`SELECT "order" FROM gallery_images WHERE url='https://gallery.invalid/new.png'`)).toBe("3");
    expect(cluster.sql(`SELECT cover_image_url,view_count FROM galleries WHERE id='${id}'`)).toBe(`${url}|7`);
  });
});
