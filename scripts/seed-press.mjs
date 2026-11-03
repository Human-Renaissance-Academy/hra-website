/**
 * 과거 언론보도 선언 데이터를 보존하고 변경 계획만 안내하는 차단형 CLI입니다.
 * 신뢰된 대상·복구·승인 경계가 마련되기 전에는 DB·자격정보·파일·외부 링크를 읽거나 연결하지 않습니다.
 * 기존 URL별 조회·건너뛰기·순차 INSERT 적용은 비활성이며 기존 행의 수정·정렬 변경을 수행하지 않습니다.
 * 선언에 포함된 외부 기사 URL·제목·출처는 출력하지 않으며 링크의 유효성이나 게시 상태를 확인하지 않습니다.
 * 선언 건수는 실제 DB 건수가 아니며 선언의 보존이 현재 운영 내용이나 적용 승인을 증명하지는 않습니다.
 */

// 원본 배열 literal을 그대로 보존하는 순수 선언이며 화면·서비스의 콘텐츠 기본본으로 연결하지 않습니다.
export const pressData = [
  // === 2026년 기사 ===
  {
    title: "제주대, 청년 취업역량강화 아카데미 'HRA', 20기 참여자 모집",
    source: "교수신문",
    url: "https://www.kyosu.net/news/articleView.html?idxno=203971",
    publishedAt: "2026-04-16",
    description:
      "주관: (사)위즈덤시티, 후원: 제주대학교 진로취업과·대학일자리플러스센터, JDC, 롯데관광개발. 20기 모집 안내 및 HRA 오픈클래스 소개.",
    order: 1,
  },
  {
    title: "제주대 '취업역량강화 아카데미 동계 캠프' 운영",
    source: "뉴스라인제주",
    url: "http://www.newslinejeju.com/news/articleView.html?idxno=167238",
    publishedAt: "2026-02-18",
    description:
      "국립대학육성사업 지원으로 단기형·장기형(HRA 동계캠프) 교육과정 운영. 김일환 총장 'AI 시대, 대학 교육' 특강 진행.",
    order: 2,
  },
  {
    title: "제주대 '취업역량강화 아카데미 동계 캠프' 참여자 모집",
    source: "베리타스알파",
    url: "https://www.veritas-a.com/news/articleView.html?idxno=596971",
    publishedAt: "2026-02-04",
    description:
      "국립대학육성사업 일환. 장기 합숙형 교육 과정에 HRA 교수진 참여, 도내 대학생 및 지역 청년 대상 모집.",
    order: 3,
  },
  // === 2025년 기사 ===
  {
    title: "제주대 'HRA 18기 수료식 및 19기 입학식' 개최",
    source: "지금제주",
    url: "https://www.jigeumjeju.com/news/articleView.html?idxno=96046",
    publishedAt: "2025-09-29",
    description:
      "18기 학생 14명 수료 및 19기 입학식. 감사패 수여(KSS해운 박종규 명예회장, 롯데관광개발 김기병 회장). 2007년 시작 이래 19년간 운영.",
    order: 4,
  },
  {
    title: "제주대 'HRA 18기 수료식 및 19기 입학식' 개최",
    source: "베리타스알파",
    url: "https://www.veritas-a.com/news/articleView.html?idxno=575158",
    publishedAt: "2025-09-29",
    description:
      "18기 수료 및 19기 입학. 100권 고전 독서 토론, 경영 트렌드 학습, 현직자 멘토링, 기업 실무 프로젝트 등 역량 강화 커리큘럼 소개.",
    order: 5,
  },
  // === 2023년 기사 ===
  {
    title: "해외에서 선진 견문 넓히고 취업 역량 높인다",
    source: "제주일보",
    url: "https://www.jejunews.com/news/articleView.html?idxno=2207601",
    publishedAt: "2023-12-21",
    description:
      "JDC·제주대·위즈덤시티 HRA 16기 수료·17기 입학식 소개. 고전명작 읽기, 기업 실무 과정, 봉사활동, 인턴, 특강 등 6대 프로그램 운영.",
    order: 6,
  },
  // === 2022년 기사 ===
  {
    title: "제주대학교, JDC·(사)위즈덤시티와 HRA사업 공동추진 업무협약",
    source: "한국강사신문",
    url: "https://www.lecturernews.com/news/articleView.html?idxno=110899",
    publishedAt: "2022-11-03",
    description:
      "제주대·JDC·위즈덤시티 3자 업무협약. 강의·프로그램 운영, 사업비 관리, 시설 제공 등 HRA 사업 공동추진.",
    order: 7,
  },
  {
    title: "제주대-JDC-(사)위즈덤시티, HRA사업 공동추진 업무협약",
    source: "헤드라인제주",
    url: "https://www.headlinejeju.co.kr/news/articleView.html?idxno=499753",
    publishedAt: "2022-11-02",
    description:
      "도내 대학생 및 졸업생 대상 1년간 체계적 교육훈련. 업무능력·성품·사명감 3박자 갖춘 인재 양성 목표.",
    order: 8,
  },
  // === 2021년 기사 ===
  {
    title: "청년들의 길 안내서, HRA를 만나다",
    source: "제주대신문",
    url: "https://news.jejunu.ac.kr/news/articleView.html?idxno=15181",
    publishedAt: "2021-05-26",
    description: "HRA 15기 활동 소개 기사. 청년들의 성장과 도전 이야기를 담고 있습니다.",
    order: 9,
  },
  // === 2020년 기사 ===
  {
    title: "롯데관광개발-위즈덤시티, 지역 인재 육성 협력 협약식",
    source: "연합뉴스",
    url: "https://www.yna.co.kr/view/AKR20200512145400056",
    publishedAt: "2020-05-12",
    description:
      "롯데관광개발, HRA 대학생 대상 인턴십·진로 상담 후원 협약. 2007년 개소 이후 수료생 330명 배출.",
    order: 10,
  },
  // === 2017년 기사 ===
  {
    title: "제주대학교, '2017 청년드림 베스트 프랙티스 대학' 선정",
    source: "국민일보",
    url: "https://www.kmib.co.kr/article/view.asp?arcid=0011982704",
    publishedAt: "2017-12-14",
    description:
      "청년취업 역량강화 아카데미(HRA, Human Renaissance Academy)와 3C형 인재양성 프로그램 소개. 대학일자리센터와 (사)위즈덤시티 공동 운영.",
    order: 11,
  },
  // === 제주의소리 HRA 10주년 3부작 (2017) ===
  {
    title: '"지방대는 정보가 부족하다. 그래서 HRA를 만들었다"',
    source: "제주의소리",
    url: "https://www.jejusori.net/news/articleView.html?idxno=195784",
    publishedAt: "2017-10-04",
    description:
      "[HRA 10주년 3부] 김수종 전 한국일보 주필 인터뷰. 제주 지역 청년들의 정보 부족 해소를 위해 HRA를 만든 배경과 향후 '학생 자치' 프로그램 비전.",
    order: 12,
  },
  {
    title: "HRA를 이끈 숨은 힘? 재능기부자들의 헌신 있었다",
    source: "제주의소리",
    url: "https://www.jejusori.net/news/articleView.html?idxno=195592",
    publishedAt: "2017-10-02",
    description:
      "[HRA 10주년 2부] 후원자·재능기부자들의 10년간 헌신 조명. 전직 언론인·기업인·교수진 등 각계 시니어들의 재능기부와 노블레스 오블리주 정신.",
    order: 13,
  },
  {
    title: "10년 걸어온 HRA, 제주 청년인재 사관학교 역할 '톡톡'",
    source: "제주의소리",
    url: "https://www.jejusori.net/news/articleView.html?idxno=195521",
    publishedAt: "2017-09-30",
    description:
      "[HRA 10주년 1부] HRA 10년 발자취 조명. 1~7기 취업률 70%, 공무원·금융권·관광·언론 등 다양한 분야에서 활약하는 HRA 출신 인재들.",
    order: 14,
  },
  {
    title: "같이 손잡고 나아가는 HRA 값진 경험으로 제주의 리더 되길",
    source: "제주대신문",
    url: "https://news.jejunu.ac.kr/news/articleView.html?idxno=12384",
    publishedAt: "2017-09-27",
    description:
      "HRA 10기 수료식·11기 입학식 현장. 블랙야크 강태선 회장 장학금 전달, 허향진 총장 축사. 수료생 공연과 추억 영상 시청.",
    order: 15,
  },
  // === 뉴스1 HRA 10년사 시리즈 (2017) ===
  {
    title: "'텐트 스쿨'로 시작해 10년…그 뒤엔 후원자가 있었다",
    source: "뉴스1",
    url: "https://www.news1.kr/local/jeju/3110966",
    publishedAt: "2017-09-26",
    description:
      "[HRA 10년사 下] 제주도·제주대·후원회의 기부와 지원. 4차 산업혁명 시대 혁신적 교육모델로서 HRA 커리큘럼과 운영방식 소개.",
    order: 16,
  },
  {
    title: '"휴먼 르네상스 아카데미는 인생학교…배움에 감사"',
    source: "뉴스1",
    url: "https://www.news1.kr/local/jeju/3109679",
    publishedAt: "2017-09-24",
    description:
      "HRA 10기 수료·11기 입학식. 시니어 재능기부·후원으로 1년간 대학생 인재양성교육 진행.",
    order: 17,
  },
  // === 2016년 기사 ===
  {
    title: '"대학생끼리 인적네트워크 형성해야"',
    source: "제주대신문",
    url: "https://news.jejunu.ac.kr/news/articleView.html?idxno=11865",
    publishedAt: "2016-11-30",
    description:
      "김수종 전 한국일보 주필 인터뷰. HRA 10년, 100여 명의 교수·멘토·운영진 재능기부로 운영. 학생들의 인적네트워크 형성 강조.",
    order: 18,
  },
  {
    title: "취업, 한번에 쓱? 제주대 취업 특강 개설",
    source: "제주의소리",
    url: "https://www.jejusori.net/news/articleView.html?idxno=176885",
    publishedAt: "2016-04-20",
    description:
      "사단법인 위즈덤시티가 제주대학교와 대학생 취업 역량 향상을 위한 프로그램 개설·운영 소개.",
    order: 19,
  },
  // === 2013년 기사 ===
  {
    title: '"사회발전에 필요한 젊은 리더 육성"',
    source: "제민일보",
    url: "https://www.jemin.com/news/articleView.html?idxno=312616",
    publishedAt: "2013-06-30",
    description:
      "HRA 설립 배경과 운영 소개. 김수종 전 주필이 도내 인재 유출 문제 해결 위해 설립. 1~5기 120명 교육 이수, 6기 39명 수료 예정.",
    order: 20,
  },
  // === 2026년 추가 (뉴스N제주) ===
  {
    title: "제주대 '취업역량강화 아카데미 동계 캠프' 참여자 모집",
    source: "뉴스N제주",
    url: "https://www.newsnjeju.com/news/articleView.html?idxno=258300",
    publishedAt: "2026-02-04",
    description:
      "국립대학육성사업 일환. 단기 집중형·장기 합숙형(HRA 교수진 참여) 과정 구성. 도내 대학생 및 지역 청년 대상.",
    order: 21,
  },
  // === 제주대학교 공식 공지(jejunu.ac.kr/promotion/jnunotice) 추가 발굴 5건 ===
  // 2025년 학생 성과
  {
    title: "제주대학교 HRA 참여학생, '2025 스마트해운물류 공모전' 금상 수상",
    source: "제주대학교",
    url: "https://www.jejunu.ac.kr/promotion/jnunotice/notice.htm?act=view&seq=264882",
    publishedAt: "2025-11-07",
    description:
      "제주대 진로취업과·대학일자리플러스센터 운영 HRA 참여 학생들이 2025 스마트해운물류 공모전에서 금상을 수상. 실무형 진로교육 성과 입증, 대학·기관 협력을 통한 청년 인재 성장 사례.",
    order: 22,
  },
  // 2022년 협약 (제주대 공식 보도판)
  {
    title: "JDC-(사)위즈덤시티와 HRA사업 공동추진 업무협약",
    source: "제주대학교",
    url: "https://www.jejunu.ac.kr/promotion/jnunotice/notice.htm?act=view&seq=103653",
    publishedAt: "2022-11-02",
    description:
      "제주대(총장 김일환)·JDC·(사)위즈덤시티가 HRA 사업 공동추진 업무협약 체결. 도내 대학생·졸업생 대상 1년간 체계적 교육훈련, 강의 운영·사업비 관리·시설물 제공 등 사업 전반 공동 추진.",
    order: 23,
  },
  // 2021년 15기 운영
  {
    title: "취업역량강화 아카데미(HRA 15기) 정규수업 운영",
    source: "제주대학교",
    url: "https://www.jejunu.ac.kr/promotion/jnunotice/notice.htm?act=view&seq=101540",
    publishedAt: "2021-12-06",
    description:
      "HRA 15기 12월 정규수업 진행. 매주 토요일 고전읽기·영어세션·경영서·기업실무 교육 운영. 전·현직 중견 언론인 교수진의 고전명작 콘텐츠 강의와 CEO/임원 초빙 특강.",
    order: 24,
  },
  // 2019년 기고
  {
    title: "(기고) 'HRA라는 퍼즐판'",
    source: "제주대학교",
    url: "https://www.jejunu.ac.kr/promotion/jnunotice/notice.htm?act=view&seq=100987",
    publishedAt: "2019-11-28",
    description:
      "HRA 13년차를 맞아 참여 학생이 쓴 기고문. 청년들에게 고전 읽기, 경영서 분석, 케이스스터디, 봉사활동 등 실력양성과 인격함양의 양 축을 쌓아주는 프로그램 경험담.",
    order: 25,
  },
  // 2017년 10기 겨울캠프
  {
    title: "'HRA 10기' 겨울캠프 개최",
    source: "제주대학교",
    url: "https://www.jejunu.ac.kr/promotion/jnunotice/notice.htm?act=view&seq=97946",
    publishedAt: "2017-02-08",
    description:
      "(사)위즈덤시티 공동주관 2017 HRA 10기 겨울캠프(7박8일) 베니키아호텔제주에서 개최. 제주대 학생 31명 참여, 고전읽기·기업실무 케이스스터디·한국 경제사 토론·명사 특강. 2007년 시작 이래 10년간 248명 수료, 80% 이상 취업.",
    order: 26,
  },
];

/** 이름·내용·URL·인자 원문을 출력하지 않고 선언 건수와 고정 계획 또는 오류만 제공합니다. */
function run(args) {
  if (args.length === 0) {
    console.log(`언론보도 데이터 계획: 선언 항목 ${pressData.length}개. 실제 DB 건수는 조회하지 않았으며 직접 적용은 비활성입니다. 접속·변경하지 않습니다. [PRESS_SEED_PLAN]`);
    return 0;
  }
  if (args.length === 1 && args[0] === "--confirm-apply") {
    console.error("적용 의도만으로 대상·복구·승인을 확인할 수 없어 직접 적용을 차단합니다. [PRESS_SEED_TARGET_UNTRUSTED]");
    return 1;
  }
  console.error("지원하지 않는 인자입니다. 인자 없이 변경 계획을 확인하세요. [PRESS_SEED_ARGUMENTS]");
  return 1;
}

// 프로젝트 기준인 Node 24의 직접 실행 표식으로 모듈 import 시 출력·종료 부작용을 막습니다.
if (import.meta.main) process.exitCode = run(process.argv.slice(2));
