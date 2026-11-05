/**
 * 역할: HRA 모바일 공통 UI 키트의 단일 배럴(barrel) 진입점
 * 사용 위치: app 디렉터리, src/auth, src/components, src/features 하위 화면 및 컴포넌트
 * 주요 기능:
 * - 모든 순수 프레젠테이션 컴포넌트와 유틸리티(confirmAction, useRefresh) 재수출
 * - src/auth 및 src/api에 의존하지 않는 독립 UI 계층 보장
 */
export { AppText } from './app-text';
export type { AppTextProps, AppTextTone } from './app-text';

export { Icon } from './icon';
export type { IconName, IconProps } from './icon';

export { Button } from './button';
export type { ButtonProps, ButtonSize, ButtonVariant } from './button';

export { Card } from './card';
export type { CardPadding, CardProps, CardVariant } from './card';

export { Chip } from './chip';
export type { ChipProps, ChipTone } from './chip';

export { Divider } from './divider';
export type { DividerProps } from './divider';

export { SectionHeader } from './section-header';
export type { SectionHeaderProps } from './section-header';

export { ListRow } from './list-row';
export type { ListRowProps } from './list-row';

export { Screen } from './screen';
export type { ScreenPadding, ScreenProps } from './screen';

export { EmptyState } from './empty-state';
export type { EmptyStateProps } from './empty-state';

export { ErrorState } from './error-state';
export type { ErrorStateProps } from './error-state';

export { InlineBanner } from './inline-banner';
export type {
  InlineBannerAction,
  InlineBannerProps,
  InlineBannerTone,
} from './inline-banner';

export { Skeleton, SkeletonList, useReducedMotion } from './skeleton';
export type { SkeletonListProps, SkeletonProps } from './skeleton';

export { confirmAction } from './confirm-action';
export type { ConfirmActionOptions } from './confirm-action';

export { useRefresh } from './use-refresh';
export type { UseRefreshResult } from './use-refresh';
