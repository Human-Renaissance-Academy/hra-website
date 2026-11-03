/** 두 모바일 표의 COMMENT 후보가 기존 DB용 원문의 설명을 빠짐없이 보존하는지 확인합니다. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("모바일 신규 설치 후보는 두 표의 원문 COMMENT만 동일하게 보완한다", () => {
  // Given: 서로 다른 설치 경로의 고정 SQL 원문
  const migration = readFileSync(new URL("../migrate-mobile-sessions.sql", import.meta.url), "utf8");
  const candidate = readFileSync(new URL("../db/candidates/db-fresh/mobile-sessions.sql", import.meta.url), "utf8");
  // When: SQL 실행기가 소비하는 COMMENT 문장을 추출
  const comments = migration.split("\n").filter(line => line.startsWith("COMMENT ON "));
  const statements = candidate.split("\n").filter(line => line.trim() && !line.startsWith("--"));
  // Then: 원문과 순서·bytes가 같고 두 표를 모두 포함
  assert.deepEqual(statements, comments);
  assert.equal(comments.filter(line => line.startsWith("COMMENT ON TABLE ")).length, 2);
});
