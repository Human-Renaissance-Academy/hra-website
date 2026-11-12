/** 문서 선택 사본은 계정별 전용 디렉터리에 격리하며 시작·로그아웃 때 전체를 정리합니다. */
import { Directory, File, Paths } from 'expo-file-system';
import { randomUUID } from 'expo-crypto';
import { ApiError } from '../../api/errors';

export async function retainSubmissionFile(uri: string, userId: string): Promise<string> {
  if (!/^[\w-]{1,128}$/.test(userId)) throw new ApiError({ status: 400, code: 'INVALID_INPUT' });
  const directory = new Directory(Paths.cache, 'hra-submissions', userId);
  directory.create({ intermediates: true, idempotent: true });
  const file = new File(uri);
  const target = new File(directory, `${randomUUID()}.pdf`);
  await file.move(target);
  return target.uri;
}

export async function sweepSubmissionFiles(): Promise<void> {
  const directory = new Directory(Paths.cache, 'hra-submissions');
  if (directory.exists) directory.delete();
}
