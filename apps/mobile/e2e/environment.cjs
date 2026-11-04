/** Jest VM 밖의 실제 Node fetch·Dispatcher·격리 SQL을 주입하며 Expo 모의 구현은 쓰지 않는다. */
const { TestEnvironment } = require('jest-environment-node');
const { resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
const { fileURLToPath } = require('node:url');

module.exports = class MobileEnvironment extends TestEnvironment {
  async setup() {
    await super.setup();
    Object.assign(this.global, { fetch, Request, Response, Headers, AbortController, AbortSignal, Blob,
      ReadableStream, TextEncoder, TextDecoder });
    if (!process.env.HRA_E2E_BASE_URL) return;
    const root = resolve(fileURLToPath(pathToFileURL(require.resolve('./environment.cjs'))), '../../../..');
    const { installAcademicGateNetwork } = await import(pathToFileURL(resolve(root, 'tests/support/academic-g1-network.mjs')).href);
    const { createPsqlTransport } = await import(pathToFileURL(resolve(root, 'tests/support/neon-psql-transport.mjs')).href);
    const execute = createPsqlTransport(process.env);
    this.global.hraSql = async (query, params = []) => (await execute({ query, params })).rows;
    this.network = installAcademicGateNetwork({ appOrigin: process.env.HRA_E2E_BASE_URL,
      storeOrigin: process.env.HRA_G1_STORE_ORIGIN, blobHost: process.env.ACADEMIC_SUBMISSION_BLOB_HOST });
  }
  async teardown() {
    if (this.network) {
      const blocked = this.network.snapshot().blocked;
      await this.network.close();
      if (blocked) throw new Error('MOBILE_CLIENT_EXTERNAL_NETWORK');
    }
    await super.teardown();
  }
};
