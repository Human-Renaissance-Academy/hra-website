/** 빌드 시각보다 새로운 비무시 입력을 거부하고 실행한 소스 스냅샷을 식별합니다. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { safeEnvironment } from "./mobile-bearer-runtime.mjs";

export function verifyBuildProvenance(root) {
  const build = statSync(join(root, ".next/BUILD_ID"));
  // 읽기 전용 상태 조회이므로 전체 환경을 상속하지 않고 허용 목록 환경만 전달한다.
  const ignored = execFileSync("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--ignored=matching"],
    { cwd: root, env: safeEnvironment(), encoding: "utf8" }).split("\0")
    .filter(value => value.startsWith("!! ")).map(value => value.slice(3).replace(/\/$/, ""));
  const files = [];
  const visit = path => {
    if (ignored.some(value => path === value || path.startsWith(`${value}/`))) return;
    const info = statSync(join(root, path));
    if (info.isDirectory()) for (const name of readdirSync(join(root, path))) visit(`${path}/${name}`);
    else if (info.isFile()) files.push({ path, size: info.size, mtime: info.mtimeMs });
  };
  for (const path of ["src", "packages/contracts", "next.config.ts", "package-lock.json", "scripts/migrate-mobile-sessions.sql"]) visit(path);
  if (files.some(file => file.mtime > build.mtimeMs)) {
    throw new Error("소스가 빌드보다 최신입니다. 환경을 제거한 npm run build로 다시 빌드하세요.");
  }
  const fingerprint = createHash("sha256").update(JSON.stringify(files.sort((a, b) => a.path.localeCompare(b.path)))).digest("hex").slice(0, 16);
  const id = readFileSync(join(root, ".next/BUILD_ID"), "utf8").trim();
  if (!/^[\w-]+$/.test(id)) throw new Error("빌드 식별자가 올바르지 않습니다. 다시 빌드하세요.");
  return { id, fingerprint, inputs: files.length };
}
