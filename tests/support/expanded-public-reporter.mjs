/**
 * 공개 브라우저 필수 24건의 수집·실행을 엄격히 검증한다.
 * 임의 오류·출력·첨부를 버리고 고정 파일명과 줄 번호만 안전하게 보고한다.
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { publicBrowserSpecs } from "./expanded-public-browser.mjs";

const counts = [1, 5, 5, 3, 6, 4];
// 고정 사례 식별자만 산출물에 넣고 임의 제목은 저장하지 않는다.
export const requiredPublicBrowserCases = Object.freeze({
  HOME: "home.spec.ts",
  ...Object.fromEntries([390, 768, 800, 1024, 1280].map((width) => [`CALENDAR_${width}`, "home-calendar-responsive.spec.ts"])),
  KEYBOARD_HEADER: "keyboard-navigation.spec.ts", KEYBOARD_CONTENT: "keyboard-navigation.spec.ts", KEYBOARD_CALENDAR: "keyboard-navigation.spec.ts", KEYBOARD_MOBILE_HEADER: "keyboard-navigation.spec.ts", KEYBOARD_MOBILE_HEADER_768: "keyboard-navigation.spec.ts",
  SEARCH_DRAFT: "notice-search-history.spec.ts", SEARCH_BACK: "notice-search-history.spec.ts", SEARCH_FORWARD: "notice-search-history.spec.ts",
  ...Object.fromEntries(["CLS_390", "CLS_768", "CLS_1024", "CLS_1280", "REDUCED", "SSR"].map((name) => [`HERO_${name}`, "home-hero-reduced-motion.spec.ts"])),
  FAQ_COLLAPSED: "faq-accordion.spec.ts", FAQ_COLLAPSED_TAB: "faq-accordion.spec.ts", FAQ_OPEN: "faq-accordion.spec.ts", FAQ_CONTACT: "faq-accordion.spec.ts",
});
const required = Object.keys(requiredPublicBrowserCases).length;
const caseId = (test) => {
  const id = /^\[PUBLIC:([A-Z0-9_]+)\]/.exec(test.title)?.[1];
  return id && Object.hasOwn(requiredPublicBrowserCases, id) ? id : "UNKNOWN";
};
// 파일명과 식별자는 고정 목록으로 정제하고 줄 번호는 양의 정수로 제한한다.
const location = (test) => ({
  file: publicBrowserSpecs.includes(path.basename(test.location?.file ?? "")) ? path.basename(test.location.file) : "UNKNOWN",
  caseId: caseId(test),
  line: Number.isSafeInteger(test.location?.line) && test.location.line > 0 ? test.location.line : 0,
});
const key = ({ file, line, caseId }) => `${file}:${line}:${caseId}`;

/** 허용한 matcher 이름·고정 오류 표식만 코드로 바꾸고 원문은 즉시 버린다. */
function failureCode(error, status) {
  const message = typeof error?.message === "string" ? error.message : "";
  if (/외부 브라우저 요청은 허용하지 않는다|E2E_PUBLIC_ORIGIN_INVALID|blockedbyclient|ERR_BLOCKED_BY_CLIENT/i.test(message)) return "NETWORK_BLOCKED";
  for (const [pattern, code] of [
    [/toBeVisible/, "TO_BE_VISIBLE"], [/toHaveAttribute/, "TO_HAVE_ATTRIBUTE"],
    [/toBeFocused/, "TO_BE_FOCUSED"], [/toBeLessThanOrEqual/, "TO_BE_LESS_THAN_OR_EQUAL"],
    [/toHaveURL/, "TO_HAVE_URL"], [/toHaveValue/, "TO_HAVE_VALUE"],
    [/toHaveCount/, "TO_HAVE_COUNT"], [/toContain/, "TO_CONTAIN"],
    [/toBeDisabled/, "TO_BE_DISABLED"], [/toBe\(/, "TO_BE"],
  ]) if (pattern.test(message)) return code;
  if (status === "timedOut" || /timeout|timed out/i.test(message)) return "TIMEOUT";
  return "OTHER";
}

/** 스택에서 현재 사례의 고정 명세 파일 줄 번호만 추출한다. */
function failureLine(error, file) {
  if (!publicBrowserSpecs.includes(file)) return 0;
  if (path.basename(error?.location?.file ?? "") === file && Number.isSafeInteger(error.location.line) && error.location.line > 0) return error.location.line;
  const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|[/\\\\])${escaped}:(\\d+):\\d+`, "m").exec(typeof error?.stack === "string" ? error.stack : "");
  const line = Number(match?.[1]);
  return Number.isSafeInteger(line) && line > 0 ? line : 0;
}

/** 동일 진단은 한 번만 기록하여 재시도·중복 오류의 크기를 제한한다. */
function safeErrors(result, file) {
  const errors = Array.isArray(result.errors) && result.errors.length ? result.errors : [{}];
  const seen = new Set();
  return errors.slice(0, 20).flatMap((error) => {
    const item = { code: failureCode(error, result.status), line: failureLine(error, file) };
    const id = `${item.code}:${item.line}`;
    if (seen.has(id)) return [];
    seen.add(id);
    return [item];
  });
}

export default class ExpandedPublicReporter {
  constructor({ summaryPath } = {}) {
    this.summaryPath = summaryPath;
    this.listOnly = process.env.HRA_PUBLIC_E2E_LIST === "true";
    this.failed = false;
    this.cases = new Map();
    this.tests = new Map();
    this.completed = new Set();
  }
  onBegin(_config, suite) {
    const tests = suite.allTests();
    if (tests.length !== required) this.failed = true;
    for (const test of tests) {
      const record = location(test);
      const id = record.caseId;
      if (record.file === "UNKNOWN" || id === "UNKNOWN" || requiredPublicBrowserCases[id] !== record.file || record.line === 0 || this.cases.has(id) || test.expectedStatus !== "passed") this.failed = true;
      this.cases.set(id, { ...record, status: "collected", errors: [] });
      this.tests.set(test, id);
      console.log(`COLLECT E2E_PUBLIC:${key(record)}`);
    }
    for (const [index, file] of publicBrowserSpecs.entries()) {
      if (tests.filter((test) => location(test).file === file).length !== counts[index]) this.failed = true;
    }
  }
  onTestEnd(test, result) {
    const id = this.tests.get(test);
    const passed = !!id && !this.completed.has(id) && result.status === "passed" && result.retry === 0 && test.expectedStatus === "passed";
    if (!passed) this.failed = true;
    if (id) {
      this.completed.add(id);
      const record = this.cases.get(id);
      record.status = passed ? "passed" : "failed";
      record.errors = passed ? [] : safeErrors(result, record.file);
      for (const error of record.errors) console.log(`FAIL E2E_PUBLIC_ERROR:${record.caseId}:${error.code}:${error.line}`);
    }
    console.log(`${passed ? "PASS" : "FAIL"} E2E_PUBLIC:${key(location(test))}`);
  }
  onError() { this.failed = true; console.log("FAIL E2E_PUBLIC:UNKNOWN:0:UNKNOWN"); }
  onStdOut() { /* 테스트 원문에는 URL·자격증명이 포함될 수 있어 폐기한다. */ }
  onStdErr() { /* 원본 오류 대신 정제한 상태만 기록한다. */ }
  async onEnd(result) {
    const failed = this.failed || result.status !== "passed" || (!this.listOnly && this.completed.size !== required);
    const summary = {
      status: failed ? "failed" : "passed", mode: this.listOnly ? "list" : "run", required,
      collected: this.cases.size, completed: this.completed.size, cases: [...this.cases.values()],
    };
    try {
      if (!this.summaryPath) throw new Error("E2E_PUBLIC_SUMMARY_MISSING");
      await writeFile(this.summaryPath, `${JSON.stringify(summary, null, 2)}\n`, { flag: "w" });
    } catch {
      console.log("FAIL E2E_PUBLIC_REQUIRED:24");
      return { status: "failed" };
    }
    console.log(`${failed ? "FAIL" : this.listOnly ? "COLLECT" : "PASS"} E2E_PUBLIC_REQUIRED:24`);
    return { status: failed ? "failed" : "passed" };
  }
}
