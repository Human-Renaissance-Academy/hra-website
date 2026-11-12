/** 인증 화면 그룹입니다. 시스템 뒤로 가기 버튼에도 한국어 제목을 적용합니다. */
import { Stack } from 'expo-router';
import { ko } from '../../src/i18n/ko';
import { RouteGuard } from '../../src/auth/route-guard';
export default function AuthLayout() { return <RouteGuard scope="auth"><Stack screenOptions={{ title: ko.login, headerShown: false }} /></RouteGuard>; }
