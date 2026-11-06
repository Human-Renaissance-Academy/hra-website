/** 문서 전체가 공유하는 결정적 작업·AST 예산입니다. 남은 예산보다 긴 탐색은 실행하지 않습니다. */
export const MAX_PARSE_WORK = 600_000;
export const MAX_DOCUMENT_NODES = 2_000;
export function createParseBudget() {
  let work = 0;
  let nodes = 0;
  return {
    spend(amount = 1): boolean {
      if (work + amount > MAX_PARSE_WORK) { work = MAX_PARSE_WORK; return false; }
      work += amount;
      return true;
    },
    node(amount = 1): boolean { if (nodes + amount > MAX_DOCUMENT_NODES) return false; nodes += amount; return true; },
    get exhausted() { return work >= MAX_PARSE_WORK || nodes >= MAX_DOCUMENT_NODES; },
    get work() { return work; },
    get nodes() { return nodes; },
  };
}
export type ParseBudget = ReturnType<typeof createParseBudget>;
