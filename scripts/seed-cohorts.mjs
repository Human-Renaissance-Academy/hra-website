/**
 * 과거 기수 선언 데이터를 보존하고 변경 계획만 안내하는 차단형 CLI입니다.
 * 신뢰된 대상·복구·승인 경계가 마련되기 전에는 DB·자격정보·파일을 읽거나 연결하지 않습니다.
 * 기존 이름별 조회·건너뛰기·순차 INSERT 적용은 비활성이며 기존 행·학적·계정·역할을 연결하지 않습니다.
 * 선언 건수는 실제 DB 건수가 아니며 선언의 보존이 현재 운영 내용이나 적용 승인을 증명하지는 않습니다.
 */

// 원본 배열 literal을 그대로 보존하는 순수 선언이며 화면·서비스의 콘텐츠 기본본으로 연결하지 않습니다.
export const cohortsData = [
  { name: "19기", startDate: "2025-09-01T00:00:00.000Z", endDate: "2026-08-31T00:00:00.000Z", description: "새로운 도전을 향해 나아가는 19기", isActive: true, order: 19, recruitmentStatus: "OPEN" },
  { name: "18기", startDate: "2024-09-01T00:00:00.000Z", endDate: "2025-08-31T00:00:00.000Z", description: "함께 성장하며 미래를 그리다.", isActive: false, order: 18, recruitmentStatus: "CLOSED" },
  { name: "17기", startDate: "2023-09-01T00:00:00.000Z", endDate: "2024-08-31T00:00:00.000Z", description: "한계를 극복하고 성장으로 보답하다.", isActive: false, order: 17, recruitmentStatus: "CLOSED" },
  { name: "16기", startDate: "2022-09-01T00:00:00.000Z", endDate: "2023-08-31T00:00:00.000Z", description: "변화를 주도하는 혁신가들.", isActive: false, order: 16, recruitmentStatus: "CLOSED" },
  { name: "15기", startDate: "2021-09-01T00:00:00.000Z", endDate: "2022-08-31T00:00:00.000Z", description: "열정과 끈기로 내일을 열다.", isActive: false, order: 15, recruitmentStatus: "CLOSED" },
  { name: "14기", startDate: "2020-09-01T00:00:00.000Z", endDate: "2021-08-31T00:00:00.000Z", description: "어려움 속에서도 빛나는 연대.", isActive: false, order: 14, recruitmentStatus: "CLOSED" },
  { name: "13기", startDate: "2019-09-01T00:00:00.000Z", endDate: "2020-08-31T00:00:00.000Z", description: "다양성이 만드는 시너지.", isActive: false, order: 13, recruitmentStatus: "CLOSED" },
  { name: "12기", startDate: "2018-09-01T00:00:00.000Z", endDate: "2019-08-31T00:00:00.000Z", description: "질문하고 탐구하며 나아가다.", isActive: false, order: 12, recruitmentStatus: "CLOSED" },
  { name: "11기", startDate: "2017-09-01T00:00:00.000Z", endDate: "2018-08-31T00:00:00.000Z", description: "세상을 바꾸는 작은 발걸음.", isActive: false, order: 11, recruitmentStatus: "CLOSED" },
  { name: "10기", startDate: "2016-09-01T00:00:00.000Z", endDate: "2017-08-31T00:00:00.000Z", description: "10년의 발자취, 새로운 도약.", isActive: false, order: 10, recruitmentStatus: "CLOSED" },
  { name: "9기", startDate: "2015-09-01T00:00:00.000Z", endDate: "2016-08-31T00:00:00.000Z", description: "틀을 깨고 세상을 연결하다.", isActive: false, order: 9, recruitmentStatus: "CLOSED" },
  { name: "8기", startDate: "2014-09-01T00:00:00.000Z", endDate: "2015-08-31T00:00:00.000Z", description: "지식과 경험의 공유.", isActive: false, order: 8, recruitmentStatus: "CLOSED" },
  { name: "7기", startDate: "2013-09-01T00:00:00.000Z", endDate: "2014-08-31T00:00:00.000Z", description: "협력을 통한 상생의 길.", isActive: false, order: 7, recruitmentStatus: "CLOSED" },
  { name: "6기", startDate: "2012-09-01T00:00:00.000Z", endDate: "2013-08-31T00:00:00.000Z", description: "미래를 디자인하는 사람들.", isActive: false, order: 6, recruitmentStatus: "CLOSED" },
  { name: "5기", startDate: "2011-09-01T00:00:00.000Z", endDate: "2012-08-31T00:00:00.000Z", description: "창의적 사고로 세상을 보다.", isActive: false, order: 5, recruitmentStatus: "CLOSED" },
  { name: "4기", startDate: "2010-09-01T00:00:00.000Z", endDate: "2011-08-31T00:00:00.000Z", description: "도전하는 용기, 성취하는 기쁨.", isActive: false, order: 4, recruitmentStatus: "CLOSED" },
  { name: "3기", startDate: "2009-09-01T00:00:00.000Z", endDate: "2010-08-31T00:00:00.000Z", description: "더 나은 사회를 위한 발판.", isActive: false, order: 3, recruitmentStatus: "CLOSED" },
  { name: "2기", startDate: "2008-09-01T00:00:00.000Z", endDate: "2009-08-31T00:00:00.000Z", description: "지성의 연대, 행동하는 지성.", isActive: false, order: 2, recruitmentStatus: "CLOSED" },
  { name: "1기", startDate: "2007-09-01T00:00:00.000Z", endDate: "2008-08-31T00:00:00.000Z", description: "HRA의 첫걸음, 역사의 시작.", isActive: false, order: 1, recruitmentStatus: "CLOSED" },
];

/** 이름·내용·URL·인자 원문을 출력하지 않고 선언 건수와 고정 계획 또는 오류만 제공합니다. */
function run(args) {
  if (args.length === 0) {
    console.log(`기수 데이터 계획: 선언 항목 ${cohortsData.length}개. 실제 DB 건수는 조회하지 않았으며 직접 적용은 비활성입니다. 접속·변경하지 않습니다. [COHORT_SEED_PLAN]`);
    return 0;
  }
  if (args.length === 1 && args[0] === "--confirm-apply") {
    console.error("적용 의도만으로 대상·복구·승인을 확인할 수 없어 직접 적용을 차단합니다. [COHORT_SEED_TARGET_UNTRUSTED]");
    return 1;
  }
  console.error("지원하지 않는 인자입니다. 인자 없이 변경 계획을 확인하세요. [COHORT_SEED_ARGUMENTS]");
  return 1;
}

// 프로젝트 기준인 Node 24의 직접 실행 표식으로 모듈 import 시 출력·종료 부작용을 막습니다.
if (import.meta.main) process.exitCode = run(process.argv.slice(2));
