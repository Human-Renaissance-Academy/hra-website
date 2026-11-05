/** 보호 캐시만 접근하는 파일 시스템 포트입니다. 네이티브 구현과 테스트용 구현을 분리합니다. */
export interface CacheWriter {
  readonly uri: string;
  write(chunk: Uint8Array): Promise<void>;
  close(): Promise<void>;
  abort(): Promise<void>;
}
export interface FileSystemPort {
  create(fileName: string): Promise<CacheWriter>;
  delete(uri: string): Promise<void>;
  list(): Promise<readonly { readonly uri: string; readonly modifiedAt: number; readonly sizeBytes: number }[]>;
  contentUri(uri: string): Promise<string>;
}
export type TransferProgress = { readonly receivedBytes: number; readonly totalBytes: number | null };
