/** 문서별 원격 이미지 예산과 허용 호스트입니다. 비승인 HTTPS는 명시적으로 누르기 전 로드하지 않습니다. */
import { createContext, useContext } from 'react';
import { getApiBaseUrl } from '../../config/env';
import { sanitizeImageUrl } from './sanitize-url';

export const MAX_DOCUMENT_IMAGES = 20;
export const MarkdownImagePolicy = createContext<ReadonlySet<object> | null>(null);

export function isApprovedImage(url: string, apiOrigin: string): boolean {
  const safe = sanitizeImageUrl(url);
  if (!safe) return false;
  const host = new URL(safe).hostname;
  return host === new URL(apiOrigin).hostname || host.endsWith('.public.blob.vercel-storage.com');
}

export function useAutomaticImage(url: string | null, identity?: object): boolean {
  const approved = useContext(MarkdownImagePolicy);
  if (!url) return false;
  if (approved) return identity !== undefined && approved.has(identity);
  try { return isApprovedImage(url, getApiBaseUrl()); }
  catch (error) { if (!(error instanceof Error)) throw error; return false; }
}
