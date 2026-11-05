/** 실제 PDF·Blob PUT·최종화 응답 유실·재개·취소와 Node 파일 스트림을 연결한다. */
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ApiError } from '../src/api/errors';
import { createBlobUploader, createFetchBlobTransport } from '../src/features/submission/blob-upload';
import { runSubmitFlow } from '../src/features/submission/submit-flow';
import { createSubmissionApi } from '../src/features/submission/submission-api';
import { downloadProtectedFile } from '../src/features/files/download-protected-file';
import { createProtectedRequest } from '../src/features/files/protected-request';
import { assignment, digest, live, member, memoryResumeStore, password, runtime, sql } from './support';
import { nodeFiles } from './node-files';

live('실제 모바일 제출', () => {
  beforeEach(async () => { await sql('TRUNCATE rate_limit_events'); });
  it('MOBILE_CLIENT_SUBMIT_DOWNLOAD_ABORT', async () => {
    // Given: 최소 실제 PDF와 인증된 클라이언트·실제 파일 시스템을 준비한다.
    const root = await mkdtemp(join(tmpdir(), 'hra-mobile-client-'));
    const r = runtime(); await r.session.login(member, password);
    try {
      const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
      const uri = join(root, 'input.pdf'); await writeFile(uri, pdf);
      let puts = 0;
      const upload = createBlobUploader({ now: Date.now, generateId: randomUUID,
        transport: createFetchBlobTransport(async (url, init) => { puts++; return fetch(url, init); }, async path => new Blob([await readFile(path)])) });
      const deps = { api: createSubmissionApi(r.client), store: memoryResumeStore(), upload, now: Date.now, generateId: randomUUID };
      // When: 실제 서버 승인부터 최종 제출까지 같은 코어를 실행한다.
      const result = await runSubmitFlow(deps, { kind: 'new', assignmentId: await assignment(),
        file: { uri, name: '실제 제출.pdf', sizeBytes: pdf.length, mimeType: 'application/pdf' } });
      // Then: 단일 PUT 후 보호 다운로드 원본 해시가 동일하다.
      expect(result.kind).toBe('success'); if (result.kind !== 'success') throw new Error(`MOBILE_SUBMIT_${result.kind === 'error' ? result.error.code : 'CANCELLED'}`);
      expect(puts).toBe(1);
      const request = createProtectedRequest(r.client, { kind: 'submission', submissionId: result.submission.submissionId, fileId: result.submission.file.fileId });
      const cache = await mkdtemp(join(tmpdir(), 'hra-mobile-download-'));
      try {
        const fs = nodeFiles(cache);
        const downloaded = await downloadProtectedFile({ fs, request, fileNameHint: '보호.pdf' });
        expect(digest(await readFile(downloaded.uri))).toBe(digest(pdf));
        const controller = new AbortController();
        await expect(downloadProtectedFile({ fs, request, fileNameHint: '취소.pdf', signal: controller.signal,
          onProgress: progress => { if (progress.receivedBytes > 0) controller.abort(); } })).rejects.toMatchObject({ code: 'NETWORK' });
        expect((await readdir(cache)).length).toBe(1);
      } finally { await rm(cache, { recursive: true, force: true }); }
    } finally { await r.session.logout(); await rm(root, { recursive: true, force: true }); }
  });
  it('MOBILE_CLIENT_INTERRUPTED_RESUME_REPLAY_CANCEL', async () => {
    // Given: 실제 최종화 응답만 버려 모호한 전송 실패를 재현한다.
    const root = await mkdtemp(join(tmpdir(), 'hra-mobile-resume-'));
    const r = runtime(); await r.session.login(member, password);
    try {
      const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
      const uri = join(root, 'input.pdf'); await writeFile(uri, pdf);
      const api = createSubmissionApi(r.client), store = memoryResumeStore();
      let puts = 0;
      const upload = createBlobUploader({ now: Date.now, generateId: randomUUID,
        transport: createFetchBlobTransport(async (url, init) => { puts++; return fetch(url, init); }, async path => new Blob([await readFile(path)])) });
      const deps = { api, store, upload, now: Date.now, generateId: randomUUID };
      const interrupted = await runSubmitFlow({ ...deps, api: { ...api, finalize: async body => {
        await api.finalize(body); throw new ApiError({ status: 0, code: 'NETWORK' });
      } } }, { kind: 'new', assignmentId: await assignment(), file: { uri, name: '재개.pdf', sizeBytes: pdf.length, mimeType: 'application/pdf' } });
      expect(interrupted).toMatchObject({ kind: 'error', canResume: true });
      expect((await store.read())?.phase).toBe('finalizing');
      // When: 저장된 같은 키로 명시 재개한다.
      const resumed = await runSubmitFlow(deps, { kind: 'resume' });
      // Then: PUT 재전송 없이 실제 서버의 replayed 성공으로 복구한다.
      expect(resumed).toMatchObject({ kind: 'success', submission: { replayed: true } }); expect(puts).toBe(1);
      expect(await store.read()).toBeNull();
      const cancellation = new AbortController();
      const cancelled = await runSubmitFlow(deps, { kind: 'new', assignmentId: await assignment(),
        file: { uri, name: '취소.pdf', sizeBytes: pdf.length, mimeType: 'application/pdf' } }, {
        signal: cancellation.signal, onEvent: event => { if (event.state === 'authorizing') cancellation.abort(); },
      });
      expect(cancelled.kind).toBe('cancelled'); expect(puts).toBe(1); expect(await store.read()).toBeNull();
      expect([...r.counts].filter(([key]) => key.startsWith('DELETE /api/v1/uploads/intents/')).reduce((sum, [, count]) => sum + count, 0)).toBe(1);
    } finally { await r.session.logout(); await rm(root, { recursive: true, force: true }); }
  });
});
