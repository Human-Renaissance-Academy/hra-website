/** 전용 임시 디렉터리 이동과 프로세스 재시작 후 정리를 파일 시스템 대체 포트로 검증합니다. */
import { retainSubmissionFile, sweepSubmissionFiles } from '../src/features/files/submission-files';

const mockFiles = new Set<string>();
jest.mock('expo-crypto', () => ({ randomUUID: () => 'synthetic-id' }));
jest.mock('expo-file-system', () => {
  class Directory {
    readonly uri: string;
    constructor(...parts: readonly (string | Directory)[]) { this.uri = parts.map((part) => typeof part === 'string' ? part : part.uri).join('/'); }
    get exists() { return [...mockFiles].some((uri) => uri.startsWith(this.uri + '/')); }
    create() {}
    delete() { for (const uri of mockFiles) if (uri.startsWith(this.uri + '/')) mockFiles.delete(uri); }
  }
  class File {
    readonly uri: string;
    constructor(...parts: readonly (string | Directory)[]) { this.uri = parts.map((part) => typeof part === 'string' ? part : part.uri).join('/'); }
    async move(target: File) { mockFiles.delete(this.uri); mockFiles.add(target.uri); }
  }
  return { Directory, File, Paths: { cache: 'file:///cache' } };
});

beforeEach(() => mockFiles.clear());

test('선택 사본은 계정별 경로로 이동하여 원본 picker 사본을 남기지 않는다', async () => {
  // Given
  mockFiles.add('file:///cache/picker.pdf');
  // When
  const uri = await retainSubmissionFile('file:///cache/picker.pdf', 'account-a');
  // Then
  expect(uri).toBe('file:///cache/hra-submissions/account-a/synthetic-id.pdf');
  expect([...mockFiles]).toEqual([uri]);
});

test('새 시작의 sweep은 모든 이전 계정 사본을 삭제하되 무관한 캐시는 보존한다', async () => {
  // Given
  mockFiles.add('file:///cache/hra-submissions/a/old.pdf');
  mockFiles.add('file:///cache/hra-submissions/b/old.pdf');
  mockFiles.add('file:///cache/unrelated.pdf');
  // When
  await sweepSubmissionFiles();
  // Then
  expect([...mockFiles]).toEqual(['file:///cache/unrelated.pdf']);
});
