// @vitest-environment node
/** 관리자 저장소의 실제 정렬·배치·대표 이미지 조건부 갱신을 소유 PostgreSQL에서 검증합니다. */
import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { createQaPostgres } from "../support/resource-qa-postgres.mjs";
import { createPsqlTransport, qaDatabaseUrl, qaNeonEndpoint } from "../support/neon-psql-transport.mjs";
import { createPsqlBatchTransport } from "../support/neon-psql-batch-transport.mjs";

const mocks = vi.hoisted(() => ({ database: undefined as NeonHttpDatabase<typeof schema> | undefined }));
vi.mock("@/lib/db", () => ({ get db() {
  if (!mocks.database) throw new Error("격리 DB 준비 전 호출");
  return mocks.database;
} }));
vi.mock("@/lib/create-with-blobs", () => ({ cleanupCreatedBlobs: vi.fn() }));
import * as repository from "@/features/alumni/admin/repository";
import * as service from "@/features/alumni/admin/service";

const bin = process.env.HRA_TEST_PG_BIN;
const id = "91000000-0000-4000-8000-000000000001";
const second = "91000000-0000-4000-8000-000000000002";
const missing = "91000000-0000-4000-8000-000000000099";
const actor = { userId: "admin-1", role: "ADMIN" };
const story = { name: "변경", quote: "문구", content: "본문", isFeatured: true };

describe.skipIf(!bin)("관리자 수료생 격리 PostgreSQL", () => {
  let cluster: ReturnType<typeof createQaPostgres>;
  const previousFetch = neonConfig.fetchFunction;
  const previousEndpoint = neonConfig.fetchEndpoint;
  beforeAll(() => {
    cluster = createQaPostgres(bin);
    cluster.sql(`CREATE TABLE alumni_stories (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name varchar(100) NOT NULL, title varchar(100),
      quote varchar(500) NOT NULL, content text NOT NULL, image_url text,
      is_featured boolean NOT NULL DEFAULT false, pinned boolean NOT NULL DEFAULT false,
      "order" integer NOT NULL DEFAULT 0, view_count integer NOT NULL DEFAULT 0,
      created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now());
      CREATE TABLE alumni_story_images (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      alumni_story_id uuid NOT NULL REFERENCES alumni_stories(id) ON DELETE CASCADE,
      url text NOT NULL CHECK(url <> 'https://denied.invalid/a'), alt varchar(255), "order" integer NOT NULL DEFAULT 0,
      created_at timestamp NOT NULL DEFAULT now());`);
    const transport = createPsqlTransport(cluster.environment);
    const batch = createPsqlBatchTransport(cluster.environment);
    neonConfig.fetchEndpoint = qaNeonEndpoint;
    neonConfig.fetchFunction = async (input: unknown, options: RequestInit) => {
      if (String(input) !== qaNeonEndpoint || options.method !== "POST" ||
        new Headers(options.headers).get("Neon-Connection-String") !== qaDatabaseUrl) {
        throw new Error("격리 SQL 범위 이외 요청 차단");
      }
      const payload = JSON.parse(String(options.body));
      try {
        return Response.json(payload.queries ? await batch(payload, options.headers) : await transport(payload));
      } catch {
        return Response.json({ message: "격리 SQL 실행 거부", code: "QA_TRANSPORT_ERROR" }, { status: 400 });
      }
    };
    mocks.database = drizzle(neon(qaDatabaseUrl), { schema });
  }, 30000);
  beforeEach(() => {
    cluster.sql(`TRUNCATE alumni_stories CASCADE;
      INSERT INTO alumni_stories(id,name,quote,content,"order",pinned,created_at) VALUES
      ('${id}','고정','문구','본문',3,true,'2026-10-01'),
      ('${second}','최신','문구','본문',7,false,'2026-10-20');`);
  });
  afterAll(() => {
    neonConfig.fetchFunction = previousFetch;
    neonConfig.fetchEndpoint = previousEndpoint;
    mocks.database = undefined;
    cluster?.close();
  });

  it("목록은 order가 아닌 고정·작성일 역순을 유지한다", async () => {
    cluster.sql(`INSERT INTO alumni_stories(id,name,quote,content,pinned,created_at) VALUES
      ('${missing}','새 고정','문구','본문',true,'2026-10-02')`);
    expect((await service.listAdminItems(actor)).map(row => row.name)).toEqual(["새 고정", "고정", "최신"]);
  });

  it("생성은 최대 순서 다음에 글·첨부를 배치 저장한다", async () => {
    await service.createStory(actor, { id: missing, story, directUrls: ["https://direct.invalid/a"], upload: async () => [] });
    expect(cluster.sql(`SELECT name,image_url,"order",is_featured FROM alumni_stories WHERE id='${missing}'`))
      .toBe("변경|https://direct.invalid/a|8|t");
    expect(cluster.sql(`SELECT url,"order" FROM alumni_story_images WHERE alumni_story_id='${missing}'`)).toBe("https://direct.invalid/a|0");
  });

  it("첨부 CHECK 실패는 앞선 글 삽입도 롤백한다", async () => {
    await expect(repository.insertStory({ id: missing, story, uploadedUrls: ["https://denied.invalid/a"] }, 8)).rejects.toThrow();
    expect(cluster.sql(`SELECT count(*) FROM alumni_stories WHERE id='${missing}'`)).toBe("0");
  });

  it("대표 이미지 null 조건이 일치할 때만 수정한다", async () => {
    expect(await repository.updateStory({ id, story, uploadedUrls: [] }, null)).toBe(true);
    expect(cluster.sql(`SELECT name,is_featured FROM alumni_stories WHERE id='${id}'`)).toBe("변경|t");
  });

  it("다른 연결이 대표 이미지를 바꿨으면 이전 URL 조건은 0행이다", async () => {
    cluster.sql(`UPDATE alumni_stories SET image_url='https://new.invalid/a' WHERE id='${id}'`);
    expect(await repository.updateStory({ id, story, uploadedUrls: [] }, "https://old.invalid/a")).toBe(false);
    expect(cluster.sql(`SELECT name,image_url FROM alumni_stories WHERE id='${id}'`)).toBe("고정|https://new.invalid/a");
  });

  it("null 대표 이미지가 먼저 바뀌어도 null 조건 갱신은 0행이다", async () => {
    cluster.sql(`UPDATE alumni_stories SET image_url='https://new.invalid/a' WHERE id='${id}'`);
    expect(await repository.updateStory({ id, story, uploadedUrls: [] }, null)).toBe(false);
  });

  it("없는 편집·수정·고정 대상은 누락 결과를 반환한다", async () => {
    expect(await service.getAdminStory(actor, missing)).toBeNull();
    expect(await repository.updateStory({ id: missing, story, uploadedUrls: [] }, null)).toBe(false);
    expect(await service.togglePin(actor, missing)).toBeNull();
  });

  it("삭제는 종속 첨부를 제거하고 없는 대상에도 멱등 종료한다", async () => {
    cluster.sql(`INSERT INTO alumni_story_images(alumni_story_id,url) VALUES('${id}','https://image.invalid/a')`);
    await service.deleteStory(actor, id);
    expect(cluster.sql(`SELECT count(*) FROM alumni_story_images WHERE alumni_story_id='${id}'`)).toBe("0");
    await expect(service.deleteStory(actor, missing)).resolves.toBeUndefined();
  });

  it("정렬은 요청 순서 1부터 저장하며 누락·중복 건수를 구분한다", async () => {
    expect(await service.reorderStories(actor, [second, id])).toEqual({ affected: 2, matched: true });
    expect(cluster.sql(`SELECT "order" FROM alumni_stories WHERE id='${second}'`)).toBe("1");
    expect(await service.reorderStories(actor, [id, missing])).toEqual({ affected: 0, matched: false });
    expect(await service.reorderStories(actor, [id, id])).toEqual({ affected: 0, matched: false });
  });
});
