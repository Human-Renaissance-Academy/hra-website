/**
 * DB 소스 인벤토리의 실패 경계를 구현보다 먼저 고정합니다.
 * 합성 바이트·경로만 전달하며 SQL이나 운영 환경 파일을 실행하지 않습니다.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const g1Source = `export const academicG1Migrations = [
  "migrate-one.sql", "migrate-two.sql",
];`;

/** 검증기에 파일 시스템·Git·환경변수 접근을 맡기지 않는 합성 입력입니다. */
function fixture() {
  const one = "scripts/migrate-one.sql";
  const two = "scripts/migrate-two.sql";
  const command = "scripts/migrate-one.mjs";
  return {
    inventory: {
      version: 1,
      sql: [
        { id: "g1-one", path: one, role: "versioned_candidate", sha256: sha256("ONE"), predecessors: [] },
        { id: "g1-two", path: two, role: "versioned_candidate", sha256: sha256("TWO"), predecessors: ["g1-one"] },
      ],
      g1Order: [one, two],
      scripts: [{ path: command, sha256: sha256("// 합성 스크립트"), effect: "db_schema", defaultBehavior: "writes", writeOptions: [], commands: ["db:migrate-one"] }],
    },
    trackedSqlPaths: [one, two],
    untrackedSqlPaths: [],
    trackedScriptPaths: [command],
    untrackedScriptPaths: [],
    fileContents: { [one]: Buffer.from("ONE"), [two]: Buffer.from("TWO"), [command]: Buffer.from("// 합성 스크립트") },
    symlinkPaths: [],
    g1Source,
    packageScripts: { "db:migrate-one": `node ${command}` },
  };
}

/** 각 사례가 같은 순수 함수와 진단 코드 계약을 사용하도록 합니다. */
async function diagnostics(input) {
  const { validateSourceInventory } = await import("../_lib/db-source-inventory.mjs");
  return validateSourceInventory(input).map((item) => item.code);
}

async function rejects(input, code) {
  const actual = await diagnostics(input);
  assert.ok(actual.includes(code), `기대한 ${code}, 실제: ${actual.join(", ")}`);
}

test("알려진 SQL·MJS와 G1 순서가 일치하면 통과한다", async () => {
  assert.deepEqual(await diagnostics(fixture()), []);
});

test("SQL 원본 한 바이트 변경을 해시 불일치로 거부한다", async () => {
  const input = fixture();
  input.fileContents["scripts/migrate-one.sql"] = Buffer.from("ONE ");
  await rejects(input, "HASH_MISMATCH");
});

test("CI에서 Git 추적된 새 경로의 SQL이 목록 밖이면 거부한다", async () => {
  const input = fixture();
  input.trackedSqlPaths.push("other/new.sql");
  input.fileContents["other/new.sql"] = Buffer.from("SELECT 1;");
  await rejects(input, "UNREGISTERED_SQL");
});

test("로컬 미추적 새 SQL도 목록 밖이면 거부한다", async () => {
  const input = fixture();
  input.untrackedSqlPaths.push("scripts/new.sql");
  input.fileContents["scripts/new.sql"] = Buffer.from("SELECT 1;");
  await rejects(input, "UNREGISTERED_SQL");
});

test("누락 파일과 중복 경로·ID를 각각 거부한다", async () => {
  const missing = fixture();
  delete missing.fileContents["scripts/migrate-one.sql"];
  await rejects(missing, "MISSING_SOURCE");

  const duplicatePath = fixture();
  duplicatePath.inventory.sql.push({ ...duplicatePath.inventory.sql[0], id: "another" });
  await rejects(duplicatePath, "DUPLICATE_PATH");

  const duplicateId = fixture();
  duplicateId.inventory.sql[1].id = "g1-one";
  await rejects(duplicateId, "DUPLICATE_ID");
});

test("경로 이탈과 심볼릭 링크를 거부한다", async () => {
  const escape = fixture();
  escape.inventory.sql[0].path = "../outside.sql";
  await rejects(escape, "UNSAFE_PATH");

  const symlink = fixture();
  symlink.symlinkPaths.push("scripts/migrate-one.sql");
  await rejects(symlink, "SYMLINK_PATH");
});

test("G1 중간 순서 변경과 실행 식을 거부한다", async () => {
  const reordered = fixture();
  reordered.g1Source = g1Source.replace('"migrate-one.sql", "migrate-two.sql"', '"migrate-two.sql", "migrate-one.sql"');
  await rejects(reordered, "G1_ORDER_MISMATCH");

  const expression = fixture();
  expression.g1Source = 'export const academicG1Migrations = [...otherMigrations];';
  await rejects(expression, "G1_LITERAL_REQUIRED");
});

test("주석 속 옛 G1 배열 뒤의 실제 실행식을 거부한다", async () => {
  const input = fixture();
  input.g1Source = `/*\n${g1Source}\n*/\nexport const academicG1Migrations = [...runtimeMigrations];`;
  await rejects(input, "G1_LITERAL_REQUIRED");
});

test("주석·문자열 속 옛 선언 대신 실제 G1 순서 변경을 확인한다", async () => {
  const reordered = g1Source.replace('"migrate-one.sql", "migrate-two.sql"', '"migrate-two.sql", "migrate-one.sql"');
  for (const prefix of [`/*\n${g1Source}\n*/`, `const note = ${JSON.stringify(g1Source)};`, 'const note = `\n' + g1Source + '\n`;']) {
    const input = fixture();
    input.g1Source = `${prefix}\n${reordered}`;
    await rejects(input, "G1_ORDER_MISMATCH");
  }
});

test("문자열의 가짜 선언만 있거나 실제 선언이 중복·비정상이면 거부한다", async () => {
  for (const source of [`const note = ${JSON.stringify(g1Source)};`, `${g1Source}\n${g1Source}`, g1Source.replace('];', ', ;')]) {
    const input = fixture();
    input.g1Source = source;
    await rejects(input, "G1_LITERAL_REQUIRED");
  }
});

test("선행 ID 누락과 순환을 거부한다", async () => {
  const unknown = fixture();
  unknown.inventory.sql[1].predecessors = ["missing"];
  await rejects(unknown, "UNKNOWN_PREDECESSOR");

  const cycle = fixture();
  cycle.inventory.sql[0].predecessors = ["g1-two"];
  await rejects(cycle, "DEPENDENCY_CYCLE");
});

test("fresh 후보는 전용 경로와 ID·선행관계를 요구한다", async () => {
  const input = fixture();
  const path = "scripts/db/candidates/db-fresh/g1-one.sql";
  input.inventory.sql.push({ id: "fresh-g1-one", path, role: "fresh_candidate", sha256: sha256("FRESH"), predecessors: [] });
  input.untrackedSqlPaths.push(path);
  input.fileContents[path] = Buffer.from("FRESH");
  assert.deepEqual(await diagnostics(input), []);

  input.inventory.sql.at(-1).path = "scripts/other/g1-one.sql";
  input.untrackedSqlPaths[0] = input.inventory.sql.at(-1).path;
  input.fileContents[input.inventory.sql.at(-1).path] = Buffer.from("FRESH");
  await rejects(input, "INVALID_FRESH_PATH");

  input.inventory.sql.at(-1).path = path;
  input.untrackedSqlPaths[0] = path;
  input.inventory.sql.at(-1).predecessors = ["g1-one"];
  await rejects(input, "FRESH_LEGACY_PREDECESSOR");

  input.inventory.sql.at(-1).predecessors = [];
  input.inventory.sql.at(-1).role = "current_definition_or_installer";
  delete input.inventory.sql.at(-1).id;
  delete input.inventory.sql.at(-1).predecessors;
  await rejects(input, "INVALID_FRESH_ROLE");
});

test("새 관리 MJS와 새 npm 연결 명령이 미분류면 거부한다", async () => {
  const newScript = fixture();
  newScript.trackedScriptPaths.push("scripts/cleanup-new.mjs");
  newScript.fileContents["scripts/cleanup-new.mjs"] = Buffer.from("// 합성 정리 명령");
  await rejects(newScript, "UNREGISTERED_SCRIPT");

  const newCommand = fixture();
  newCommand.packageScripts["db:migrate-one-again"] = "node scripts/migrate-one.mjs";
  await rejects(newCommand, "UNREGISTERED_COMMAND");
});

test("현재 인벤토리는 읽기 전용 preflight·현행 뷰와 알려진 명령 동작을 분리한다", () => {
  const inventory = JSON.parse(readFileSync(join(root, "scripts/db/source-inventory.json"), "utf8"));
  assert.equal(inventory.sql.length, 37);
  assert.equal(inventory.sql.filter((entry) => entry.role === "fresh_candidate").length, 19);
  assert.equal(inventory.scripts.length, 18);
  assert.equal(inventory.g1Order.length, 9);
  assert.equal(inventory.sql.find((entry) => entry.path === "scripts/preflight-academic-students.sql")?.role, "read_only_preflight");
  assert.equal(inventory.sql.find((entry) => entry.path === "scripts/sql/markdown-image-references.sql")?.role, "current_definition_or_installer");
  assert.equal(inventory.sql.find((entry) => entry.path === "scripts/migrate-287-rate-limit-reservation-index.sql")?.id, "287-reservation-index");
  const preflight = readFileSync(join(root, "scripts/preflight-academic-students.sql"), "utf8");
  assert.equal(preflight.split("\n").map((line) => line.trim()).find((line) => line && !line.startsWith("--")), "BEGIN READ ONLY;");
  // 동작 분류는 자동 SQL 분석 결과가 아니므로 검토한 18개 진입점의 현재 의미를 테스트로 고정합니다.
  const expected = {
    "backfill-academic-enrollments": ["db_data", "read_only"],
    "cleanup-markdown-image-assets": ["blob_cleanup", "read_only"],
    "migrate-add-alumni-featured": ["db_schema", "read_only"],
    "migrate-add-application-submissions-unique": ["db_schema", "read_only"],
    "migrate-add-markdown-image-assets": ["db_schema", "read_only"],
    "migrate-add-rate-limit-tables": ["db_schema", "read_only"],
    "migrate-add-user-session-version": ["db_schema", "read_only"],
    "migrate-atomic-application-questions": ["db_schema", "read_only"],
    "migrate-backfill-kakao-legacy-bindings": ["db_data", "read_only"],
    "migrate-html-to-markdown": ["db_data", "read_only"],
    "migrate-protected-resource-blobs": ["blob_and_db", "read_only"],
    "migrate-rate-limit-reservations": ["db_schema", "read_only"],
    "migrate-recruitment-singleton": ["db_schema_and_data", "read_only"],
    "seed-admin": ["seed_db", "rejects"],
    "seed-alumni": ["seed_db", "read_only"],
    "seed-cohorts": ["seed_db", "read_only"],
    "seed-faculty": ["seed_db", "read_only"],
    "seed-press": ["seed_db", "read_only"],
  };
  assert.deepEqual(Object.fromEntries(inventory.scripts.map((entry) => [
    entry.path.slice("scripts/".length, -".mjs".length), [entry.effect, entry.defaultBehavior],
  ])), expected);
});

test("가짜 DB 주소가 있어도 CLI는 소스만 검사하고 통과한다", () => {
  const result = spawnSync(process.execPath, ["scripts/check-db-source-inventory.mjs"], {
    cwd: root,
    env: { DATABASE_URL: "postgresql://ci:ci@127.0.0.1:1/isolated" },
    encoding: "utf8",
    timeout: 10_000,
  });
  assert.equal(result.status, 0, "소스 검사기는 DB 접속 없이 종료해야 합니다.");
  assert.match(result.stdout, /SQL 37개.*MJS 18개/);
});
