/** 네이티브 호출 경계를 모의 구현하여 content URI 권한과 바이너리 PUT 옵션을 검증합니다. */
import { Platform } from 'react-native';
import { startActivityAsync } from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';
import { File } from 'expo-file-system';
import { openProtectedFile } from '../src/features/files/open-file';
import { expoBlobTransport } from '../src/features/submission/expo-blob-transport';
import { memoryFiles } from './file-fixtures';
jest.mock('expo-intent-launcher', () => ({ startActivityAsync: jest.fn(async () => ({})) }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(async () => true), shareAsync: jest.fn(async () => undefined) }));
jest.mock('expo-file-system', () => ({
  UploadType: { BINARY_CONTENT: 0 },
  File: jest.fn().mockImplementation(() => ({ upload: jest.fn(async () => ({ status: 200, body: '{"pathname":"exact"}' })), preview: jest.fn(async () => undefined) })),
}));
beforeEach(() => jest.clearAllMocks());

test('Android VIEW는 content URI와 읽기 권한을 전달한다', async () => {
  // Given
  const { fs } = memoryFiles(); const previous = Platform.OS; Platform.OS = 'android';
  try {
    // When
    await openProtectedFile('cache://report.pdf', fs);
    // Then
    expect(startActivityAsync).toHaveBeenCalledWith('android.intent.action.VIEW', { data: 'content://report.pdf', type: 'application/pdf', flags: 1 });
  } finally { Platform.OS = previous; }
});
test('뷰어 실패는 공유 시트로 대체한다', async () => {
  // Given
  const { fs } = memoryFiles(); const previous = Platform.OS; Platform.OS = 'android';
  jest.mocked(startActivityAsync).mockRejectedValueOnce(new TypeError('no viewer'));
  try {
    // When
    await openProtectedFile('cache://report.pdf', fs);
    // Then
    expect(Sharing.shareAsync).toHaveBeenCalledWith('cache://report.pdf', expect.objectContaining({ mimeType: 'application/pdf' }));
  } finally { Platform.OS = previous; }
});
test('Expo 파일 업로드는 multipart가 아닌 단일 바이너리 PUT을 요청한다', async () => {
  // Given
  const signal = new AbortController().signal;
  // When
  const result = await expoBlobTransport({ url: 'https://fake.test/?pathname=exact', fileUri: 'file:///cache/report.pdf',
    sizeBytes: 4, signal, headers: { authorization: 'Bearer fake' }, onProgress: jest.fn() });
  // Then
  expect(result).toEqual({ status: 200, body: { pathname: 'exact' } });
  expect(File).toHaveBeenCalledWith('file:///cache/report.pdf');
});
