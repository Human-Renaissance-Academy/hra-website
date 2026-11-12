/** 루트 공급자와 세션 복원 로딩을 연결합니다. 자식 경로는 그룹별 고정 목적지 가드를 통과합니다. */
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { createQueryClient } from '../src/query/client';
import { AuthProvider } from '../src/auth/auth-provider';
import { useAuth } from '../src/auth/use-auth';
import { SessionLoading } from '../src/auth/route-guard';
import { SessionNotice } from '../src/auth/session-notice';
import { AccountLifecycle } from '../src/features/account/account-lifecycle';

function Navigation() {
  const { status } = useAuth();
  if (status === 'loading') return <SessionLoading />;
  return <><StatusBar style="dark" /><SafeAreaView edges={['top']}><SessionNotice /></SafeAreaView><Stack screenOptions={{ headerShown: false }}>
    <Stack.Screen name="(app)" />
    <Stack.Screen name="(auth)" />
    <Stack.Screen name="pending" />
  </Stack></>;
}
export default function RootLayout() {
  const [queryClient] = useState(createQueryClient);
  return <SafeAreaProvider><QueryClientProvider client={queryClient}><AuthProvider>
    <AccountLifecycle />
    <Navigation />
  </AuthProvider></QueryClientProvider></SafeAreaProvider>;
}
