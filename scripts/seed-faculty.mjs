/**
 * 과거 교수진 선언 데이터를 보존하고 변경 계획만 안내하는 차단형 CLI입니다.
 * 신뢰된 대상·복구·승인 경계가 마련되기 전에는 DB·자격정보·파일을 읽거나 연결하지 않습니다.
 * 기존 이름+카테고리별 조회·건너뛰기·순차 INSERT 적용은 비활성이며 기존 행·계정·역할을 연결하지 않습니다.
 * 교수진 선언은 수업 내용 담당 정보일 뿐 출결·학사 운영 권한이나 승인 계정 부여의 근거가 아닙니다.
 * 선언 건수는 실제 DB 건수가 아니며 선언의 보존이 현재 운영 내용이나 적용 승인을 증명하지는 않습니다.
 */

// 원본 배열 literal을 그대로 보존하는 순수 선언이며 화면·서비스의 콘텐츠 기본본으로 연결하지 않습니다.
export const facultyData = [
  // ── 고전 명작 (CLASSICS) ──
  { name: "김경희", category: "CLASSICS", currentPosition: null, formerPosition: "유니세프한국위원회 사무차장, 중앙일보·동아일보 기자, 스웨덴 스톡홀름대학교 국제대학원 수료", order: 1 },
  { name: "김수종", category: "CLASSICS", currentPosition: "칼럼니스트", formerPosition: "한국일보 기자·뉴욕특파원·논설위원·주필", order: 2 },
  { name: "신현덕", category: "CLASSICS", currentPosition: "신 교수의 돌씨앗농장 대표", formerPosition: "국민대학교 교수, 국민일보 대기자, 경인방송 사장", order: 3 },
  { name: "유재원", category: "CLASSICS", currentPosition: "외국어대학교 명예교수", formerPosition: null, order: 4 },
  { name: "이계성", category: "CLASSICS", currentPosition: null, formerPosition: "국회의장 정무수석, 한국일보 편집국장·논설실장", order: 5 },
  { name: "임재윤", category: "CLASSICS", currentPosition: null, formerPosition: "제주대학교 전파정보통신공학과 교수, 제주대학교 취업전략본부 본부장", order: 6 },
  { name: "권오숙", category: "CLASSICS", currentPosition: "한국 외국어대학교 초빙 교수", formerPosition: null, order: 7 },
  { name: "조운찬", category: "CLASSICS", currentPosition: null, formerPosition: "경향신문 베이징특파원·문화부장·논설위원", order: 8 },

  // ── 케이스 스터디 (BUSINESS) ──
  { name: "강대현", category: "BUSINESS", currentPosition: "GNTI ㈜ 대표", formerPosition: "하이마트 상품본부장, 대우 스페인법인장·해외사업본부장", order: 1 },
  { name: "박용기", category: "BUSINESS", currentPosition: null, formerPosition: "크라운제과 ㈜ 상근감사, 우리은행 영업본부장", order: 2 },
  { name: "이갑수", category: "BUSINESS", currentPosition: "드림드림 사회적기업 협동조합 이사", formerPosition: "우리은행 지점장", order: 3 },
  { name: "이미경", category: "BUSINESS", currentPosition: "산업정책연구원 연구교수, TRIWORKS inc. ㈜, 사단법인LETS 대표이사", formerPosition: "㈜세바스틴 한국법인 총괄이사", order: 4 },
  { name: "최영선", category: "BUSINESS", currentPosition: "Microsoft Korea 매니저", formerPosition: "SAP Labs Korea 개발자, 티맥스소프트 선임연구원", order: 5 },
  { name: "이순섭", category: "BUSINESS", currentPosition: "JP임팩트(주) 회장", formerPosition: "유한D&S 대표이사, 유한킴벌리 영업본부장", order: 6 },
  { name: "임규관", category: "BUSINESS", currentPosition: "숭실대 겸임교수", formerPosition: "한국IBM총괄실장, SK텔레콤 솔루션 사업본부장", order: 7 },

  // ── 특강 (LECTURE) ──
  { name: "진성희", category: "LECTURE", currentPosition: "정림건축 전략기획실 소장, 한국코치협회(KPC) 프로코치", formerPosition: "KBS 아나운서", order: 1 },
  { name: "이평래", category: "LECTURE", currentPosition: null, formerPosition: "한국외국어대학교 중앙아시아연구소 초빙연구원, 한국외국어대학교 중앙아시아연구소 교수", order: 2 },
  { name: "오연정", category: "LECTURE", currentPosition: null, formerPosition: "동시통역 번역 프리랜서", order: 3 },
  { name: "김성연", category: "LECTURE", currentPosition: "AWS 분석 스페셜리스트 솔루션즈 아키텍트", formerPosition: null, order: 4 },
  { name: "박성규", category: "LECTURE", currentPosition: "정림건축 인재개발팀장", formerPosition: "리얼워크 리더십 및 코칭연구소장", order: 5 },
  { name: "양혜연", category: "LECTURE", currentPosition: "제주대학교 외래교수", formerPosition: null, order: 6 },
];

/** 이름·내용·URL·인자 원문을 출력하지 않고 선언 건수와 고정 계획 또는 오류만 제공합니다. */
function run(args) {
  if (args.length === 0) {
    console.log(`교수진 데이터 계획: 선언 항목 ${facultyData.length}개. 실제 DB 건수는 조회하지 않았으며 직접 적용은 비활성입니다. 접속·변경하지 않습니다. [FACULTY_SEED_PLAN]`);
    return 0;
  }
  if (args.length === 1 && args[0] === "--confirm-apply") {
    console.error("적용 의도만으로 대상·복구·승인을 확인할 수 없어 직접 적용을 차단합니다. [FACULTY_SEED_TARGET_UNTRUSTED]");
    return 1;
  }
  console.error("지원하지 않는 인자입니다. 인자 없이 변경 계획을 확인하세요. [FACULTY_SEED_ARGUMENTS]");
  return 1;
}

// 프로젝트 기준인 Node 24의 직접 실행 표식으로 모듈 import 시 출력·종료 부작용을 막습니다.
if (import.meta.main) process.exitCode = run(process.argv.slice(2));
