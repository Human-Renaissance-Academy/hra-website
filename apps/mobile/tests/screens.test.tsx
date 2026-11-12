/** 실제 탭·로그인 화면의 한국어 접근성 제목과 테마를 네트워크 없이 검증합니다. */
import HomeScreen from '../app/(app)/(tabs)/index';
import NoticesScreen from '../app/(app)/(tabs)/notices';
import ScheduleScreen from '../app/(app)/(tabs)/schedule';
import ResourcesScreen from '../app/(app)/(tabs)/resources';
import ProfileScreen from '../app/(app)/(tabs)/profile';
import LoginScreen from '../app/(auth)/login';
import { theme } from '../src/theme';
import { renderWithProviders } from './test-providers';

jest.mock('../src/auth/runtime', () => ({
  // 제목 스모크 테스트에서는 응답보다 화면 진입이 중요하므로 타이머 없는 대기 요청을 사용합니다.
  getApiClient: () => ({ GET: () => new Promise<never>(() => undefined) }),
  getSessionManager: jest.fn(),
}));

test.each([
  [HomeScreen, '홈'], [NoticesScreen, '공지'], [ScheduleScreen, '일정'],
  [ResourcesScreen, '자료실'], [ProfileScreen, '내 정보'], [LoginScreen, '로그인'],
] as const)('화면 %p에 접근 가능한 제목 %s를 표시한다', async (Screen, title) => {
  // 준비/실행: 네트워크 없이 실제 화면 컴포넌트를 마운트합니다.
  const view = await renderWithProviders(<Screen />, { auth: {
    status: 'signedIn', user: { id: 'header-member', name: '회원', role: 'MEMBER' }, role: 'MEMBER',
  } });
  // 검증: 제목은 보조기술에 노출되며 웹과 같은 주 텍스트 색을 사용합니다.
  expect(view.getByRole('header', { name: title })).toHaveStyle({ color: theme.colors.text });
});
