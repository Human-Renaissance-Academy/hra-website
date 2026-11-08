/**
 * 강의자료 읽기 인가 회귀 테스트 (#89).
 * 실제 조회에 쓰이는 SQL 필터를 직렬화해 권한 없는 역할과 미정의 자료 대상이 허용되지 않는지 검사합니다.
 * DB 모킹 없이 필터를 검증하며 실제 Postgres 검증은 별도 통합 테스트에서 수행합니다.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PgDialect } from "drizzle-orm/pg-core";
import { classMaterialReadFilter } from "@/features/class-materials/access";

const dialect = new PgDialect();

describe("강의자료 읽기 권한", () => {
  it("목록과 상세·메타데이터가 공통 필터를 사용", () => {
    const list = readFileSync("src/features/resources/overview/repository.ts", "utf8");
    const page = readFileSync("src/app/(member)/resources/page.tsx", "utf8");
    const detail = readFileSync("src/app/(member)/resources/class-materials/[id]/page.tsx", "utf8");
    const webService = readFileSync("src/features/class-materials/web/service.ts", "utf8");
    const webRepository = readFileSync("src/features/class-materials/web/repository.ts", "utf8");
    // 페이지를 Service/Repository로 분리해도 목록·상세·메타데이터의 SQL 인가가 보존되어야 합니다.
    expect(page).toContain("getResourcesOverview({ userId: session.user.id, role: session.user.role })");
    expect(page).not.toContain('from "@/lib/db"');
    expect(list).toContain(".where(classMaterialReadFilter({ id: verified.id, role: verified.role }))");
    expect(detail).not.toContain('from "@/lib/db"');
    expect(detail).toContain("getWebClassMaterialTitle(session.user, id)");
    expect(detail).toContain("getWebClassMaterialDetail(session.user, id)");
    expect(webService).toContain("canReadSharedResource(user.role)");
    expect(webService).toContain("z.uuid().safeParse(id)");
    expect(webService).toContain("findWebClassMaterialTitle(user!, validId)");
    expect(webService).toContain("findWebClassMaterialDetail(user!, validId)");
    expect(webRepository.match(/classMaterialReadFilter\(user\)/g)).toHaveLength(2);
    expect(webRepository).not.toContain("fileUrl: classMaterials.fileUrl");
  });
  it.each([undefined, null, {}, { role: "ADMIN" }, { id: "", role: "ADMIN" },
    { id: "user", role: "PENDING" }, { id: "user", role: "UNKNOWN" }, { id: "user" }])(
    "인증되지 않았거나 허용되지 않은 사용자는 항상 거절: %j", (user) => {
      const query = dialect.sqlToQuery(classMaterialReadFilter(user));
      expect(query.sql).toBe("false");
      expect(query.params).toEqual([]);
    },
  );

  it("일반 회원은 학생용만 조회", () => {
    const query = dialect.sqlToQuery(classMaterialReadFilter({ id: "user", role: "MEMBER" }));
    expect(query.sql).toContain('"class_materials"."audience" in');
    expect(query.params).toEqual(["STUDENT"]);
  });

  it.each(["FACULTY", "ADMIN"])("%s도 정의된 두 대상만 조회", (role) => {
    const query = dialect.sqlToQuery(classMaterialReadFilter({ id: "user", role }));
    expect(query.sql).toContain('"class_materials"."audience" in');
    expect(query.params).toEqual(["STUDENT", "FACULTY"]);
  });
});
