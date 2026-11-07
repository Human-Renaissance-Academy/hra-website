# HRA 학사 데이터 모델 — G1 구현과 G2/G3 설계

> 상태: **G1 엔터티·제약·서버/화면 코드 구현 및 격리 검증 / 운영 미활성** · 기준: 2026-10-16, #144~#158 구현·격리 검증. G2/G3는 후속 설계다.
> #140·#141의 운영 규칙은 확정됐지만, #142의 보존·파기·백업 정책은 미정이다. 학사 공개·쓰기·업로드·정리의 설정 기본값은 비활성이다. 실제 운영 설정은 별도 확인 사항이며, 코드 구현은 운영 DB 적용·기능 공개를 의미하지 않는다.

## 데이터를 읽는 순서

개발·DB 변경 담당자를 위한 문서다. **계정 → 학생 → 기수별 학적 → 과제 대상 → 최종 제출 → 파일**을 서로 다른 기록으로 이해하면 뒤의 표를 읽기 쉽다. 예를 들어 한 학생이 두 기수에 참여하면 학생 기록은 같고 학적 기록은 두 개다. 로그인 역할을 바꿨다고 과거 학적을 지우지 않는다.

과제를 공개할 때 대상 명단을 고정하므로, 제출 기록이 없는 사람도 “미제출”로 집계할 수 있다. PK·FK·UNIQUE·트랜잭션·멱등성은 [용어집](getting-started/glossary.md), 사용자 동작은 [과제 제출 범위](ASSIGNMENT-SUBMISSION-SCOPE.md)를 먼저 참고해도 된다.

아래는 구조의 요약이며 SQL 전체를 대신하지 않는다. 실제 변경은 테이블 모델과 별도 migration의 함수·지연 제약을 함께 확인한다.

## 1. 기존 엔터티 재사용과 금지사항

- 기존 `users`는 로그인 계정 및 시스템 역할의 정본이다. `users.role`을 재학·수료·탈퇴로 확장하지 않는다.
- `cohorts`는 교육 기수의 정본이다. `users.cohortId`는 현재 회원 UI 호환을 위한 기존 필드로만 다루고, 학적 이력의 정본으로 사용하지 않는다.
- 기존 `schedule_events`와 `schedule_sessions`는 수업일·시간 구성·교수·카테고리의 정본이다. G1에서 복제된 수업 테이블을 만들지 않는다.
- **HRA 실제 운영 구분:** 교수는 수업을 담당하지만 **출결을 담당하지 않는다**. 수업에는 **어드바이저(Advisor)**라는 별도 수업 운영 담당자가 존재한다. 따라서 `schedule_sessions.facultyId`로 출결 담당자를 추론하지 않으며, G2에서 배정된 어드바이저와 출결 변경 주체를 별도로 연결한다.
- `weekly_texts` / `class_logs` / `report_templates`는 공동 학습 자료다. 개인별 과제 실적을 이들 행의 개수로 계산하지 않는다.
- `application_submissions`는 **지원 이력**이지 학적의 정본이 아니다. `status=ACCEPTED`를 곧바로 유효한 학적/로그인 권한으로 해석하지 않는다.

## 2. G1 엔터티 (현재 구조 요약)

아래 A~F에 대응하는 G1 모델·범위 SQL은 #144·#147·#148에서 구현됐다. 표는 이해를 위한 주요 필드 요약이며, 실제 필드·제약·함수의 정본은 `src/lib/db/schema.ts`가 내보내는 `academic-assignments.ts`, `academic-submissions.ts` 등 모델과 범위 migration이다. G2/G3 후보는 §5의 미구현 설계로 구분한다.

적용·복구 절차는 [학생 명부](developer/academic-students-migration.md), [과제·최초 공개 대상](developer/academic-assignments-migration.md), [최종 제출·파일·업로드 의도](developer/academic-submissions-migration.md)를 따른다. 검증 계정 연결·승인, 업로드 승인 원장과 최소 감사도 별도 범위 SQL로 구현됐으며 운영 적용은 #142 정책·백업/복원 증거·승인 절차를 충족한 뒤 진행한다.

### A. `academic_students` — 학적의 학생 식별자

| 필드 | 타입 | 제약·의미 |
| --- | --- | --- |
| `id` | UUID | PK; 학생 식별자는 이메일이 아님 |
| `user_id` | UUID nullable | 기존 `users.id`에 RESTRICT FK; NULL 허용, non-null UNIQUE. 탈퇴 시 연결 해제·파기는 #142 확정 후 승인 절차로 처리 |
| `display_name` | varchar(100) | 최소 표시 이름, 확인된 명부 입력값; 추가 PII 저장 최소화 |
| `created_at`, `updated_at` | timestamptz | 시각 이력 |

계정 없는 합격·초청 명부를 처리해야 하면 `academic_students.user_id=NULL`을 유지할 수 있다. 학적 대상에서 제외할 필요는 없지만 **로그인과 제출 권한은 계정 검증 후에만** 부여한다. 이메일 복제와 자동 계정 연결은 금지한다. `application_submissions`과의 검증된 연결이 필요하면 별도 nullable 출처 FK 또는 전용 매핑을 두고, 원문 지원서 전체를 중복 복사하지 않는다.

### B. `cohort_enrollments` — 학생의 기수별 학적

| 필드 | 타입 | 제약·의미 |
| --- | --- | --- |
| `id` | UUID | PK, 제출/출결이 참조하는 영속 식별자 |
| `student_id` | UUID | `academic_students.id` FK, NOT NULL |
| `cohort_id` | UUID | `cohorts.id` FK, NOT NULL |
| `status` | enum | G1은 `ENROLLED`만 구현. `COMPLETED`, `WITHDRAWN` 등은 정책 확정 후 별도 migration |
| `enrolled_at`, `ended_at` | timestamptz | 등록·종료 이력 |
| `created_by_user_id` | UUID nullable | 행 생성 관리자 식별자 |
| `created_at`, `updated_at` | timestamptz | 감사용 시각 |

- `UNIQUE(student_id, cohort_id)`: 동일 학생·동일 기수 중복 등록 금지. 복학/재참여가 실제 필요할 때만 별도 회차 개념을 검토한다.
- 학적이 존재하는 기수/학생은 `RESTRICT`로 물리 삭제를 거부한다. 연결 계정과 등록 승인 계정도 보존한다. 초기 G1에서는 재학 외 복잡한 상태 전환 UI를 구현하지 않는다. 적용·복구 절차는 [학생 명부 스키마 적용](developer/academic-students-migration.md)을 따른다.
- 다른 기수에 등록한 적 있는 학생의 기존 학적은 남아야 한다. 계정 역할 변경이 학적 기록을 소급 변경하지 않는다.
- **동시 이중 등록**은 서버 사전 SELECT만으로 막지 않고 DB UNIQUE로 보장한다.

### G1 학생 명부·계정 연결 정책 (#140 확정)

- 명부의 정본은 운영진이 신원을 확인해 **수동 승인한** `academic_students`와 `cohort_enrollments`다. 합격 지원서, 승인 회원, `users.cohortId`, 이메일 일치는 등록·연결의 자동 근거가 아니다.
- 최종 관리 승인자는 HRA 운영 책임자(이번 정책을 승인한 사용자 본인)다. 구현에서는 승인자를 검증된 로그인 계정 ID로 지정하고 승인 주체·시각·근거 참조를 감사 기록에 남긴다. `ADMIN` 또는 `FACULTY` 역할만으로 학사 승인 권한을 자동 부여하지 않는다.
- G1 학적의 최소 개인정보는 학생 표시 이름, 학생·기수 식별자, 선택적인 검증된 계정 ID와 승인 이력이다. 연락처·지원서 원문·증빙 사본을 학적에 복제하지 않는다. 명부 정정·계정 연결 변경·연결 해제는 지정된 운영 책임자 승인과 변경 전후 ID·사유의 감사 기록을 요구한다.
- 등록 담당자는 기수와 원본 승인 명단을 대조하고, 동일 학생의 기존 학적을 검색한 뒤 책임자 승인을 받아 학생과 해당 기수 학적을 만든다. 로그인 계정 연결은 학생 본인의 인증된 계정 ID와 명단의 신원을 대면 또는 사전에 확인된 연락 경로로 다시 대조하고 별도로 승인한다. 증빙 원문·연락처 복사본은 학적 테이블에 저장하지 않고 확인 방식과 승인 기록만 남긴다.
- 동명이인이나 동일 이메일 재사용은 자동 병합·연결하지 않는다. 확인이 부족하거나 충돌하면 연결을 거부하고 미연결 상태로 유지한 뒤 책임자가 증빙을 다시 확인한다. 재처리는 기존 학생 ID를 기준으로 하며 새 학생·학적 중복 생성을 먼저 검사한다.
- 계정 없는 등록 학생은 `user_id=NULL`로 명부에 남을 수 있지만 로그인·제출은 할 수 없다. 한 학생이 다른 기수에 다시 등록하면 기존 학생 ID에 새 학적을 추가하고 과거 학적은 보존한다. 같은 기수 재등록은 중복 행을 만들지 않고 책임자 검토 대상으로 둔다. 계정 탈퇴 시 학적·제출물의 파기 또는 연결 해제 방식은 #142가 정할 때까지 자동 연쇄 삭제하지 않는다.

**판정 예시**

| 상황 | 처리 |
| --- | --- |
| 합격자는 확인됐으나 사이트 계정이 없음 | 책임자 승인 후 학생·학적을 만들고 `user_id=NULL` 유지. 계정 인증 전 제출 불가 |
| 승인된 사이트 회원이지만 명부에 없음 | 역할·기수 값만으로 등록하지 않음. 원본 명단 확인 후 별도 승인 |
| 과거 학생이 현재 교수 또는 홈페이지 관리자임 | 기존 학생 ID의 과거 학적 유지. 현재 역할을 학생 자격으로 자동 해석하지 않음 |
| 이름이 같거나 이메일이 재사용된 두 계정 | 자동 연결 거부. 본인 확인 후 올바른 계정 ID 하나만 연결 |

### C. `assignments` — 과제 정의

| 필드 | 타입 | 제약·의미 |
| --- | --- | --- |
| `id` | UUID | PK |
| `cohort_id` | UUID | FK, 과제 대상 기수 (G1은 1개 기수) |
| `schedule_event_id` | UUID nullable | 기존 `schedule_events` FK; 연결 시 같은 기수 검증 |
| `schedule_session_id` | UUID nullable | 기존 `schedule_sessions` FK; 연결 시 이벤트·기수 교차 검증 |
| `title`, `instructions` | varchar/text | 서버 길이 제한. 안내문은 일반 텍스트로 표시 |
| `due_at` | timestamptz nullable | 초안에서는 NULL 가능, 공개 시 미래 시각 필수. KST 입력 → UTC instant 저장 |
| `status` | enum | `DRAFT`/`PUBLISHED`/`CLOSED` 구현. 공개 후 과제 정의는 불변이며 종료만 허용 |
| `created_by_user_id` | UUID | 작성 관리자 |
| `published_at`, `created_at`, `updated_at` | timestamptz | 공개/감사 |

- 비공개 과제의 UUID를 알아도 MEMBER가 조회·제출하지 못해야 한다.
- 현재 G1은 제출 유무와 관계없이 공개 후 과제 정의 수정·삭제와 대상 변경을 거부한다. 초안 수정·공개·종료 및 요청 재시도는 [과제 서버 액션](developer/academic-assignment-actions.md)의 원자 변경·최소 감사 계약을 사용한다.
- 기존 수업과 연결되는 과제는 참조 무결성에 더해 **수업과 과제 기수가 같아야 함**을 트랜잭션/서버에서 검증한다.

### D. `assignment_targets` — 최초 공개 당시 과제 대상자 (G1 구현)

| 필드 | 타입 | 제약·의미 |
| --- | --- | --- |
| `id` | UUID | PK |
| `assignment_id` | UUID | FK; 과제 |
| `enrollment_id` | UUID | FK; 과제 대상 학적 |
| `assigned_at` | timestamptz | 대상 확정 시각 |
| `assigned_by_user_id` | UUID | NOT NULL, 대상 확정 승인 계정 FK |

- `UNIQUE(assignment_id, enrollment_id)`로 이중 대상 생성 금지.
- 최초 공개 시 유효한 해당 기수 학적 전체를 대상 스냅샷으로 확정한다. 재공개·재시도는 동일한 대상을 유지한다.
- 공개 후 새로 등록한 학생은 과거 과제 대상에 자동 추가하지 않고, 중도 탈퇴자의 대상 행도 소급 삭제하지 않는다. G1에서 발행 후 수동 대상 변경은 허용하지 않는다. 대상 변경 정책이 필요해지면 감사·분모 처리 규칙을 별도 결정한다.
- 보장할 지표: 대상 N, 제출 S, 미제출 N-S. `assignment_submissions`만으로 대상을 계산하지 않는다.

### E. `assignment_submissions` — 과제 제출 사실

| 필드 | 타입 | 제약·의미 |
| --- | --- | --- |
| `id` | UUID | PK |
| `assignment_target_id` | UUID | FK; 제출자와 과제를 하나의 확정 대상으로 식별 |
| `submitted_by_user_id` | UUID | 실제 제출 계정; 해당 target의 학생과 동일인 검증 |
| `upload_intent_id` | UUID | 검증한 업로드 의도와 연결, UNIQUE |
| `submission_key` | UUID | 요청 재시도 멱등성 키, UNIQUE |
| `submitted_at` | timestamptz | **최종 제출 확정** 시각 |

- G1은 한 대상당 최종 제출 1개이므로 `UNIQUE(assignment_target_id)`를 적용한다. 최종화 이후 교체·재제출은 허용하지 않는다. 같은 `submission_key` 재시도만 기존 완료 결과를 돌려준다.
- DB에 최종 제출 행이 생기기 전 업로드만 성공한 상태를 `SUBMITTED`로 표시하지 않는다.
- 임시 업로드와 최종 제출을 별도 테이블로 관리한다. 파일 처리 중의 상태는 업로드 의도에 기록하고 최종 제출 사실과 구분한다.
- 출석·수료 같은 향후 도메인이 사용자 이메일이 아닌 영속적인 `enrollment_id`를 참조하도록 일관성을 유지한다.

### F. `assignment_submission_files` 및 `assignment_upload_intents`

`assignment_submission_files` 필드: `id`, `submission_id` FK, 불투명 `storage_key`, `original_name`, `mime_type`, `size_bytes`, `checksum`. 최종 파일의 체크섬은 선택 사항이 아니며 소문자 16진수 64자리의 SHA-256을 요구한다. 파일 테이블에 별도 `created_at` 필드는 없다. 제출 시각은 연결된 제출 기록에서 확인한다.

`assignment_upload_intents`는 `id`, `assignment_target_id`, `user_id`, `storage_key`, `expires_at`, `state`, `created_at`과 검증 시각·파일 메타데이터를 가진다. 상태는 `INTENDED`·`VERIFIED`·`CONSUMED`·`EXPIRED`로 구분한다. 검증 전에는 파일 메타데이터가 비어 있고, 검증·사용 상태에는 형식·크기·체크섬이 모두 필요하다. 업로드 승인과 최종 제출을 연결해 클라이언트의 임의 URL을 제출로 확정하지 않는다. 승인·취소·정리의 별도 원장은 [업로드 계약](developer/academic-assignment-uploads.md)을 따른다.

- 저장 키는 고유·추측 어려운 값이어야 하며, 한글 원본 파일명과 저장 경로를 분리한다.
- 파일을 전송한 사람·대상 과제·실제 저장된 객체·크기/유형을 **서버에서 재검증**한다.
- 기존 공용 `access: public` 업로드/이미지 정리 헬퍼를 그대로 제출물에 재사용하지 않는다.
- 구현된 `GET /api/academic/submissions/[id]/file/[fileId]`는 매번 객체 수준 접근을 확인한다. 적용·인가·전달 감사는 [개인 제출 파일 다운로드](developer/academic-submission-files.md)를 따른다. 외부 서비스에 장기 유효 URL을 노출하지 않는다.
- 업로드 중단·만료·DB 실패 시 고아 객체 정리와 재시도 정책을 명시한다. **다른 제출물이 참조 중인 객체는 삭제하지 않는다.**
- Vercel Function의 4.5MB 본문 제한은 `serverActions.bodySizeLimit` 확대만으로 해제되지 않는다. G1 코드에는 [인증된 브라우저→비공개 스토리지 직접 업로드와 원본 검증](developer/academic-assignment-uploads.md)이 구현됐으며, 운영 업로드는 비활성이다.
- 파일 포맷은 확장자+매직 바이트 검증, 크기·개수·요청 제한, 바이러스/악성코드 정책은 데이터 민감도에 맞춰 단계화한다.
- G1 파일 정책은 **비어 있지 않은 PDF 1개, 50MiB(52,428,800바이트) 이하**다. `.pdf` 확장자(대소문자 무관), `application/pdf` MIME, PDF 시그니처를 모두 검증하고 다른 형식·추가 파일은 거부한다. 개인 제출 파일은 인증된 첨부 다운로드만 허용한다.

공식 자료: [Vercel Functions 한도](https://vercel.com/docs/functions/limitations), [Vercel Private Blob](https://vercel.com/docs/vercel-blob/private-storage), [Client Upload](https://vercel.com/docs/vercel-blob/client-upload).

## 3. 읽기/쓰기 불변조건과 질의 원칙

**I1 — 소유권**: 학생 A의 로그인 계정은 학생 B의 학적/제출/파일을 읽거나 확정할 수 없다. 같은 기수 소속만으로는 타인 파일 조회 권한이 생기지 않는다.

**I2 — 대상 기수**: `assignment_targets.enrollment_id`가 가리키는 기수는 반드시 해당 `assignments.cohort_id`와 일치한다. 클라이언트가 전달한 user/cohort ID를 그대로 신뢰하지 않는다.

**I3 — 미제출 집계**: `assignment_targets LEFT JOIN assignment_submissions`으로 명부 전체를 반환하고, 제출 유무는 최종 확정된 행만으로 판단한다. 제출이 없는 학생 0행도 결과에 포함한다.

**I4 — 멱등성**: 같은 업로드 의도/제출 키 재시도는 기존 완료 결과를 반환한다. 서로 다른 두 요청이 동시에 제출해도 허용된 최종 제출 개수(초기 1개)를 넘지 않는다.

**I5 — 원자성**: 제출 사실·제출 파일 메타데이터·처리 완료 표시는 원자적으로 확정한다. DB 트랜잭션과 Blob 쓰기는 별도 시스템이므로 보상/재시도/청소 상태를 분리한다.

**I6 — 이력 보존**: 기수 삭제, 계정 탈퇴, 과제 비공개화/종료, 새 기수 등록이 과거의 합법적으로 보존해야 할 제출 사실을 연쇄 삭제하지 않는다.

보존기간·개인정보 요청·사본 파기·복구 시 재삭제의 결정 항목은 [학사 개인정보 보존·파기 정책 초안](ACADEMIC-PRIVACY-RETENTION-POLICY.md)에 정리한다. 현재 외래키·불변 제약은 무기한 보존 승인이 아니며, #142의 기간·기산점은 아직 미정이다.

**I7 — KST**: 마감 정책을 명시적으로 `Asia/Seoul`로 해석한 뒤 UTC instant 저장 및 비교한다. 정각 경계(전/후)와 일광절약시간 없는 한국 표준시 기준 테스트를 포함한다.

## 4. 마이그레이션·백필 계획

1. 기존 DB 테이블·FK/UNIQUE·실제 데이터 카디널리티를 **읽기 전용**으로 조사한다.
2. `academic_students` / `cohort_enrollments` 등의 새 테이블 생성 migration을 버전 관리한다. 기존 컬럼 삭제·덮어쓰기 금지.
3. 현재 `MEMBER` + 유효한 `users.cohortId`의 후보 행을 dry-run으로 표시하되 **누락/중복/관리자·교수의 기존 참여 이력**은 수동 확인 대상으로 출력한다.
4. 계정 없는 등록 대상은 관리자 검증 후 학생 엔터티로 생성한다. 이메일 동등성만으로 자동 매칭하지 않는다.
5. 기존 권한/회원 화면은 변경 없이 남기고, 새 학사 경로만 신규 학적 기반으로 동작시킨다.
6. 폐기 가능한 격리 검증 DB에서 backfill 재실행(멱등성), 유일성, rollback/forward-fix, 삭제 제한을 검증한다.
7. 운영 백업 및 복원 시험 증거 확보 후 승인된 migration을 배포한다. 적절한 기간 동안 기존 `users.cohortId`와 신규 학적 간 불일치를 리포트한다.
8. 이행 후에만 호환 필드 축소를 별도 결정한다.

## 5. G2/G3 후보 (지금 생성하지 않음)

### G2: 수업 어드바이저(Advisor)와 출결 데이터 분리

**확인된 사실:** 출결은 교수가 담당하지 않는다. 수업 운영 인력은 **어드바이저 1명과 조교 2명**이고 **세 사람이 돌아가며 출결을 체크한다.** 인력은 **기수마다 다르고** 기수 안에서는 **고정 배정**이지만, **조교는 학기 중에 바뀔 수 있고** 향후 역할도 바뀔 수 있다. 이들을 관리하는 담당자는 홈페이지 관리자(`ADMIN`)와 **다른 사람**이며 `ADMIN` 은 홈페이지만 관리한다. **설계 반영:** 아래 배정 테이블은 수업일별이 아니라 **기수 단위 기간 배정**(`cohort_id`, `role`(ADVISOR/ASSISTANT), `starts_at`, `ends_at`)으로 바꾸고, 출결 권한은 해당 기수에 **현재 유효한** 배정을 가진 어드바이저·조교 모두에게 준다. 학기 중 교체에 대비해 같은 기수·역할의 배정 행을 여러 개 둘 수 있어야 하며, 과거 출결 기록의 입력자는 교체 후에도 보존한다. 배정·교체 권한은 `ADMIN` 이 아닌 별도 학사 운영 관리 권한에 둔다. **추가 정책 확인(#143):** 출결 정정·최종 승인 절차, 학사 운영 관리 권한의 범위와 부여 방식.

- `cohort_attendance_assignments(id, cohort_id, user_id, role, starts_at, ends_at, assigned_by_user_id)` 제안: 기수별 어드바이저·조교의 유효 기간과 교체 이력을 기록한다. 동일 계정·기수·역할의 유효 기간 중복을 방지하고, 종료 후 권한을 회수한다. 동시 배정 인원과 교체 승인 절차는 #143에서 확정한다.
- 운영 인력은 검증된 로그인 사용자에 연결되는 **기수 단위 업무 역할**로 취급한다. 전역 `ADVISOR`/`ASSISTANT` enum 도입은 별도 운영 요구가 확인된 뒤 결정한다. 기존 `FACULTY` 및 홈페이지 `ADMIN` 역할만으로 출결 권한을 주지 않는다.
- `canManageAttendance(session, scheduleEventId)`: 해당 CLASS 수업일의 기수와 **현재 유효한 어드바이저·조교 배정**을 함께 검증한다. 배정되지 않은 사용자, 다른 기수 배정자, `FACULTY`/`ADMIN` 역할만 가진 사용자, PENDING·비로그인은 거부한다. 정정·최종 승인과 별도 학사 운영 관리자 권한은 #143 정책으로 결정한다.
- 어드바이저·조교의 명부 접근은 **해당 기수의 출결 대상 학생 최소 정보**로 제한한다. 과제 평가·개인 제출 파일·다른 기수 학적은 기본 열람 대상으로 삼지 않는다.
- 교수/교수 프로필(`faculty`)과 운영 인력 배정은 별도 정본이다. 양자를 동일한 ID나 로그인 역할로 통합하지 않는다.

관련 작업: [#165 수업 Advisor 배정 및 권한](https://github.com/Human-Renaissance-Academy/hra-website/issues/165), [#159 출결 모델](https://github.com/Human-Renaissance-Academy/hra-website/issues/159), [#160 출결 UI](https://github.com/Human-Renaissance-Academy/hra-website/issues/160).

- `attendance_records(enrollment_id, schedule_event_id, state, recorded_by_user_id, updated_at)` 제안: `UNIQUE(enrollment_id, schedule_event_id)`. 실제 기록 행 부재(`UNMARKED`/미입력에 해당)와 명시적 `ABSENT`/결석은 다르다. 학생의 기수는 수업 기수와 일치해야 한다. `recorded_by_user_id`가 교수의 `facultyId`와 같다고 추정하지 않는다.
- `attendance_change_history(attendance_record_id, previous_state, next_state, changed_by_user_id, reason, changed_at)` 또는 공통 감사 로그: 최초 입력·정정·취소의 주체/사유/시간을 보존하고 당시 어드바이저·조교 배정의 유효 여부를 검증한다. 세션별 출석 필요성은 미확정이다.
- `academic_audit_logs(actor_user_id, resource_type, resource_id, action, before_summary, after_summary, reason, occurred_at)`: 내용 전문·민감 URL 금지, 보존 기간·열람권 분리.
- `assignment_reviews`: 별도 정책에 따라 담당 교수/운영진 검토, 피드백, 과거 버전 추적 (G3). 이 권한을 출결 입력·정정 권한과 결합하지 않는다.
- `completion_decisions`: 수료 조건 버전·운영진 승인·예외 사유·확정 시각 (G3).

새 엔터티 추가는 운영 정책과 이용자 요구가 확인되었을 때만 진행한다. 선제적인 학점/학과/학기 테이블은 만들지 않는다.

