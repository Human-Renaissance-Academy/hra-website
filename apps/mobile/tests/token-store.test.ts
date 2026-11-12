/** SecureStore 네이티브 경계는 가짜 어댑터로 검증하며 토큰이 저장 DTO를 벗어나지 않게 검사합니다. */
import { createTokenStore } from '../src/auth/token-store';
import { tokens, user } from './auth-fixtures';

function fixture(text: string | null = null) {
  const storage = { getItemAsync: jest.fn(async () => text), setItemAsync: jest.fn(async () => undefined), deleteItemAsync: jest.fn(async () => undefined) };
  return { storage, store: createTokenStore(storage) };
}
test.each(['{broken', '{}', '{"refreshToken":3}'])('손상된 값 %s는 빈 세션으로 처리한다', async (text) => {
  // Given
  const { store } = fixture(text);
  // When
  const value = await store.read();
  // Then
  expect(value).toBeNull();
});
test('저장소를 사용할 수 없어도 읽기는 충돌하지 않는다', async () => {
  // Given
  const { storage, store } = fixture();
  storage.getItemAsync.mockRejectedValue(new Error('fake native failure'));
  // When
  const value = await store.read();
  // Then
  expect(value).toBeNull();
});
test('갱신 토큰과 최소 프로필만 저장하고 생체 인증을 요구하지 않는다', async () => {
  // Given
  const { storage, store } = fixture();
  // When
  await store.write({ refreshToken: tokens.refreshToken, refreshTokenExpiresAt: tokens.refreshTokenExpiresAt, user });
  // Then
  expect(storage.setItemAsync).toHaveBeenCalledWith(expect.any(String), JSON.stringify({ refreshToken: tokens.refreshToken, refreshTokenExpiresAt: tokens.refreshTokenExpiresAt, user }), expect.objectContaining({ requireAuthentication: false }));
});
test('회전 저장 실패를 정형 오류로 반환한다', async () => {
  // Given
  const { storage, store } = fixture();
  storage.setItemAsync.mockRejectedValue(new Error('fake native failure'));
  // When / Then
  await expect(store.write({ refreshToken: tokens.refreshToken, refreshTokenExpiresAt: tokens.refreshTokenExpiresAt, user })).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE' });
});
