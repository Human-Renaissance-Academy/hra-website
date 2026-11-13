/**
 * 실제 Actions의 실패 상태·보고서 경로를 운영 접속 없이 확인한다.
 * 이 실행에서 만든 루프백 서버의 health만 503으로 반환하고 의도적으로 실패 종료한다.
 */
import { spawn } from "node:child_process";
import { appendFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repository = dirname(dirname(fileURLToPath(import.meta.url)));
const sockets = new Set();
// 실제 사이트 대신 이 서버만 읽는다. 사용자·DB·Blob은 준비하지 않는다.
const server = createServer((request, response) => {
  if (request.url === "/api/health") {
    response.writeHead(503, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ status: "error" }));
  } else if (request.url === "/favicon.ico") {
    response.writeHead(200, { "Content-Type": "image/x-icon" });
    response.end(Buffer.from([0, 0, 1, 0, 1, 0]));
  } else if (request.url === "/robots.txt") {
    response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(
      [
        "User-agent: *",
        "Allow: /",
        "Disallow: /admin",
        "Disallow: /member",
        "Disallow: /mypage",
        "Disallow: /resources",
        "Disallow: /login",
        "Disallow: /register",
        "Disallow: /pending",
        "Disallow: /system-error",
        "Disallow: /api/",
        `Sitemap: http://${request.headers.host}/sitemap.xml`,
      ].join("\n"),
    );
  } else if (request.url === "/sitemap.xml") {
    response.writeHead(200, { "Content-Type": "application/xml; charset=utf-8" });
    response.end(
      `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>http://${request.headers.host}/</loc></url></urlset>`,
    );
  } else {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end('<!doctype html><html lang="ko"><title>HRA 합성 점검</title></html>');
  }
});
server.on("connection", (socket) => {
  sockets.add(socket);
  socket.once("close", () => sockets.delete(socket));
});
let child,
  timer,
  forceTimer,
  interrupted = false;

/** 자체 프로세스 그룹만 종료하며 다른 앱·작업 공간에는 신호를 보내지 않는다. */
function terminate(signal = "SIGTERM") {
  if (!child?.pid) return;
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== "ESRCH") process.exitCode = 1;
  }
}
const interrupt = () => {
  interrupted = true;
  terminate();
  forceTimer = setTimeout(() => terminate("SIGKILL"), 2_000);
};
process.once("SIGINT", interrupt);
process.once("SIGTERM", interrupt);
try {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  if (interrupted) throw new Error("SMOKE_FIXTURE_INTERRUPTED");
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) throw new Error("SMOKE_FIXTURE_SUMMARY_REQUIRED");
  await appendFile(
    summaryPath,
    "# 합성 알림 경로 검증 — 의도된 실패\n\n운영 서비스에 접속하지 않았습니다. 아래 fixture health 503과 실패 상태가 기대 결과입니다.\n\n",
  );
  const arguments_ = process.argv.slice(2);
  if (!arguments_.includes("--output"))
    arguments_.push("--output", "test-results/production-smoke.json");
  child = spawn(
    process.execPath,
    [
      join(repository, "scripts/verify-production-smoke.mjs"),
      ...arguments_,
      "--fixture",
      "--fixture-origin",
      origin,
      "--sha-kind",
      "fixture",
    ],
    {
      cwd: repository,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { PATH: process.env.PATH, HOME: process.env.HOME, GITHUB_STEP_SUMMARY: summaryPath },
    },
  );
  let output = "";
  child.stdout.on("data", (chunk) => {
    if (output.length + chunk.length > 100_000) interrupt();
    else output += String(chunk);
  });
  child.stderr.resume();
  timer = setTimeout(interrupt, 45_000);
  const code = await new Promise((resolve, reject) => {
    child.once("error", () => reject(new Error("SMOKE_FIXTURE_CHILD")));
    child.once("close", resolve);
  });
  const report = JSON.parse(output);
  if (
    interrupted ||
    code !== 1 ||
    report.environment !== "fixture" ||
    report.ok ||
    report.checks.length !== 6 ||
    report.checks.filter((check) => !check.ok).length !== 1 ||
    !report.checks.some(
      (check) =>
        check.path === "/api/health" && check.status === 503 && check.code === "HTTP_STATUS",
    )
  ) {
    throw new Error("SMOKE_FIXTURE_RESULT");
  }
  console.log("SMOKE_FIXTURE_EXPECTED_FAILURE");
  // 실제 알림 채널인 Actions의 실패 상태를 관찰하기 위해 1을 그대로 보존한다.
  process.exitCode = 1;
} catch {
  console.error("SMOKE_FIXTURE_FAILED");
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
  clearTimeout(forceTimer);
  terminate("SIGKILL");
  for (const socket of sockets) socket.destroy();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  process.removeListener("SIGINT", interrupt);
  process.removeListener("SIGTERM", interrupt);
}
