/** 실제 서버 전용 Node 프로젝트. 일반 Jest의 tests/ 수집 범위를 변경하지 않는다. */
module.exports = {
  roots: ['<rootDir>/e2e'],
  testMatch: ['**/*.e2e.ts'],
  testEnvironment: '<rootDir>/e2e/environment.cjs',
  transform: { '^.+\\.tsx?$': ['babel-jest', { plugins: ['@babel/plugin-transform-typescript', '@babel/plugin-transform-modules-commonjs'] }] },
  reporters: ['<rootDir>/e2e/reporter.cjs'],
  testTimeout: 60000,
};
