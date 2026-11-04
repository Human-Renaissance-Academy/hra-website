/**
 * 신규 DB 검증용 Drizzle export 후보의 생성 원본과 수동 namespace 차이만 검사합니다.
 * DB나 운영 환경 파일을 읽지 않고, 원본 변경이 생기면 후보 재검토를 요구합니다.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { exportQaSchemaSql } from "../../tests/support/qa-schema-export.mjs";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const candidatePath = join(root, "scripts/db/candidates/db-fresh/schema-export.sql");
const rawDigest = "e6da7f90332505af92a6656ea624c0ad14f6695d0b8ec190e0f784b364d04b84";
const candidateDigest = "1852207b0ca8cbf9d984724d91a7fae5a0fe264f2322b9069da35844e8231a8c";
const schemaDigest = "db0cf6ce1111455a2726b25aa23b1f349d271e665b9be6d68f84ded0beb65eb5";
const sha256 = value => createHash("sha256").update(value).digest("hex");

test("생성 export 후보는 검토한 CREATE TABLE 대상 47개만 public으로 한정한다", () => {
  // 설치된 Drizzle 도구의 현재 export를 다시 얻어 schema/tool 변경을 먼저 감지합니다.
  const raw = exportQaSchemaSql(root);
  assert.equal(sha256(raw), rawDigest);
  const candidate = readFileSync(candidatePath, "utf8");
  assert.equal(sha256(candidate), candidateDigest);
  const headerEnd = candidate.indexOf('CREATE TYPE "public".');
  assert.ok(headerEnd > 0);
  assert.match(candidate.slice(0, headerEnd), /^-- 신규 owned-local DB 설치 검증 전용/m);
  assert.equal(sha256(readFileSync(join(root, "src/lib/db/schema.ts"))), schemaDigest);
  assert.ok(candidate.slice(0, headerEnd).includes(`src/lib/db/schema.ts (SHA256 ${schemaDigest})`));
  const rawLines = raw.split("\n");
  const candidateLines = candidate.slice(headerEnd).split("\n");
  assert.equal(candidateLines.length, rawLines.length);

  // 차이를 문장 대상으로만 제한합니다. 함수·제약 본문은 바이트 단위로 동일해야 합니다.
  const qualified = new Set();
  for (let index = 0; index < rawLines.length; index++) {
    if (rawLines[index] === candidateLines[index]) continue;
    const match = /^CREATE TABLE "([a-z_]+)" \($/.exec(rawLines[index]);
    assert.ok(match, `검토되지 않은 export 변경: ${index + 1}행`);
    assert.equal(candidateLines[index], `CREATE TABLE "public"."${match[1]}" (`);
    assert.ok(!qualified.has(match[1]));
    qualified.add(match[1]);
  }
  assert.equal(qualified.size, 47);
  assert.ok(qualified.has("users"));
  assert.ok(qualified.has("academic_students"));
  assert.ok(qualified.has("recruitment_settings"));
  assert.ok(qualified.has("mobile_sessions"));
  assert.ok(qualified.has("mobile_session_refresh_history"));
});
