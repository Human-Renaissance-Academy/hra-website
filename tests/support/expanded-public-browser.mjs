/**
 * 격리 공개 브라우저 검증의 전용 설정을 작성한다.
 * 여섯 개의 고정 명세만 수집하고 보고서와 실행 산출물을 일회용 루트에 둔다.
 */
import { lstat, realpath, writeFile } from "node:fs/promises";
import path from "node:path";

// 기본 스모크 설정과 독립된 필수 명세 목록이다.
export const publicBrowserSpecs = Object.freeze([
  "home.spec.ts", "home-calendar-responsive.spec.ts", "keyboard-navigation.spec.ts", "notice-search-history.spec.ts",
  "home-hero-reduced-motion.spec.ts", "faq-accordion.spec.ts",
]);

/** 외부 호스트·인증정보·경로를 포함하지 않는 HTTP 루프백 원점만 허용한다. */
export function validatePublicBrowserOrigin(origin) {
  let url;
  try { url = new URL(origin); } catch { throw new Error("E2E_PUBLIC_ORIGIN_INVALID"); }
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
      url.username || url.password || url.origin !== origin) throw new Error("E2E_PUBLIC_ORIGIN_INVALID");
  return url.origin;
}

/** 경로 우회나 심볼릭 링크를 통한 산출물 덮어쓰기를 거부한다. */
async function checkedDirectory(directory) {
  if (typeof directory !== "string" || !path.isAbsolute(directory) || path.normalize(directory) !== directory ||
      !(await lstat(directory)).isDirectory() || await realpath(directory) !== directory) throw new Error("E2E_PUBLIC_PATH_INVALID");
  return directory;
}

/** 임시 설정은 패키지 import 없이 내보내어 루트 밖에서도 동일하게 로드된다. */
export async function prepareExpandedPublicBrowser({ repository, fixtureRoot, origin }) {
  const baseURL = validatePublicBrowserOrigin(origin);
  await checkedDirectory(repository);
  await checkedDirectory(fixtureRoot);
  const configPath = path.join(fixtureRoot, "expanded-public.config.mjs");
  const summaryPath = path.join(fixtureRoot, "expanded-public-summary.json");
  const config = {
    testDir: path.join(repository, "tests/e2e"), testMatch: [...publicBrowserSpecs], forbidOnly: true,
    retries: 0, workers: 1, timeout: 60_000, expect: { timeout: 20_000 },
    outputDir: path.join(fixtureRoot, "expanded-public-results"),
    use: { baseURL, trace: "off", screenshot: "off", video: "off", serviceWorkers: "block" },
    projects: [{ name: "chromium", use: { browserName: "chromium" } }],
    reporter: [[path.join(repository, "tests/support/expanded-public-reporter.mjs"), { summaryPath }]],
  };
  await writeFile(configPath, `export default ${JSON.stringify(config, null, 2)};\n`, { flag: "wx" });
  return { configPath, summaryPath };
}
