/** 모바일 전용 린트 설정입니다. 생성된 네이티브 코드와 계약 타입은 검사 범위에서 분리합니다. */
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
module.exports = defineConfig([
  expoConfig,
  { ignores: ['android/**', 'ios/**', 'dist/**', '.expo/**', 'coverage/**', 'src/api/schema.d.ts'] },
]);
