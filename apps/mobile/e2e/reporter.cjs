/** 실패 assertion에 토큰이 있어도 원문을 출력하지 않고 사례명·위치·안전 오류 코드만 출력한다. */
module.exports = class MobileReporter {
  onTestResult(_test, result) {
    for (const test of result.testResults) {
      const id = /^MOBILE_[A-Z0-9_]+$/.test(test.title) ? test.title : 'MOBILE_UNKNOWN';
      console.log(`${test.status === 'passed' ? 'PASS' : 'FAIL'} ${id}`);
      if (test.status !== 'passed') {
        for (const message of test.failureMessages) {
          for (const match of message.matchAll(/(?:e2e\/[^\s():]+|src\/[^\s():]+):\d+:\d+/g)) console.log(`LOCATION ${match[0]}`);
          for (const code of new Set(message.match(/\b(?:MOBILE_[A-Z0-9_]+|NETWORK|UNAUTHENTICATED|UNAVAILABLE|FORBIDDEN|RATE_LIMITED)\b/g) ?? [])) console.log(`DIAGNOSTIC ${code}`);
        }
      }
    }
    if (result.testExecError) {
      console.log('FAIL MOBILE_NODE_MODULE_LOAD');
      const message = result.testExecError.message ?? '';
      for (const pattern of [/Cannot find module '[^']+'/g, /SyntaxError:[^\n]+/g, /ReferenceError:[^\n]+/g, /TypeError:[^\n]+/g]) {
        for (const match of message.matchAll(pattern)) console.log(`DIAGNOSTIC ${match[0]}`);
      }
    }
  }
};
