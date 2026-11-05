import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // 프로젝트 산출물 / 외부 생성 자산:
    "site/**",
    ".playwright-mcp/**",
    "screenshots/**",
    // 독립 Expo 프로젝트는 자체 설정과 CI에서 검사합니다.
    "apps/mobile/**",
    // Git에서 제외한 로컬 일회성 생성 스크립트는 전체 린트 대상에서도 제외합니다.
    "update-curriculum.js",
  ]),
]);

export default eslintConfig;
