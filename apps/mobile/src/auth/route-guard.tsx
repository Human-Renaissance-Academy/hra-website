/** 고정된 내부 목적지만 사용하는 경로 가드입니다. 딥링크 쿼리의 redirect 값은 읽지 않습니다. */
import { Redirect } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useAuth } from './use-auth';
import { ko } from '../i18n/ko';
import { theme } from '../theme';

export function SessionLoading() {
  return <View style={{ flex: 1, justifyContent: 'center', padding: theme.spacing.lg, gap: theme.spacing.md }}>
    <ActivityIndicator accessibilityLabel={ko.auth.loading} />
    <Text>{ko.auth.loading}</Text>
  </View>;
}
export function RouteGuard({ children, scope }: { readonly children: ReactNode; readonly scope: 'auth' | 'pending' | 'app' }) {
  const auth = useAuth();
  switch (auth.status) {
    case 'loading': return <SessionLoading />;
    case 'signedOut': return scope === 'auth' ? children : <Redirect href="/(auth)/login" />;
    case 'signedIn': {
      const target = auth.isPending ? 'pending' : 'app';
      return scope === target ? children : <Redirect href={auth.isPending ? '/pending' : '/(app)/(tabs)'} />;
    }
    default: { const exhaustive: never = auth.status; return exhaustive; }
  }
}
