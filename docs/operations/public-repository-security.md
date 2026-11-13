# 공개 저장소 운영 확인표

관련: #269. 저장소는 public을 유지하며 소스 비공개성을 인증·인가의 전제로 삼지 않습니다. 검사는 공개된 저장소와 제한된 산출물 범위의 회귀 장치이며 모든 개인정보·credential의 부재를 증명하지는 않습니다.

| 항목 | 확인 상태와 운영 기준 |
| --- | --- |
| GitHub secret scanning | 2026-10-22 읽기 전용 repository API에서 enabled 확인 |
| GitHub push protection | 같은 조회에서 enabled 확인. non-provider patterns와 validity checks는 disabled이며 이 작업에서 변경하지 않음 |
| Dependabot | alerts 활성화 확인. 자동 security update PR은 disabled 상태를 유지하고 자동 머지하지 않음 |
| PR·이력 검사 | [저장소 게이트](../developer/repository-security-gates.md)에서 현재 추적 소스와 fetched refs의 reachable history, 실제 source/삭제 이력 canary 확인 |
| dependency 검토 | audit 심각도와 HRA P1을 구분. 정확한 advisory·경로·버전·판정 근거·담당·재검토 기한을 유지하고 drift·만료·미분류·P1 차단 |
| 공개 artifact | [업로드 직전 검사](../developer/public-artifact-safety.md)의 고정 세 JSON만 허용. 검사 성공 전 업로드 금지, 승인된 정제 증거는 7일 후 만료 |
| 문서·fixture 개인정보 표식 | 같은 안내의 명시한 텍스트 범위에서 이메일·전화·주민번호 모양·세션 표식을 검사. 합성 값은 정확한 파일·규칙·해시·검토 이유로만 구분하며 개인정보 전체 부재의 증명으로 보지 않음 |
| 브라우저 정책 | [CSP·HSTS](../developer/browser-security-policy.md)와 실제 읽기 전용 배포 점검. 운영 계정·실제 파일·OAuth 검증으로 과장하지 않음 |
| `main` 필수 체크 보호 | [필수 체크 경계](../developer/github-actions-security.md) 목표 정본 6개(`Lint · Typecheck · Test · Build`, `PR 형식`, `형식·릴리스 계약 테스트`, `추적 소스 · 도달 가능한 이력 · dependency 검토`, `실제 production CSP · 에디터 · 인쇄 · Blob SDK`, `Vercel`)와 관리자 제공 GitHub 보호 설정(`--protection-file`) 일치 여부를 별도 검증. 2026-11-14 조회 결과 현재 필수 검사는 기존 4개이며 추가 보안 2개는 미등록. Vercel 연결·보호 설정 조회는 복구됐으나 보안 게이트 코드와 #483 범위 작업의 main 반영, 최신 HEAD 검사 성공, 별도 보호 설정 적용·재검증이 필요. YAML 병합만으로 GitHub 보호 설정 반영 완료로 간주하지 않음 ([#408](https://github.com/Human-Renaissance-Academy/hra-website/issues/408)) |
| LICENSE | 현재 저장소에 선택한 LICENSE 파일 없음. 라이선스 선택은 소유권자의 별도 결정이며 이 변경이 사용 권한을 부여하지 않음. 사이트 사진·콘텐츠·자료의 권리도 별도 검토 |
| Git author 이메일 | 향후 기여에는 GitHub noreply 이메일 사용 권고. GitHub 계정 설정의 정확한 noreply 주소를 확인하고 로컬 저장소의 commit email에 적용. 기존 이력 rewrite는 별도 필요성·영향 검토 없이 실행하지 않음 |

실제 secret이 발견되면 값·전체 finding·원본 URL·사용자 정보·공격 절차를 공개 이슈/PR/로그에 복사하지 않습니다. 소유권자가 비공개 보안 절차로 확인하고 실제 credential 폐기·재발급과 영향 평가를 진행합니다. 이력에서 문자열을 지우는 것만으로 노출이 해소됐다고 보지 않습니다. 이 작업은 실제 credential 폐기나 Git history rewrite를 수행하지 않습니다.

작업자는 PR의 최신 CI·Preview 성공과 merge SHA의 Production 결과를 구분해 남깁니다. 머지 후 소유한 branch·worktree·임시 도구·합성 서버·DB·보고서를 정리하고 다른 미병합 작업자의 unique history는 보존합니다. 조회·검증 도구의 원본 비밀값을 공유하거나 신규 서비스 자격정보를 채팅에 붙여 넣도록 요구하지 않습니다.

공식 안내: [GitHub secret scanning](https://docs.github.com/en/code-security/concepts/secret-security/secret-scanning), [push protection](https://docs.github.com/en/code-security/concepts/secret-security/push-protection), [라이선스 선택](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository), [commit 이메일](https://docs.github.com/en/account-and-profile/how-tos/email-preferences/setting-your-commit-email-address).
