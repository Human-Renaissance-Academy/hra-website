/** 실제 서버 연결과 메모리 저장 포트. 값 출력 없이 요청 수·SQL 행 수로 동작을 관찰한다. */
import { createHash, randomUUID } from 'node:crypto';
import { SessionManager } from '../src/auth/session-manager';
import { createAuthApi } from '../src/auth/auth-api';
import { createApiClient } from '../src/api/client';
import type { StoredSession, TokenStore } from '../src/auth/types';
import type { ResumeRecord, ResumeStore } from '../src/features/submission/resume-store';

declare global {
  var hraSql: (query: string, params?: readonly unknown[]) => Promise<readonly (readonly string[])[]>;
}
export const baseUrl = process.env.HRA_E2E_BASE_URL ?? '';
export const live = baseUrl ? describe : describe.skip;
export const member = 'member@resource-qa.invalid';
export const password = 'resource-qa-only-password';
export const userId = '10000000-0000-4000-8000-000000000002';
export const digest = (value: Uint8Array | string): string => createHash('sha256').update(value).digest('hex');
export const sql = (query: string, params: readonly unknown[] = []) => globalThis.hraSql(query, params);

export function memoryTokenStore(): TokenStore {
  let saved: StoredSession | null = null;
  return { read: async () => saved, write: async value => { saved = value; }, clear: async () => { saved = null; } };
}
export function memoryResumeStore(): ResumeStore {
  let saved: ResumeRecord | null = null;
  return { read: async () => saved, write: async value => { saved = value; }, clear: async () => { saved = null; } };
}
export function runtime() {
  const counts = new Map<string, number>();
  const send = async (request: Request, init?: RequestInit): Promise<Response> => {
    const key = `${request.method} ${new URL(request.url).pathname}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    return fetch(request, init);
  };
  const store = memoryTokenStore();
  const api = createAuthApi(createApiClient({ baseUrl, fetch: send }));
  const session = new SessionManager({ api, store });
  return { counts, send, store, api, session, client: createApiClient({ baseUrl, session, fetch: send }) };
}
export async function expireAccess(token: string | null) {
  if (!token) throw new Error('MOBILE_TOKEN_REQUIRED');
  await sql(`UPDATE mobile_sessions SET created_at=created_at-interval '1 hour',rotated_at=rotated_at-interval '1 hour',
    access_expires_at=clock_timestamp()-interval '1 second' WHERE access_hash=$1`, [digest(token)]);
}
export async function assignment(): Promise<string> {
  const id = randomUUID();
  await sql(`INSERT INTO assignments(id,cohort_id,title,due_at,created_by_user_id)
    VALUES($1::uuid,'30000000-0000-4000-8000-000000000001','모바일 실제 제출',clock_timestamp()+interval '1 day',
    '10000000-0000-4000-8000-000000000003')`, [id]);
  await sql("SELECT publish_academic_assignment($1::uuid,'10000000-0000-4000-8000-000000000003'::uuid)", [id]);
  return id;
}
