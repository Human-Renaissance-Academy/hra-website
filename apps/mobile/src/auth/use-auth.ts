/** 화면용 인증 훅입니다. 공급자 누락은 개발 계약 오류로 즉시 드러나게 합니다. */
import { useContext } from 'react';
import { AuthContext } from './auth-context';
import { ApiError } from '../api/errors';

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new ApiError({ status: 0, code: 'UNAVAILABLE' });
  return context;
}
