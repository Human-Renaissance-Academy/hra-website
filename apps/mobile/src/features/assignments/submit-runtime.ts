/**
 * 역할: 과제 제출 화면의 네이티브 어댑터(PDF 문서 선택, 캐시 사본 삭제, 제출 실행기 팩터리)
 * 사용 위치: src/features/assignments/assignment-submit-screen.tsx
 * 주요 기능:
 * - expo-document-picker로 application/pdf 단일 파일을 캐시 디렉터리로 복사 선택
 * - 제출 완료·파일 교체·화면 종료 시 복사된 임시 PDF 캐시 파일 정리
 * - createSubmitRunner + createSubmissionApi + createBlobUploader(expoBlobTransport) 결합
 */
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { randomUUID } from 'expo-crypto';
import { getApiClient } from '../../auth/runtime';
import { getResumeStore, ready } from '../account/account-runtime';
import { createBlobUploader } from '../submission/blob-upload';
import { expoBlobTransport } from '../submission/expo-blob-transport';
import { createSubmissionApi } from '../submission/submission-api';
import { createSubmitRunner } from '../submission/submit-runner';
import type { SubmitCommand, SubmitEvent, SubmitResult } from '../submission/types';
import type { PickedDocumentAssetLike } from './submission-view-model';

export type SubmitRunnerFn = (
  command: SubmitCommand,
  controls?: {
    readonly signal?: AbortSignal;
    readonly onEvent?: (event: SubmitEvent) => void;
  },
) => Promise<SubmitResult>;

/** 시스템 문서 선택기에서 PDF 파일 한 개를 캐시 디렉터리로 복사해 가져옵니다. */
export async function pickAssignmentPdfFromDevice(): Promise<
  readonly PickedDocumentAssetLike[] | null
> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/pdf',
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets) {
    return null;
  }
  return result.assets;
}

/** 문서 선택기가 캐시 디렉터리에 복사한 임시 PDF 파일을 최선을 다해 삭제합니다. */
export function deletePickedCacheFile(uri: string | null | undefined): void {
  if (!uri) return;
  try {
    const file = new File(uri);
    if (file.exists) {
      file.delete();
    }
  } catch {
    // 캐시 정리는 보조 작업이므로 파일 삭제 실패가 제출 성공 결과를 뒤집지 않습니다.
  }
}

/** 현재 로그인한 사용자 계정용 기본 제출 실행기(SubmitRunner)를 생성합니다. */
export function createDefaultAssignmentSubmitRunner(
  userId: string,
  now: () => number = Date.now,
): SubmitRunnerFn {
  const store = getResumeStore(userId);
  const api = createSubmissionApi(getApiClient());
  const upload = createBlobUploader({
    transport: expoBlobTransport,
    now,
    generateId: randomUUID,
  });
  const run = createSubmitRunner({
    api,
    store,
    upload,
    now,
    generateId: randomUUID,
  });
  return async (command, controls) => { await ready(); return run(command, controls); };
}
