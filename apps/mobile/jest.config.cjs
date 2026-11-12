/** Expo의 네이티브 모의 구현을 사용하되 앱 바깥의 웹 테스트는 수집하지 않습니다. */
module.exports = {
  preset: 'jest-expo',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
};
