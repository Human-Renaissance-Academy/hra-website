/**
 * 역할: 이메일/비밀번호 로그인 폼 화면 컴포넌트
 * 사용 위치: app/(auth)/login.tsx
 * 주요 기능:
 * - 공통 UI 키트(Screen, AppText, Button, InlineBanner) 기반 단일 열 폼 렌더링
 * - 비밀번호를 보존·기록하지 않고 로그인 완료 시 입력 상태에서 즉시 제거
 * - 429 속도 제한 대기시간을 절대 시각으로 계산해 앱 정지/복귀 후에도 카운트다운 유지
 */
import { useEffect, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { Platform, Pressable, TextInput, View } from 'react-native';
import Constants from 'expo-constants';
import { ApiError, toKoreanMessage } from '../api/errors';
import { ko } from '../i18n/ko';
import { AppText, Button, InlineBanner, Screen } from '../ui';
import { useAuth } from './use-auth';
import { authStyles as styles } from './screen-styles';

export function LoginScreen() {
  const auth = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [retryAt, setRetryAt] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const passwordInput = useRef<ComponentRef<typeof TextInput>>(null);
  const submitting = useRef(false);

  useEffect(() => {
    if (!retryAt) return;
    const update = () => setRemaining(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [retryAt]);

  async function submit() {
    if (submitting.current || Date.now() < retryAt) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || !password) {
      setMessage(ko.auth.invalid);
      return;
    }
    submitting.current = true;
    setBusy(true);
    setMessage(null);
    try {
      await auth.login(email.trim(), password, {
        platform: Platform.OS === 'ios' ? 'IOS' : 'ANDROID',
        appVersion: Constants.expoConfig?.version ?? '0.1.0',
      });
      setPassword('');
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      setMessage(toKoreanMessage(error, 'login'));
      if (error.status === 429) {
        const seconds = error.retryAfterSeconds ?? 60;
        setRetryAt(Date.now() + seconds * 1000);
        setRemaining(seconds);
      }
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  const alertMessage =
    remaining > 0
      ? toKoreanMessage(
          new ApiError({ status: 429, code: 'RATE_LIMITED', retryAfterSeconds: remaining }),
        )
      : message;

  return (
    <Screen scroll keyboardAvoiding padding="lg" centered>
      <AppText variant="title">{ko.login}</AppText>
      <View style={styles.fieldGroup}>
        <AppText variant="label">{ko.auth.email}</AppText>
        <TextInput
          accessibilityLabel={ko.auth.email}
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="username"
          editable={!busy}
          returnKeyType="next"
          onSubmitEditing={() => passwordInput.current?.focus()}
        />
      </View>
      <View style={styles.fieldGroup}>
        <AppText variant="label">{ko.auth.password}</AppText>
        <TextInput
          ref={passwordInput}
          accessibilityLabel={ko.auth.password}
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!visible}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="current-password"
          textContentType="password"
          editable={!busy}
          returnKeyType="go"
          onSubmitEditing={() => {
            void submit();
          }}
        />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={visible ? ko.auth.hidePassword : ko.auth.showPassword}
        accessibilityState={{ expanded: visible }}
        style={styles.secondaryButton}
        onPress={() => setVisible((value) => !value)}
      >
        <AppText variant="label" tone="secondary">
          {visible ? ko.auth.hidePassword : ko.auth.showPassword}
        </AppText>
      </Pressable>
      {alertMessage ? (
        <InlineBanner
          tone={remaining > 0 ? 'warning' : 'danger'}
          message={alertMessage}
        />
      ) : null}
      <Button
        label={ko.login}
        loadingLabel={ko.auth.submitting}
        accessibilityLabel={ko.login}
        loading={busy}
        disabled={busy || remaining > 0}
        fullWidth
        onPress={() => {
          void submit();
        }}
      />
    </Screen>
  );
}
