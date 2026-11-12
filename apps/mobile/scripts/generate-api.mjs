/** 공용 OpenAPI로 타입을 생성하거나 메모리에서 비교합니다. 검사 모드는 파일을 수정하지 않습니다. */
import { readFile, writeFile } from 'node:fs/promises';
import openapiTS, { astToString } from 'openapi-typescript';

const source = new URL('../../../packages/contracts/openapi.json', import.meta.url);
const target = new URL('../src/api/schema.d.ts', import.meta.url);
const generated = '/** 공용 OpenAPI에서 자동 생성합니다. 직접 편집하지 마세요. */\n' + astToString(await openapiTS(source));
if (process.argv.includes('--check')) {
  const existing = await readFile(target, 'utf8');
  if (existing !== generated) {
    console.error('API 타입이 오래되었습니다. npm run api:generate를 실행하세요.');
    process.exitCode = 1;
  }
} else {
  await writeFile(target, generated);
}
