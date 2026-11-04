/** 임시 H 모양 아이콘을 PNG로 재현합니다. 정식 브랜드 자산 승인 전까지만 사용합니다. */
import sharp from 'sharp';
import { Buffer } from 'node:buffer';
import { mkdir } from 'node:fs/promises';
const root = new URL('../assets/', import.meta.url);
await mkdir(root, { recursive: true });
const foreground = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><path fill="white" d="M300 300h100v160h224V300h100v424H624V560H400v164H300z"/></svg>');
await sharp(new URL('icon.svg', root).pathname).png().toFile(new URL('icon.png', root).pathname);
await sharp(foreground).png().toFile(new URL('adaptive-icon.png', root).pathname);
await sharp(foreground).png().toFile(new URL('monochrome-icon.png', root).pathname);
