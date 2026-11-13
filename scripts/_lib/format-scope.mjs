// Git 경로는 NUL로 구분하여 공백·개행이 포함된 파일명도 안전하게 다룹니다.
export function parseGitPaths(output) {
  const text = output.toString("utf8");
  if (text.length === 0) return [];
  if (!text.endsWith("\0")) {
    throw new Error("Git 변경 파일 목록이 NUL로 종료되지 않았습니다.");
  }
  return text.slice(0, -1).split("\0");
}

export function isFormatTarget(file) {
  if (typeof file !== "string" || file.startsWith("/") || file.includes("\\")) {
    return false;
  }
  if (file.split("/").some((part) => !part || part === "." || part === "..")) {
    return false;
  }
  return /\.[cm]?[jt]sx?$/i.test(file);
}

export function isCommitSha(value) {
  return typeof value === "string" && /^(?:[a-f\d]{40}|[a-f\d]{64})$/i.test(value);
}
