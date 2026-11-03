/** 기존 외부망 차단을 유지하며 DB 전송의 문장 수만 기록합니다. SQL·인자·결과는 기록하지 않습니다. */
import "./academic-g1-preload.mjs";
import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { qaNeonEndpoint } from "./neon-psql-transport.mjs";

const executeFetch = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  const response = await executeFetch(input, options);
  const url = input instanceof Request ? input.url : String(input);
  if (url === qaNeonEndpoint) appendFileSync(join(process.env.HRA_RESOURCE_QA_ROOT, "mobile-statements.count"), ".");
  return response;
};
