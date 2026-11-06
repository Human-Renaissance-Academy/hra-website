/**
 * 역할: 내 정보(Profile) 화면의 순수 도메인·표시 변환 로직 및 쿼리 키 생성기
 * 사용 위치: app/(app)/(tabs)/profile.tsx, src/features/profile/components.tsx, tests/profile-*.test.tsx
 * 주요 기능:
 * - 저장된 세션 프로필(useAuth)과 GET /api/v1/me 응답을 병합해 표시용 프로필 모델 생성
 * - 권한 판단(내 과제 행 노출 여부)은 오직 세션 역할(sessionUser.role)만 사용하고 /me 응답은 표시 전용으로 제한
 * - 앱 버전 문자열 정규화 및 개인정보 처리방침 URL 유효성(HTTPS) 검사
 */
import type { components } from '../../api/schema';
import type { SessionUser } from '../../auth/types';
import { formatRoleLabel } from '../home/model';
import { profileConfig } from './config';
import { profileStrings } from './strings';

export type MeUserDto = Readonly<components['schemas']['MeUser']>;

export interface ProfileDisplayView {
  readonly name: string;
  readonly emailText: string;
  readonly roleLabel: string;
  readonly showAssignmentsRow: boolean;
}

/** 사용자별 격리된 내 정보 화면 React Query 키 모음입니다. */
export const profileQueryKeys = {
  me: (userId: string | null | undefined) =>
    ['profile', 'me', userId ?? 'anonymous'] as const,
} as const;

/**
 * 저장된 세션 사용자 정보와 최신 /api/v1/me 조회 결과를 조합해 화면 표시 모델을 반환합니다.
 * 보안 규칙: showAssignmentsRow 등 권한 분기는 meUser가 아닌 sessionUser(또는 auth.role)만 근거로 삼습니다.
 */
export function buildProfileDisplayView(input: {
  readonly sessionUser: SessionUser | null;
  readonly sessionRole?: SessionUser['role'] | null | undefined;
  readonly meUser?: MeUserDto | null | undefined;
}): ProfileDisplayView {
  const authorizedRole = input.sessionRole ?? input.sessionUser?.role ?? null;
  // meUser가 현재 로그인한 사용자와 동일한 계정일 때만 표시 필드를 보강합니다.
  const canUseMeDisplay =
    Boolean(input.meUser) &&
    (!input.sessionUser || input.meUser?.id === input.sessionUser.id);

  const rawName = (canUseMeDisplay ? input.meUser?.name : undefined) ?? input.sessionUser?.name;
  const trimmedName = rawName?.trim();
  const name =
    trimmedName && trimmedName.length > 0 ? trimmedName : profileStrings.fallbackName;

  const rawEmail = canUseMeDisplay ? input.meUser?.email : null;
  const trimmedEmail = rawEmail?.trim();
  const emailText =
    trimmedEmail && trimmedEmail.length > 0
      ? trimmedEmail
      : profileStrings.emptyEmail;

  const displayRole =
    (canUseMeDisplay ? input.meUser?.role : undefined) ?? authorizedRole;

  return {
    name,
    emailText,
    roleLabel: formatRoleLabel(displayRole),
    showAssignmentsRow: authorizedRole === 'MEMBER',
  };
}

/** expo-constants 등에서 읽은 앱 버전 값을 안전하게 표시 문자열로 정규화합니다. */
export function resolveAppVersion(rawVersion: string | null | undefined): string {
  const trimmed = rawVersion?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : '0.1.0';
}

/**
 * 개인정보 처리방침 설정값을 검증해 표시 가능한 안전한 HTTPS URL이면 반환하고,
 * 비어 있거나 안전하지 않으면 null을 반환합니다.
 */
export function resolvePrivacyPolicyUrl(
  configuredUrl: string | undefined = profileConfig.privacyPolicyUrl,
): string | null {
  const trimmed = configuredUrl?.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}
