// @vitest-environment node
/** 기존 singleton 제약 테스트와 별개로 실제 저장소의 네 upsert·기본값·섹션 보존을 검증합니다. */
import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { createQaPostgres } from "../support/resource-qa-postgres.mjs";
import { createPsqlTransport, qaDatabaseUrl, qaNeonEndpoint } from "../support/neon-psql-transport.mjs";

const mocks = vi.hoisted(() => ({ database: undefined as NeonHttpDatabase<typeof schema> | undefined }));
vi.mock("@/lib/db", () => ({ get db() {
  if (!mocks.database) throw new Error("격리 DB 준비 전 접근 차단");
  return mocks.database;
} }));
import * as service from "@/features/recruitment-settings/admin/service";

const bin = process.env.HRA_TEST_PG_BIN;
const actor = { userId: "admin-1", role: "ADMIN" };

describe.skipIf(!bin)("관리자 모집 설정 실제 저장소", () => {
  let cluster: ReturnType<typeof createQaPostgres>;
  const previousFetch = neonConfig.fetchFunction;
  const previousEndpoint = neonConfig.fetchEndpoint;
  beforeAll(() => {
    cluster = createQaPostgres(bin);
    cluster.sql(`CREATE TABLE recruitment_settings (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      singleton_key integer NOT NULL DEFAULT 1 UNIQUE CHECK(singleton_key = 1),
      active_cohort_id uuid, recruitment_status text DEFAULT 'UPCOMING', google_form_url text,
      recruitment_start_date timestamp, poster_image_url text, deadline_date timestamp,
      next_recruitment_year integer, next_recruitment_month integer, qualification_text text,
      details_markdown text, poster_layout text DEFAULT 'right', updated_at timestamp NOT NULL DEFAULT now()
    );`);
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
  });
  beforeEach(() => cluster.sql("TRUNCATE recruitment_settings"));
  afterAll(() => {
    neonConfig.fetchFunction = previousFetch;
    neonConfig.fetchEndpoint = previousEndpoint;
    mocks.database = undefined;
    cluster?.close();
  });

  it("없는 설정 조회는 기본행 생성 없이 null을 반환한다", async () => {
    // 준비: 빈 테이블입니다.
    // 실행
    const result = await service.getSettings(actor);
    // 확인
    expect(result).toBeNull();
    expect(cluster.sql("SELECT count(*) FROM recruitment_settings")).toBe("0");
  });

  it.each([
    ["전체", () => service.saveSettings(actor, { posterImageUrl: null, posterLayout: "right" })],
    ["정보", () => service.saveInfo(actor, {})],
    ["포스터", () => service.savePoster(actor, { posterImageUrl: null, posterLayout: "right" })],
    ["안내", () => service.saveDetails(actor, {})],
  ] as const)("%s 최초 저장은 고정 키·상태·위치 기본값의 한 행을 만든다", async (_name, run) => {
    // 준비: 빈 테이블입니다.
    // 실행
    await run();
    // 확인
    expect(cluster.sql("SELECT singleton_key,recruitment_status,poster_layout,count(*) OVER() FROM recruitment_settings"))
      .toBe("1|UPCOMING|right|1");
  });

  it.each([
    ["정보", () => service.saveInfo(actor, {
      activeCohortId: "33333333-3333-4333-8333-333333333333", googleFormUrl: "https://form.invalid/new",
      recruitmentStartDate: "2026-03-20", deadlineDate: "2026-03-21",
    }), {
      content: "https://form.invalid/new|기존 안내|https://poster.invalid/old|left|CLOSED",
      info: "33333333-3333-4333-8333-333333333333|2026-03-20T00:00:00|2026-03-21T00:00:00",
    }],
    ["포스터", () => service.savePoster(actor, { posterImageUrl: "https://poster.invalid/new", posterLayout: "none" }), {
      content: "https://form.invalid/old|기존 안내|https://poster.invalid/new|none|CLOSED",
      info: "22222222-2222-4222-8222-222222222222|2026-02-10T00:00:00|2026-02-11T00:00:00",
    }],
    ["안내", () => service.saveDetails(actor, { detailsMarkdown: "새 안내" }), {
      content: "https://form.invalid/old|새 안내|https://poster.invalid/old|left|CLOSED",
      info: "22222222-2222-4222-8222-222222222222|2026-02-10T00:00:00|2026-02-11T00:00:00",
    }],
    ["전체", () => service.saveSettings(actor, {
      activeCohortId: "33333333-3333-4333-8333-333333333333", googleFormUrl: "https://form.invalid/new",
      recruitmentStartDate: "2026-03-20", deadlineDate: "2026-03-21",
      detailsMarkdown: "새 안내", posterImageUrl: "https://poster.invalid/new", posterLayout: "right",
    }), {
      content: "https://form.invalid/new|새 안내|https://poster.invalid/new|right|CLOSED",
      info: "33333333-3333-4333-8333-333333333333|2026-03-20T00:00:00|2026-03-21T00:00:00",
    }],
  ] as const)("%s 갱신은 같은 ID와 기존 상태를 보존하며 해당 필드만 바꾼다", async (_name, run, expected) => {
    // 준비: 기수 FK가 없는 최소 DDL에 합성 UUID와 새 입력과 다른 비어 있지 않은 날짜를 저장합니다.
    cluster.sql(`INSERT INTO recruitment_settings(id,singleton_key,recruitment_status,google_form_url,details_markdown,poster_image_url,poster_layout,
      active_cohort_id,recruitment_start_date,deadline_date)
      VALUES('11111111-1111-4111-8111-111111111111',1,'CLOSED','https://form.invalid/old','기존 안내','https://poster.invalid/old','left',
      '22222222-2222-4222-8222-222222222222','2026-02-10 00:00:00','2026-02-11 00:00:00')`);
    // 실행
    await run();
    // 확인
    expect(cluster.sql("SELECT google_form_url,details_markdown,poster_image_url,poster_layout,recruitment_status FROM recruitment_settings")).toBe(expected.content);
    // 확인: 세션 시간대도 UTC로 고정해 실제 저장된 기수와 두 날짜의 변경·보존을 검증합니다.
    expect(cluster.sql(`SET TIME ZONE 'UTC'; SELECT active_cohort_id,
      to_char(recruitment_start_date at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS'),
      to_char(deadline_date at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') FROM recruitment_settings`)).toBe(expected.info);
    expect(cluster.sql("SELECT id,count(*) OVER() FROM recruitment_settings")).toBe("11111111-1111-4111-8111-111111111111|1");
  });
});
