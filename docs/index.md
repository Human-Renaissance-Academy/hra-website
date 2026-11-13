# HRA 개발 문서

이 문서는 HRA 웹사이트를 **실행하고, 수정하고, 확인한 뒤 반영하는 방법**을 안내합니다. 개발을 전공하지 않았더라도 필요한 일을 순서대로 찾을 수 있도록 구성했습니다.

[웹사이트](https://hra-website-theta.vercel.app) · [코드 저장소](https://github.com/Human-Renaissance-Academy/hra-website) · [전체 문서 지도](documentation-map.md) · [작업 우선순위](https://github.com/Human-Renaissance-Academy/hra-website/issues/300)

## 처음 참여한다면

1. [사전 준비](getting-started/prerequisites.md)에서 Node.js·Git·편집기를 설치하고 버전을 확인합니다.
2. [코드와 설정 준비](getting-started/clone-and-setup.md)에서 저장소와 개발용 환경을 준비합니다.
3. [첫 실행](getting-started/first-run.md)에서 서버를 켜고 정상 화면과 로그인 결과를 확인합니다.
4. [화면부터 DB까지 따라가기](getting-started/project-tour.md)로 코드가 연결되는 순서를 봅니다.
5. [협업 절차](contributing/workflow.md)에 따라 작은 이슈와 작업 브랜치를 만들고 검토를 요청합니다.

모르는 용어는 [용어집](getting-started/glossary.md)에서 확인하세요. 설치 시간과 접근 권한은 개인 환경에 따라 달라지므로 특정 시간 안에 끝내는 것을 성공 기준으로 삼지 않습니다.

## 하려는 일로 찾기

| 하려는 일 | 읽을 문서 |
| --- | --- |
| 문구·색상·페이지를 바꾸기 | [사이트 수정](CUSTOMIZATION.md), [폴더별 역할](GUIDE.md) |
| 기능을 추가하고 PR을 만들기 | [협업 절차](contributing/workflow.md), [코드 규칙](contributing/conventions.md), [작업 난이도](contributing/tasks-by-level.md) |
| 오류를 확인하고 배포 준비하기 | [품질 확인](QUALITY-GATE.md), [빌드·배포](contributing/build-and-deploy-safety.md), [릴리스](contributing/releasing.md) |
| 관리자 화면을 사용하기 | [관리자 안내](ADMIN-GUIDE.md), [모집 접수 정책](recruitment-intake-policy.md) |
| DB나 파일 저장을 바꾸기 | [DB 안내](DATABASE.md), [DB 변경 절차](developer/database-change-procedure.md), [자료 파일 정책](resource-file-access-policy.md) |
| 로그인·배포 환경을 설정하기 | [환경 분리](developer/environment-strategy.md), [배포](DEPLOYMENT.md), [카카오 설정](KAKAO-LOGIN-SETUP.md) |
| 학사 기능을 개발하기 | [학사 로드맵](ACADEMIC-MANAGEMENT-ROADMAP.md), [과제 제출 범위](ASSIGNMENT-SUBMISSION-SCOPE.md), [학사 상세 문서 목록](documentation-map.md) |
| 앞으로의 모바일 구조를 이해하기 | [목표 아키텍처](developer/platform-architecture.md), [Web → Android → iOS 계획](PLATFORM-ROADMAP.md) |
| AI 도구와 함께 작업하기 | [AI 도구 사용 안내](contributing/ai-tools.md) |

## 현재 상태를 읽는 방법

| 표시 | 의미 | 다음에 확인할 것 |
| --- | --- | --- |
| 현재 구현 | 코드와 테스트가 저장소에 있음 | 실제 환경의 설정·DB 준비·권한 |
| 운영 확인 필요 | 기능 공개나 실제 데이터 처리 전 확인이 남음 | 담당자와 운영 검증 기록 |
| 목표·설계 | 앞으로 구현할 구조나 기능 | 해당 이슈의 승인된 범위 |
| 정책 미정 | 업무 규칙이 결정되지 않음 | 담당 정책 이슈의 결정 |
| 특정 날짜의 검증 기록 | 당시 버전과 환경에서 확인한 결과 | 현재 변경에 필요한 재검증 |

학사 G1의 학생 명부·개인 과제·비공개 파일·화면은 코드에 있습니다. 출결·교수 피드백·수료 등 G2/G3와 Android/iOS 앱은 후속 계획입니다. **기능 코드의 존재, 기능 설정의 활성화, 실제 운영 검증을 구분해서 읽어 주세요.**

## 필요한 문서만 먼저 읽기

홈페이지 콘텐츠를 수정하는 작업에 학사 DB 설계 전체가 필요한 것은 아닙니다. 반대로 개인 제출 파일이나 계정 연결을 바꾸는 작업에는 화면 안내만으로 충분하지 않습니다. 해당 기능의 정책 → 구현 계약 → 검증·운영 절차 순서로 확인합니다.

문서의 내용이 코드와 다르면 임의로 운영 데이터를 바꾸지 말고, 서로 다른 파일·명령·관찰 결과를 이슈에 적습니다. 문서 변경도 [협업 절차](contributing/workflow.md)의 리뷰를 거칩니다.

