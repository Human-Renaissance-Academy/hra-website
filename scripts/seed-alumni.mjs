/**
 * 과거 수료생 이야기 선언 데이터를 보존하고 변경 계획만 안내하는 차단형 CLI입니다.
 * 신뢰된 대상·복구·승인 경계가 마련되기 전에는 DB·자격정보·파일을 읽거나 연결하지 않습니다.
 * 기존 이름별 조회·건너뛰기·순차 INSERT 적용은 비활성이며 관리자가 편집한 이야기·이미지 metadata를 덮어쓰지 않습니다.
 * 선언 건수는 실제 DB 건수가 아니며 선언의 보존이 현재 운영 내용이나 적용 승인을 증명하지는 않습니다.
 */

// 원본 배열 literal을 그대로 보존하는 순수 선언이며 화면·서비스의 콘텐츠 기본본으로 연결하지 않습니다.
export const alumniData = [
  {
    name: "17기 수료생",
    title: null,
    quote: "한계까지 도전하고, 성장으로 보답하다",
    content:
      "HRA에서의 1년은 단순한 교육이 아닌, 삶의 전환점이었습니다. 고전 읽기와 토론을 통해 깊이 사고하는 법을 배웠고, 케이스 스터디를 통해 실제 문제를 해결하는 역량을 키웠습니다.",
    isFeatured: true,
    order: 1,
  },
  {
    name: "18기 수료생",
    title: null,
    quote: "본질을 묻는 힘, 현업에서의 차이를 만들다",
    content:
      "HRA에서 배운 본질적 사고력은 직장에서도 큰 차이를 만들어 주었습니다. 문제의 표면이 아닌 근본을 파악하는 습관이 자연스럽게 업무에 녹아들었습니다.",
    isFeatured: true,
    order: 2,
  },
  {
    name: "19기 수료생",
    title: null,
    quote: "평생을 함께할 최고의 동료들을 얻었습니다",
    content:
      "HRA에서 가장 값진 것은 함께 성장한 동료들입니다. 매주 토요일 함께 고민하고 토론하며 쌓은 유대는 수료 후에도 계속되고 있습니다.",
    isFeatured: true,
    order: 3,
  },
];

/** 이름·내용·URL·인자 원문을 출력하지 않고 선언 건수와 고정 계획 또는 오류만 제공합니다. */
function run(args) {
  if (args.length === 0) {
    console.log(`수료생 이야기 데이터 계획: 선언 항목 ${alumniData.length}개. 실제 DB 건수는 조회하지 않았으며 직접 적용은 비활성입니다. 접속·변경하지 않습니다. [ALUMNI_SEED_PLAN]`);
    return 0;
  }
  if (args.length === 1 && args[0] === "--confirm-apply") {
    console.error("적용 의도만으로 대상·복구·승인을 확인할 수 없어 직접 적용을 차단합니다. [ALUMNI_SEED_TARGET_UNTRUSTED]");
    return 1;
  }
  console.error("지원하지 않는 인자입니다. 인자 없이 변경 계획을 확인하세요. [ALUMNI_SEED_ARGUMENTS]");
  return 1;
}

// 프로젝트 기준인 Node 24의 직접 실행 표식으로 모듈 import 시 출력·종료 부작용을 막습니다.
if (import.meta.main) process.exitCode = run(process.argv.slice(2));
