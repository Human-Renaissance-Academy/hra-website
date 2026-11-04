/** Bearer의 Origin 없는 실제 PDF 전송·서명 callback·멱등 제출·본인 제출 파일 보호 다운로드를 검증한다. */
import { randomUUID } from "node:crypto";
import { put } from "@vercel/blob/client";
import { academicG1Actors as actors, academicG1Ids as ids, academicG1Sql, createAcademicG1Assignment } from "./academic-g1-fixture.mjs";
import { resourceQaPdfBytes } from "./resource-qa-pdf.mjs";
import { check, expectStatus, hash, pass } from "./mobile-bearer-http.mjs";

/** Next 정적 헤더가 route 보안 정책을 덮어쓰는 회귀까지 실제 응답에서 검사한다. */
function assertFileHeaders(response) {
  const disposition = response.headers.get("content-disposition") ?? "";
  check(/^attachment;\s*filename=/i.test(disposition) && !/[\r\n\\]/.test(disposition), "FILE_ATTACHMENT");
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const filename = encoded ? decodeURIComponent(encoded) : disposition.match(/filename="([^"]+)"/)?.[1];
  check(filename && !/[\/\\\r\n]/.test(filename) && !filename.includes(".."), "FILE_SAFE_NAME");
  check(response.headers.get("x-content-type-options") === "nosniff", "FILE_NOSNIFF");
  check(response.headers.get("content-security-policy") === "sandbox; default-src 'none'", "FILE_CSP");
  check(response.headers.get("cache-control") === "private, no-store" && !response.headers.has("set-cookie"), "FILE_CACHE_COOKIE");
  const vary = response.headers.get("vary")?.toLowerCase().split(",").map(value => value.trim());
  check(vary?.includes("cookie") && vary.includes("authorization"), "FILE_VARY");
}

export async function verifyMobileSubmission({ http: h, cluster, store, cookie }) {
  const session = await h.login(), headers = h.bearer(session), pdf = resourceQaPdfBytes();
  // 고정 일정은 설치 시각(now())에 생성되므로 조회 연·월도 DB에 저장된 값에서 읽어 실행 날짜에 의존하지 않는다.
  const [year, month] = cluster.sql(`SELECT to_char(event_date,'YYYY-FMMM') FROM schedule_events WHERE id='${ids.event}'`).split("-");
  for (const path of ["/api/v1/notices", `/api/v1/schedule?year=${year}&month=${month}`]) {
    const response = await h.request(path); check(response.status === 200, "PUBLIC_STATUS");
    const body = await response.json(); check(path.includes("notices") ? body.notices.length > 0 : body.events.length > 0, "PUBLIC_ROWS");
  }
  pass("PUBLIC_NOTICES_SCHEDULE");
  for (const path of ["/api/v1/assignments", `/api/v1/assignments/${ids.active}`]) {
    await expectStatus(await h.request(path, { headers }), 200, "ASSIGNMENTS");
  }
  pass("ASSIGNMENTS");
  const input = { assignmentId: ids.active, requestId: randomUUID(), originalName: "격리 모바일.pdf", sizeBytes: pdf.length, mimeType: "application/pdf" };
  const cookieMutation = await h.json("/api/v1/uploads/intents", input, { Cookie: cookie });
  const denied = await expectStatus(cookieMutation, 403, "COOKIE_ORIGIN"); check(denied.error.code === "FORBIDDEN", "COOKIE_ORIGIN_CODE");
  const response = await h.json("/api/v1/uploads/intents", input, headers);
  check(response.status === 200, "INTENT"); const grant = await response.json();
  const tokenBody = { type: "blob.generate-client-token", payload: { pathname: grant.pathname, multipart: false,
    clientPayload: JSON.stringify({ assignmentId: ids.active, uploadIntentId: grant.uploadIntentId }) } };
  const cookieToken = await expectStatus(await h.json("/api/v1/uploads", tokenBody, { Cookie: cookie }), 404, "COOKIE_TOKEN_ORIGIN");
  check(cookieToken.error.code === "NOT_FOUND", "COOKIE_TOKEN_CODE"); pass("COOKIE_MUTATION_ORIGIN");
  const tokenResponse = await h.json("/api/v1/uploads", tokenBody, headers);
  check(tokenResponse.status === 200, "CLIENT_TOKEN"); const token = (await tokenResponse.json()).clientToken;
  const before = store.snapshot().PUT;
  await put(grant.pathname, pdf, { access: "private", token, contentType: "application/pdf", multipart: false,
    abortSignal: AbortSignal.timeout(30_000) });
  check(store.snapshot().PUT === before + 1, "SINGLE_PUT"); pass("NATIVE_TOKEN_SINGLE_PUT");
  const receipt = store.receipt(grant.pathname);
  const unsigned = await h.json("/api/v1/uploads", receipt.body);
  check(unsigned.status >= 400, "UNSIGNED_CALLBACK"); await unsigned.body.cancel();
  const signed = await h.json("/api/v1/uploads", receipt.body, { "x-vercel-signature": receipt.signature });
  check(signed.status === 200, `SIGNED_CALLBACK_${signed.status}`); await signed.body.cancel(); pass("CALLBACK_SIGNATURE");
  await expectStatus(await h.json(`/api/v1/uploads/${grant.uploadIntentId}/verify`, { assignmentId: ids.active }, headers), 200, "VERIFY");
  const command = { assignmentId: ids.active, uploadIntentId: grant.uploadIntentId, submissionKey: randomUUID() };
  const finalized = await h.json("/api/v1/submissions", command, headers); check(finalized.status === 200, "SUBMIT");
  const result = (await finalized.json()).submission; check(result.replayed === false, "FIRST_SUBMIT");
  const replay = await h.json("/api/v1/submissions", command, headers); check(replay.status === 200, "REPLAY");
  const repeated = (await replay.json()).submission;
  check(repeated.replayed === true && repeated.submissionId === result.submissionId, "REPLAY_SAME"); pass("VERIFY_SUBMIT_REPLAY");
  const file = await h.request(`/api/v1/submissions/${result.submissionId}/files/${result.file.fileId}`, { headers });
  assertFileHeaders(file);
  check(file.status === 200 && hash(Buffer.from(await file.arrayBuffer())) === hash(pdf), "OWN_FILE_HASH"); pass("OWN_FILE_HASH");
  const peer = await h.login("studentB");
  await expectStatus(await h.request(`/api/v1/submissions/${result.submissionId}/files/${result.file.fileId}`, { headers: h.bearer(peer) }), 404, "PEER_FILE_DENIED");
  pass("BEARER_FILE_HEADERS_PEER_DENIED");
  // 가이드북 목록은 Bearer 승인 회원에게 200, 역할이 PENDING으로 바뀐 세션에는 403이다.
  // 파일 다운로드 경로(#272 후속 묶음)는 이 서버 인증 범위에 포함하지 않는다.
  await expectStatus(await h.request("/api/v1/resources/guidebooks", { headers }), 200, "GUIDE_LIST");
  const pending = await h.login("studentB");
  cluster.sql(`UPDATE users SET role='PENDING' WHERE id='10000000-0000-4000-8000-000000000006'`);
  await expectStatus(await h.request("/api/v1/resources/guidebooks", { headers: h.bearer(pending) }), 403, "PENDING_GUIDE");
  cluster.sql(`UPDATE users SET role='MEMBER' WHERE id='10000000-0000-4000-8000-000000000006'`);
  pass("GUIDEBOOK_LIST_PENDING");
  // Given: 같은 객체의 실제 검증 읽기를 멈추되 저장소의 서명·경로 검사는 그대로 유지한다.
  for (const mode of ["revoke", "version"]) {
    cluster.sql("TRUNCATE rate_limit_events");
    const assignmentId = await createAcademicG1Assignment(academicG1Sql(cluster.environment));
    const active = await h.login(), activeHeaders = h.bearer(active);
    const intentResponse = await h.json("/api/v1/uploads/intents", { ...input, assignmentId, requestId: randomUUID() }, activeHeaders);
    check(intentResponse.status === 200, "BARRIER_INTENT");
    const intent = await intentResponse.json();
    const tokenResponse = await h.json("/api/v1/uploads", { type: "blob.generate-client-token", payload: {
      pathname: intent.pathname, multipart: false,
      clientPayload: JSON.stringify({ assignmentId, uploadIntentId: intent.uploadIntentId }),
    } }, activeHeaders);
    check(tokenResponse.status === 200, "BARRIER_TOKEN");
    await put(intent.pathname, pdf, { access: "private", token: (await tokenResponse.json()).clientToken,
      contentType: "application/pdf", multipart: false, abortSignal: AbortSignal.timeout(30_000) });
    const receipt = store.receipt(intent.pathname);
    await expectStatus(await h.json("/api/v1/uploads", receipt.body, { "x-vercel-signature": receipt.signature }), 200, "BARRIER_CALLBACK");
    const paused = store.pauseNextRead();
    const submissionKey = randomUUID();
    const pending = h.json("/api/v1/submissions", { assignmentId, uploadIntentId: intent.uploadIntentId, submissionKey }, activeHeaders);
    let timer;
    try {
      await Promise.race([paused.started, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("MOBILE_BLOB_BARRIER_TIMEOUT")), 10_000);
      })]);
      // When: Blob 읽기가 진행 중인 요청의 모바일 권한만 무효화한다.
      if (mode === "revoke") await expectStatus(await h.json("/api/v1/auth/logout-all", undefined, h.bearer(active)), 204, "BARRIER_LOGOUT_ALL");
      else cluster.sql(`UPDATE users SET session_version=session_version+1 WHERE id='${actors.studentA.id}'`);
    } finally { clearTimeout(timer); paused.release(); }
    // Then: post-Blob 재인가가 401이며 새 제출·커밋은 존재하지 않는다.
    await expectStatus(await pending, 401, "BARRIER_REVOKED");
    check(cluster.sql(`SELECT count(*) FROM assignment_submissions WHERE submission_key='${submissionKey}'`) === "0", "BARRIER_NO_COMMIT");
    pass(`POST_BLOB_${mode.toUpperCase()}_NO_COMMIT`);
  }
}
