# Android·iOS EAS 빌드 설정 및 운영 전 검증

> 범위: #283의 **빌드 파이프라인 준비**. 실제 Expo 계정·Apple Developer·Google Play·GitHub Environment 설정, 스토어 제출, 운영 앱 출시가 완료됐다는 뜻이 아닙니다. 운영 환경 격리는 #279, 운영 도메인 및 Vercel 배포는 #281·#408을 따릅니다.

## 1. 현재 구현된 경계

- `apps/mobile/eas.json`: 내부 검증용 `preview`와 배포 후보용 `production` 프로필. 운영 프로필은 스토어용 바이너리를 **빌드할 뿐 자동 제출하지 않습니다**.
- `apps/mobile/app.config.ts`: 명시된 `EXPO_PROJECT_ID`, `HRA_ANDROID_APPLICATION_ID`, `HRA_IOS_BUNDLE_IDENTIFIER`를 앱 설정에 연결. 값이 없으면 기존 Android 임시 `com.hra.mobile`로 로컬 debug는 유지하고 iOS 앱 식별자는 구성하지 않습니다.
- `scripts/check-eas-config.mjs`: 원격 빌드 전 프로젝트 UUID, 승인한 플랫폼별 앱 식별자, HTTPS API origin, Preview/Production 범위, 운영 빌드의 추가 활성화 값을 검사. **시크릿 원문을 로그에 출력하지 않습니다**.
- `--remote` 검사는 GitHub의 승인된 Expo 프로젝트 UUID로 선택한 **Expo 서버의 `preview`/`production` 환경**에서 로드한 API origin·플랫폼 앱 식별자가 GitHub 보호 환경의 기대값과 일치해야만 빌드를 시작합니다. GitHub 변수 검증만으로 EAS 원격 빌더에 반영됐다고 가정하지 않습니다.
- `.github/workflows/mobile-eas-build.yml`: `main`에서만 수동 호출하며 플랫폼·프로필을 입력받습니다. 기존 모바일 CI 안에서 별도 계약 테스트가 실행됩니다. 자동 PR 빌드나 자동 스토어 제출은 하지 않습니다.
- 원격 `appVersionSource=remote`, 운영 빌드 `autoIncrement=true`, `requireCommit=true`. 처음 원격 버전 동기화를 검증해야 하며 기존 출시 버전이 있다면 EAS CLI의 `build:version:set`으로 먼저 맞춥니다. 앱 버전을 임의로 초기화하지 않습니다.

## 2. 실제 계정 작업 전에 확정해야 할 정보

| 항목                                                         | 어디에 설정할지                                                               | 확인   |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------- | ------ |
| Expo 조직/프로젝트 권한, 정확한 프로젝트 ID                  | 승인받은 Expo 프로젝트, GitHub environment 변수 `EXPO_PROJECT_ID`             | 미확인 |
| Android 영구 applicationId (현재 `com.hra.mobile`은 임시 값) | 환경 변수 `HRA_ANDROID_APPLICATION_ID`; Play Console 패키지 ID와 대조         | 미확인 |
| iOS 영구 bundle identifier와 Apple Team                      | `HRA_IOS_BUNDLE_IDENTIFIER`; Apple Developer 설정과 대조                      | 미확인 |
| 운영 HTTPS API 주소                                          | `EXPO_PUBLIC_API_BASE_URL`, Expo EAS `production` environment에 동일한 공개값 | 미확인 |
| Preview 전용 HTTPS API 주소, 독립 테스트 DB/Blob/OAuth       | GitHub `mobile-preview` environment와 Expo EAS `preview` environment          | 미확인 |
| Expo 서비스용 자동화 토큰                                    | GitHub 환경별 `EXPO_TOKEN` secret, 저장소 소스와 일반 Variables에는 저장 금지 | 미확인 |
| Android 서명 키 및 Apple 배포 인증서 소유·회수 계획          | Expo/플랫폼 계정의 승인된 보안 저장소                                         | 미확인 |
| GitHub `mobile-production` 보호 환경의 required reviewer     | 조직 관리자 설정에서 실제 승인자 지정                                         | 미확인 |

EAS 빌드가 성공했다고 운영 DB/Blob 또는 OAuth 환경 분리가 검증됐다는 뜻은 아닙니다. 민감정보/제출 자료는 **합성 계정과 파일**로만 Preview 검증합니다. Production 사용자 데이터는 테스트용으로 복사하지 않습니다.

## 3. GitHub 환경 설정과 실행

1. 조직 관리자는 GitHub Environments `mobile-preview`, `mobile-production`을 설정합니다. 특히 **`mobile-production`은 Required reviewers** 및 허용 브랜치 정책을 실제 관리 화면에서 검증합니다.
2. 각 환경에 별도의 `EXPO_TOKEN` secret과 `EXPO_PROJECT_ID`, `EXPO_PUBLIC_API_BASE_URL`, `HRA_ANDROID_APPLICATION_ID`, `HRA_IOS_BUNDLE_IDENTIFIER` 변수를 구성합니다. Expo EAS의 해당 `preview`/`production` 환경에도 API 주소와 필요한 **해당 환경 전용** 값을 설정합니다.
   - **Expo 프로젝트의 같은 환경**에도 `EXPO_PROJECT_ID`, `EXPO_PUBLIC_API_BASE_URL`, 선택된 플랫폼의 `HRA_ANDROID_APPLICATION_ID` 또는 `HRA_IOS_BUNDLE_IDENTIFIER`를 구성합니다. 앱에 사용되는 공개 URL/앱 ID를 `secret` visibility로만 설정하면 CLI 로컬 사전검사에서 읽을 수 없으므로 명시적으로 검증 가능한 visibility를 선택합니다. Expo 서버에 설정한 값은 GitHub Environment 값과 정확히 같아야 합니다. GitHub Action 변수를 Expo 빌더로 자동 전달하는 것으로 간주하면 안 됩니다.
3. Production을 승인한 시점에만 GitHub `mobile-production` 환경 변수 `HRA_MOBILE_PRODUCTION_RELEASE_ENABLED=true`를 설정합니다. 이는 **추가 기술 게이트**이며 GitHub 실제 리뷰 승인이나 운영 승인 자체를 대체하지 않습니다. Preview에는 필요 없습니다.
4. `main` 최신 HEAD에서 기존 모바일 `CI` 및 `모바일 Android` 워크플로를 확인한 뒤 `모바일 EAS 수동 빌드`를 `workflow_dispatch`로 실행합니다. `profile`은 `preview` 또는 `production`, `platform`은 `android` 또는 `ios`입니다.
5. 실행은 `npm ci`, API 타입 최신성·typecheck·lint·Jest·SDK doctor·플랫폼 JS bundle을 다시 통과해야만 EAS CLI를 호출합니다. EAS에서 실제 빌드 결과, 서명, 아티팩트와 ID를 확인하고, Android/iOS 별도 승인 후 스토어 등록을 수행합니다.
   - EAS CLI 호출 전 GitHub 값의 1차 정적 검사와, **`eas env:exec <profile>`로 실제 Expo 서버 환경을 다시 로드한 상태의 2차 일치 검사**를 수행합니다. 이때 GitHub에서 주입한 **API 주소·선택 플랫폼 식별자**는 별도 프로세스에서 `unset`하므로 Expo 원격 값의 누락을 GitHub 값이 가릴 수 없습니다. `EXPO_PROJECT_ID`는 EAS CLI의 원격 프로젝트 조회에 필요해 유지하며, CLI가 이를 이용해 선택된 Expo 프로젝트 환경을 읽습니다. 동일 프로젝트에 연결됐다는 사실과 앱 런타임 환경변수 검증은 서로 다른 조건입니다. 값이 다르면 `EAS_REMOTE_ENVIRONMENT_MISMATCH` 등 고정 코드로 실패하고 빌드하지 않습니다.

로컬 정적 설정과 거부 테스트:

```sh
cd apps/mobile
node scripts/check-eas-config.mjs --config
node --test scripts/tests/check-eas-config.test.mjs
```

실제 빌드는 위 GitHub 수동 워크플로를 사용합니다. 로컬 `--release` 검사는 로컬 값의 형식만 검사하므로 Expo 원격 환경과의 일치를 증명하지 않습니다. 이 검사만 통과한 뒤 로컬에서 `eas build`를 직접 실행하지 않습니다. 별도 로컬 운영 절차가 필요한 경우에도 위 워크플로와 동일하게 승인된 기대값을 보존하고 API 주소·플랫폼 식별자를 제거한 프로세스에서 `eas env:exec <profile>` 및 `--remote` 일치 검사를 먼저 통과해야 합니다. 실제 계정·서명·출시 승인은 이 검사와 별개입니다.

## 4. 반드시 남아야 할 완료 증거

- 최신 `main`에 대한 GitHub 실제 job 결과와 SHA, 사용한 EAS Build ID·프로필·플랫폼
- Expo 프로젝트 ID/스토어 식별자/계정 소유자가 맞다는 **값을 노출하지 않는 확인 기록**
- Preview·Production API URL, 인증 callback, DB, Private Blob의 실제 분리 증거
- Android 서명된 배포 후보와 iOS 실제 아카이브 검증(리눅스에서 iOS JS 번들만 확인한 결과로 대체하지 않음)
- Play Internal Testing/TestFlight 기기 검증, 권한/갱신토큰/파일 다운로드 점검
- 롤백·버전 재배포 시나리오와 채널별 담당자 승인
- 스토어 제출·공개는 독립적인 후속 승인. `--auto-submit`은 사용하지 않음

공식 문서 참고: [Expo 서버 환경변수·CI 분리](https://docs.expo.dev/eas/environment-variables/faq/), [Expo CLI `env:exec`](https://docs.expo.dev/eas/cli/), [Expo EAS build 설정](https://docs.expo.dev/build/eas-json/), [원격 버전 관리](https://docs.expo.dev/build-reference/app-versions/), [CI에서 빌드](https://docs.expo.dev/build/building-on-ci/), [서비스 토큰](https://docs.expo.dev/accounts/programmatic-access/).
