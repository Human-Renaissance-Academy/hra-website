/** 로컬 PDF를 Android VIEW·읽기 권한 또는 iOS 미리보기로 열고 공유 시트로 대체합니다. */
import { Platform } from 'react-native';
import { File } from 'expo-file-system';
import { startActivityAsync } from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';
import { ApiError } from '../../api/errors';
import { ko } from '../../i18n/ko';
import type { FileSystemPort } from './file-system-port';

export async function openProtectedFile(uri: string, fs: FileSystemPort): Promise<void> {
  try {
    if (Platform.OS === 'android') {
      await startActivityAsync('android.intent.action.VIEW', { data: await fs.contentUri(uri), type: 'application/pdf', flags: 1 });
    } else await new File(uri).preview({ mimeType: 'application/pdf' });
  } catch (error) {
    if (!(error instanceof Error)) throw new ApiError({ status: 0, code: 'UNAVAILABLE' });
    if (!await Sharing.isAvailableAsync()) throw new ApiError({ status: 0, code: 'UNAVAILABLE' });
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: ko.files.open, UTI: 'com.adobe.pdf' });
  }
}
