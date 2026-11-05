/** 로그인 입력·실패·대기시간과 승인 경로의 사용자 관찰 결과를 네이티브 렌더러로 검증합니다. */
import { act, fireEvent, render } from '@testing-library/react-native';
import { Platform, Text } from 'react-native';
import { AuthContext } from '../src/auth/auth-context';
import { LoginScreen } from '../src/auth/login-screen';
import { PendingScreen } from '../src/auth/pending-screen';
import { RouteGuard } from '../src/auth/route-guard';
import { ApiError } from '../src/api/errors';
import { authValue } from './screen-fixtures';
import { ko } from '../src/i18n/ko';

jest.mock('expo-router', () => {
  const { Text: MockText } = jest.requireActual<typeof import('react-native')>('react-native');
  return { Redirect: ({ href }: { readonly href: string }) => <MockText testID="redirect">{href}</MockText> };
});

test('올바른 입력은 로그인 동작을 호출하고 비밀번호를 지운다', async () => {
  // Given
  const auth = authValue();
  const view = await render(<AuthContext.Provider value={auth}><LoginScreen /></AuthContext.Provider>);
  await fireEvent.changeText(view.getByLabelText(ko.auth.email), 'fake@example.test');
  await fireEvent.changeText(view.getByLabelText(ko.auth.password), 'fake-password');
  // When
  await fireEvent.press(view.getByRole('button', { name: ko.login }));
  // Then
  expect(auth.login).toHaveBeenCalledWith('fake@example.test', 'fake-password', expect.objectContaining({ platform: Platform.OS === 'ios' ? 'IOS' : 'ANDROID' }));
  expect(view.getByLabelText(ko.auth.password)).toHaveProp('value', '');
});

test('자격 증명 오류는 한국어 안내를 표시한다', async () => {
  // Given
  const auth = authValue({ login: async () => { throw new ApiError({ status: 401, code: 'UNAUTHENTICATED' }); } });
  const view = await render(<AuthContext.Provider value={auth}><LoginScreen /></AuthContext.Provider>);
  await fireEvent.changeText(view.getByLabelText(ko.auth.email), 'fake@example.test');
  await fireEvent.changeText(view.getByLabelText(ko.auth.password), 'fake-password');
  // When
  await fireEvent.press(view.getByRole('button', { name: ko.login }));
  // Then
  expect(view.getByRole('alert')).toHaveTextContent(ko.errors.credentials);
});

test('429는 카운트다운 동안 재제출을 막는다', async () => {
  // Given
  jest.useFakeTimers();
  const login = jest.fn(async () => { throw new ApiError({ status: 429, code: 'RATE_LIMITED', retryAfterSeconds: 2 }); });
  const view = await render(<AuthContext.Provider value={authValue({ login })}><LoginScreen /></AuthContext.Provider>);
  await fireEvent.changeText(view.getByLabelText(ko.auth.email), 'fake@example.test');
  await fireEvent.changeText(view.getByLabelText(ko.auth.password), 'fake-password');
  // When
  await fireEvent.press(view.getByRole('button', { name: ko.login }));
  // Then
  expect(view.getByRole('button', { name: ko.login })).toBeDisabled();
  await act(async () => { jest.advanceTimersByTime(2000); });
  expect(view.getByRole('button', { name: ko.login })).toBeEnabled();
  await view.unmount();
  jest.useRealTimers();
});

test('승인 대기 화면은 안내와 로그아웃을 제공한다', async () => {
  // Given
  const auth = authValue();
  const view = await render(<AuthContext.Provider value={auth}><PendingScreen /></AuthContext.Provider>);
  // When
  await fireEvent.press(view.getByRole('button', { name: ko.auth.logout }));
  // Then
  expect(view.getByRole('header')).toHaveTextContent(ko.auth.pending);
  expect(auth.logout).toHaveBeenCalledTimes(1);
});

test('로그아웃 사용자는 보호 경로에서 로그인으로 이동한다', async () => {
  // Given
  const auth = authValue();
  // When
  const view = await render(<AuthContext.Provider value={auth}><RouteGuard scope="app"><Text>보호 내용</Text></RouteGuard></AuthContext.Provider>);
  // Then
  expect(view.getByTestId('redirect')).toHaveTextContent('/(auth)/login');
  expect(view.queryByText('보호 내용')).toBeNull();
});

test('대기 사용자는 보호 경로에서 승인 대기로 이동한다', async () => {
  // Given
  const auth = authValue({ status: 'signedIn', isPending: true });
  // When
  const view = await render(<AuthContext.Provider value={auth}><RouteGuard scope="app"><Text>보호 내용</Text></RouteGuard></AuthContext.Provider>);
  // Then
  expect(view.getByTestId('redirect')).toHaveTextContent('/pending');
});
