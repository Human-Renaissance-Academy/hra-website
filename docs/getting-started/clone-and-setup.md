# 프로젝트 받아오기 — 코드와 개발 설정 준비하기

이 단계에서는 저장소를 내 컴퓨터로 복제하고, 저장소가 정한 버전의 패키지를 설치합니다. [사전 준비](prerequisites.md)를 먼저 마쳐 주세요. 아래 명령은 macOS/Linux 터미널 또는 Windows Git Bash에서 실행합니다.

## 1. 작업 폴더에 코드 가져오기

내 계정이 파일을 만들 수 있는 폴더에서 터미널을 엽니다. 아래는 **원본 저장소에 작업 브랜치를 올릴 권한이 있는 팀원**을 위한 예시이며, 사용자 폴더 아래에 `projects`를 만듭니다.

```bash
mkdir -p ~/projects
cd ~/projects
git clone https://github.com/Human-Renaissance-Academy/hra-website.git
cd hra-website
```

**클론(clone)**은 코드와 변경 이력을 함께 가져오는 작업입니다. 이미 복제한 폴더가 있다면 다시 복제하지 말고 그 폴더로 이동합니다.

원본 쓰기 권한이 없는 외부 기여자는 GitHub에서 자신의 계정으로 **포크(fork)**를 만든 뒤, 위 `git clone` 주소를 자신의 포크 주소로 바꿉니다. 이 경우 `origin`은 자신의 포크를 가리키며, PR의 병합 대상은 `Human-Renaissance-Academy/hra-website`의 작업 기준 브랜치로 선택합니다. 포크 생성과 원본 연결 방법은 [GitHub 공식 안내](https://docs.github.com/en/get-started/exploring-projects-on-github/contributing-to-a-project)를 참고합니다.

VS Code에서 폴더를 엽니다.

```bash
code .
```

`code` 명령이 없다면 VS Code의 **파일 → 폴더 열기**에서 `hra-website`를 선택합니다. 파일 목록에 `package.json`, `package-lock.json`, `src`, `docs`가 보이는지 확인합니다.

## 2. 저장소에 고정된 패키지 설치하기

[사전 준비](prerequisites.md)에 따라 Node 24를 선택합니다. `.nvmrc`는 `24`, `package.json`의 `engines.node`는 `24.x`이며 패치 버전은 고정하지 않습니다. nvm을 사용한다면 `nvm install` → `nvm use`를 실행한 뒤 `node --version`이 `v24.`로 시작하는지 확인합니다. nvm 없이 설치한 경우에도 실제 버전을 확인한 뒤 진행합니다.

```bash
npm ci
```

**패키지**는 프로젝트가 사용하는 외부 코드입니다. `package.json`은 필요한 패키지와 실행 명령을 선언하고, `package-lock.json`은 설치할 정확한 버전 정보를 기록합니다. `npm ci`는 이 기록을 따라 설치하며 두 파일을 바꾸지 않습니다. 기존 `node_modules` 폴더가 있으면 다시 설치하므로, 실행 중인 개발 서버는 먼저 종료합니다. 자세한 동작은 [npm 공식 문서](https://docs.npmjs.com/cli/v11/commands/npm-ci/)를 참고합니다.

명령이 오류 없이 끝나고 `node_modules`가 만들어지면 설치 단계가 끝납니다. 패키지를 추가하거나 버전을 바꾸는 작업은 별도 변경으로 다루며, 설치 실패를 숨기기 위해 잠금 파일을 지우거나 `--force`를 붙이지 않습니다.

## 3. 환경 변수 설정하기

**환경 변수**는 코드 밖에서 제공하는 설정값입니다. `.env`가 아직 없을 때만 다음 명령으로 개발용 설정 파일을 만듭니다. 이미 있다면 덮어쓰지 말고 예제와 빠진 항목만 비교합니다.

```bash
cp .env.example .env
```

PowerShell의 복사 명령은 `Copy-Item .env.example .env`입니다.

`.env.example`은 항목을 설명하는 예제이며 실제 접속 정보가 아닙니다. `.env`를 편집해 작업에 필요한 값만 넣습니다.

| 항목 | 개발 환경에서 할 일 |
| --- | --- |
| `DATABASE_URL` | 담당자가 준비한 **개발용 DB** 주소를 넣습니다. 운영 DB 주소를 복사하지 않습니다. |
| `AUTH_SECRET` | 개발 환경만의 무작위 비밀값을 만듭니다. 예제 문자열을 그대로 사용하지 않습니다. |
| `NEXT_PUBLIC_APP_URL` | 기본 포트로 실행한다면 `http://localhost:3000`을 사용합니다. |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | 구글 로그인을 시험할 때만 개발용 키를 설정합니다. 사용하지 않으면 **두 값 모두 비웁니다**. |
| `AUTH_KAKAO_ID`, `AUTH_KAKAO_SECRET` | 카카오 로그인을 시험할 때만 개발용 키를 설정합니다. 사용하지 않으면 **두 값 모두 비웁니다**. |
| Blob 관련 항목 | 파일 업로드를 시험할 때 담당자에게 개발용 저장소 설정을 받습니다. |
| `AUTH_KAKAO_EMAIL_SCOPE`, `ACADEMIC_*` 등의 기능 설정 | 기본 상태를 유지합니다. 기능별 선행 절차를 확인한 뒤 필요한 환경에서만 켭니다. |

**OAuth**는 구글·카카오 같은 외부 서비스에서 인증한 결과를 사이트가 받아 로그인하는 방식입니다. OAuth 키의 예제 문자열도 비어 있지 않은 값으로 처리됩니다. 로그인 서비스를 설정하지 않았다면 `replace-with-...`를 남겨 두지 말고 `AUTH_KAKAO_ID=`처럼 값을 비웁니다.

`AUTH_SECRET`을 생성하려면 다음 명령을 사용할 수 있습니다. 출력값은 `.env`에만 옮기고 공개 이슈나 화면 캡처에 넣지 않습니다.

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

파일이 Git의 제외 규칙에 들어 있는지도 확인합니다.

```bash
git check-ignore .env
git status --short
```

첫 명령에서 `.env`가 출력되고, 두 번째 명령에 비밀 설정 파일이 추가 대상으로 나타나지 않아야 합니다. 제외 규칙은 강제 추가나 직접 복사를 막아 주지는 않으므로, 커밋 전 변경 목록을 항상 확인합니다.

## 4. DB 준비 상태 확인하기

### 앱과 관리 명령이 읽는 설정 비교

기존 작업 폴더에는 `.env.local` 같은 다른 설정 파일이 남아 있을 수 있습니다. 같은 이름의 값이 여러 곳에 있으면 다음 순서로 선택됩니다.

| 실행 대상 | 먼저 적용되는 값 |
| --- | --- |
| `npm run dev` | 터미널의 기존 환경변수 → `.env.development.local` → `.env.local` → `.env.development` → `.env` |
| `node --env-file=.env`를 사용하는 seed·migration 명령 | 터미널의 기존 환경변수 → 지정한 `.env` |
| 현재 `drizzle.config.ts`의 `dotenv.config()` | 터미널의 기존 환경변수 → 프로젝트 루트의 `.env` |

앱이 읽는 DB와 관리 명령이 변경할 DB가 같아야 합니다. `.env`만 바꾼 뒤 예전 `.env.local`이나 터미널 설정이 적용되는 일을 피하도록, 실행 전에 각 설정의 대상 환경을 확인합니다. 비밀값 전체를 터미널·이슈에 출력할 필요는 없습니다. 우선순위 근거는 [Next.js 환경변수](https://nextjs.org/docs/app/guides/environment-variables#environment-variable-load-order), [Node.js 24의 env-file](https://nodejs.org/download/release/v24.14.0/docs/api/cli.html#--env-filefile) 및 저장소의 `package.json`·`drizzle.config.ts`입니다.

### 테이블과 추가 함수 확인

DB 주소가 있어도 테이블이나 로그인 요청 제한 함수가 없으면 화면 조회와 로그인이 실패할 수 있습니다. 담당자에게 개발 DB의 준비 상태를 확인합니다.

- 새 DB의 테이블과 추가 SQL 적용: [데이터베이스 변경 절차](../developer/database-change-procedure.md)
- 로그인·업로드 요청 제한 설정: [요청 제한 운영](../operations/rate-limits.md)
- 카카오 로그인을 시험하는 경우: [카카오 로그인 설정](../KAKAO-LOGIN-SETUP.md)

`npm run db:push`는 현재 접속 없이 안내하고 실패 종료합니다. 기본 Drizzle 설정은 DB 자격정보를 읽지 않습니다. SQL 생성과 별도 적용·추가 제약 검증은 [DB 변경 절차](../developer/database-change-procedure.md)를 따릅니다.

## 막힐 때

| 증상 | 확인 순서 |
| --- | --- |
| 저장소를 복제할 수 없음 | URL, 인터넷 연결, GitHub 접근 권한을 확인합니다. |
| `npm ci`에서 네트워크 오류 | npm 레지스트리 접속과 프록시 정책을 확인합니다. 실패 로그에 나온 주소·오류 코드를 담당자에게 전달합니다. |
| `package.json`과 잠금 파일 불일치 | 최신 브랜치인지 확인하고 저장소의 의존성 변경 담당자에게 알립니다. 임의로 잠금 파일을 재생성하지 않습니다. |
| `Permission denied` | 내 계정 소유 폴더인지 확인합니다. 관리자 권한으로 npm 명령을 실행해 우회하지 않습니다. |
| DB 연결 또는 함수 없음 오류 | 연결 대상과 DB 변경 적용 상태를 확인합니다. 오류를 없애려고 다른 환경의 DB를 연결하지 않습니다. |

다음 단계: [사이트 실행하기](first-run.md).

