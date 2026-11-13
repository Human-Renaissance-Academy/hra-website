# HRA 데이터베이스 이해와 안전한 작업

데이터베이스(DB)는 회원·공지·지원서처럼 서로 연결된 정보를 저장하는 곳입니다. 표 모양은 스프레드시트와 비슷하지만, **여러 사람이 동시에 수정할 때의 규칙과 데이터 간 연결을 DB가 함께 지킵니다.**

이 문서는 구조를 이해하고 필요한 작업을 선택하기 위한 입문 안내입니다. 실제 구조 변경은 [DB 변경 절차](developer/database-change-procedure.md)를 따릅니다. 문서 확인일은 2026-10-18이며 운영 DB의 적용 상태를 확인했다는 의미는 아닙니다.

## 1. 먼저 익힐 용어

| 용어 | 의미 | 예 |
| --- | --- | --- |
| 테이블 | 같은 종류의 데이터를 모은 표 | `users`: 회원 표 |
| 행 | 데이터 한 건 | 회원 한 명 |
| 컬럼 | 한 항목 | `email`, `role` |
| 기본 키(ID) | 한 건을 구분하는 식별자 | 이름이 같아도 다른 회원을 구분 |
| 외래 키(FK) | 다른 표의 데이터와 연결하는 규칙 | 지원 답변이 어느 질문에 속하는지 |
| 제약 | 저장할 수 있는 값에 대한 규칙 | 같은 대상의 중복 저장 방지 |
| 트랜잭션 | 여러 변경을 하나의 작업으로 확정하는 단위 | 답변 저장 실패 시 제출 정보도 취소 |
| 마이그레이션 | DB 구조·함수를 변경하는 절차 | 새 컬럼이나 저장 함수 추가 |

더 많은 용어는 [용어집](getting-started/glossary.md)에 있습니다.

## 2. 실제 데이터는 어디에 있나요?

앱은 `src/lib/db/index.ts`에서 Neon HTTP 드라이버로 PostgreSQL에 연결합니다. 접속할 DB는 `DATABASE_URL`로 선택합니다. 로컬 앱, Preview, Production의 대상은 [환경 전략](developer/environment-strategy.md)에 따라 분리합니다.

Neon 관리 화면이나 SQL 도구에서 데이터를 볼 때도 **프로젝트뿐 아니라 DB·브랜치가 맞는지** 확인합니다. 같은 화면에서 개발 DB와 운영 DB를 전환할 수 있기 때문입니다. 앱이 켜진다는 사실만으로 올바른 환경에 연결됐다고 판단하지 않습니다.

일반 로컬 PostgreSQL은 격리 테스트에서 사용합니다. 현재 앱에 로컬 PostgreSQL 연결 문자열만 넣으면 Neon HTTP 방식과 자동 호환되는 것은 아닙니다.

## 3. 어떤 표를 찾아야 하나요?

코드의 변수명과 실제 DB 테이블명은 다를 수 있습니다. 정본은 `src/lib/db/schema.ts`입니다.

| 데이터 | 코드에서 부르는 이름 | 실제 DB 테이블 |
| --- | --- | --- |
| 회원 | `users` | `users` |
| 기수 | `cohorts` | `cohorts` |
| 교수진 | `faculty` | `faculty` |
| 공지 | `notices` | `notices` |
| 갤러리·사진 연결 | `galleries`, `galleryImages` | `galleries`, `gallery_images` |
| 강의자료 | `classMaterials` | `class_materials` |
| 주차별 텍스트 | `weeklyTexts` | `weekly_texts` |
| 수업일지 | `classLogs` | `class_logs` |
| 가이드북·보고서 양식 | `guidebooks`, `reportTemplates` | `guidebooks`, `report_templates` |
| 내부 지원서 양식·질문 | `applicationForms`, `applicationQuestions` | `application_forms`, `application_questions` |
| 내부 지원서 제출·답변 | `applicationSubmissions`, `applicationAnswers` | `application_submissions`, `application_answers` |
| 이전 지원 시스템 | `legacyApplications` | `applications` |

공지사항 본문은 DB에 저장합니다. 현재 공지 운영을 `content/notices/`의 GitHub CMS로 설명하는 것은 맞지 않습니다. 자료실도 `resources`라는 단일 테이블이 아니라 위 기능별 테이블로 나뉩니다. `legacyApplications`는 **코드 변수명**이며 DB가 `legacy_applications`로 이름 변경됐다는 뜻은 아닙니다.

이미지·문서 파일의 실제 내용은 Blob에, 제목·작성자·파일 연결 정보는 DB에 저장합니다. DB 백업만으로 Blob 파일까지 복구되는 것은 아닙니다. 파일 정책은 [자료실 파일 접근 정책](resource-file-access-policy.md)을 확인합니다.

## 4. 회원 역할과 학사 권한

| 역할 | 의미 | 기본 범위 |
| --- | --- | --- |
| `PENDING` | 가입 후 승인 대기 | 자료실 이용 불가 |
| `MEMBER` | 승인 회원 | 공동 자료 열람, 배정된 본인 기수의 텍스트·일지 작성 |
| `FACULTY` | 교수 계정 | 공동 자료 및 교수용 강의자료 이용 |
| `ADMIN` | 홈페이지 관리자 | 홈페이지 콘텐츠·회원 관리 |

홈페이지 ADMIN과 학사 운영 책임자는 별개입니다. ADMIN 또는 FACULTY 역할만으로 출결 담당자가 되지 않습니다. 현재 학사 책임자 지정과 앞으로 구현할 어드바이저·조교 업무는 [학사 로드맵](ACADEMIC-MANAGEMENT-ROADMAP.md)을 따릅니다.

비밀번호는 복호화해 읽을 수 있는 암호문으로 보관하지 않고, 비밀번호 확인용 **해시**로 저장합니다. 소셜 로그인 계정은 비밀번호 해시가 없을 수 있습니다. 역할·기수가 변경되면 세션 갱신 규칙이 적용되므로 대상 사용자는 다시 로그인해야 할 수 있습니다.

## 5. 최초 관리자 준비

일상적인 회원 승인은 [관리자 화면](ADMIN-GUIDE.md)에서 처리합니다. `seed-admin`은 최초 계정 준비나 확인된 승격을 위한 운영 도구입니다.

### 준비

- 새 계정을 만들 DB가 맞고 회원 테이블·세션 관련 컬럼이 준비됐는지 확인합니다.
- 비공개 `.env` 또는 승인된 비밀 관리 수단으로 `DATABASE_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`를 준비합니다. 필요하면 `ADMIN_NAME`도 설정합니다.
- 실제 비밀번호를 명령문·Git·공유 로그에 넣지 않습니다. 스크립트가 이메일·이름을 출력하므로 실행 기록도 공유 전에 확인합니다.

### 새 관리자 생성

```bash
npm run seed-admin -- --confirm-create
```

**정상 결과:** 새 ADMIN 계정이 생기고 준비한 비밀번호로 로그인할 수 있습니다. 기존 이메일이 있으면 계정 상태에 따라 중단하거나 이미 존재함을 알립니다. 결과가 불명확하면 새 계정이 만들어졌는지 확인한 뒤 재시도를 결정합니다.

### 기존 계정 승격

기존 계정의 승격에는 `--confirm-promote=대상이메일` 확인 인자가 필요합니다. 다음은 합성 주소를 사용한 형식 예입니다. 실제 실행에서는 `ADMIN_EMAIL`과 확인한 대상이 일치해야 합니다.

```bash
npm run seed-admin -- --confirm-promote=operator@example.invalid
```

승격 시 역할·비밀번호 해시·세션 버전이 함께 변경됩니다. 기존 ADMIN 계정에 대해서는 이 스크립트가 비밀번호를 바꾸지 않습니다. **비밀번호 재설정 도구로 반복 실행하지 말고** 담당자의 계정 복구 절차를 따릅니다.

## 6. 회원 변경·삭제는 관리자 화면에서

`/admin/users`의 그룹 선택은 단순한 표시 이름 변경이 아닙니다. ADMIN/FACULTY/PENDING 선택과 기수 선택을 구분하며, 기수를 선택하면 MEMBER와 해당 기수가 함께 저장됩니다.

현재 액션은 본인 변경·삭제와 마지막 관리자 소실을 막고, 학적 연결이나 학사 운영 이력이 있는 계정의 삭제를 거부합니다. SQL로 관련 글이나 학적을 먼저 지워 거부 사유를 없애는 것은 이 절차가 아닙니다. 보존해야 할 이력과 계정 정리를 담당자가 함께 판단합니다.

**정상 결과:** 관리 화면에 변경 결과가 표시됩니다. **거부되면:** 안내 메시지를 확인하고, 참조된 데이터나 다른 관리자 존재 여부를 점검합니다. 반복 DELETE나 제약 제거로 해결하지 않습니다.

## 7. DB를 읽어 확인하는 작은 예

다음 예는 선택한 DB의 건수를 읽습니다. 개인정보 전체 목록을 공유할 필요 없이 구조와 기본 데이터 유무를 확인할 때 사용할 수 있습니다.

```sql
SELECT role, COUNT(*) FROM users GROUP BY role;
SELECT status, COUNT(*) FROM notices GROUP BY status;
SELECT COUNT(*) FROM application_forms;
SELECT COUNT(*) FROM application_submissions;
```

`SELECT`는 조회, `UPDATE`는 변경, `DELETE`는 삭제입니다. 운영 조회도 권한과 목적에 맞는 범위만 사용합니다. 개인 정보가 포함된 결과는 공개 이슈에 붙이지 않습니다.

| 결과·오류 | 의미와 다음 행동 |
| --- | --- |
| 0건 | 아직 데이터가 없거나 조건·환경이 다른 경우. 무조건 오타로 단정하지 않음 |
| 테이블 없음 | 대상 DB와 적용 상태 확인 |
| 외래 키 오류 | 다른 데이터와 연결되어 작업이 제한됨. 관련 보존 정책 확인 |
| 역할 변경 후 접근 문제 | 변경 결과와 새 로그인 세션 확인 |

## 8. 컬럼·테이블을 바꾸려면

`schema.ts` 수정, DB 적용, 앱 배포는 서로 다른 작업입니다. [DB 변경 절차](developer/database-change-procedure.md)에서 빈 개발 DB와 기존 DB를 구분해 진행합니다. 타입 정의만 수정하거나 앱만 배포했다고 운영 DB가 갱신되지는 않습니다.

현재 범위별 스크립트가 있으며, 자동 적용 이력과 Production migration gate는 [#280](https://github.com/Human-Renaissance-Academy/hra-website/issues/280)의 후속 작업입니다. 문서의 적용 절차와 이미 자동화된 보호 장치를 구분합니다.

## 코드 근거

`src/lib/db/schema.ts`, `src/lib/db/index.ts`, `src/features/users/actions/index.ts`, `src/lib/auth-session.ts`, `scripts/seed-admin.mjs`, `package.json`.
