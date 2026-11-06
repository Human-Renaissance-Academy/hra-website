/** 승인 대기 경로입니다. 딥링크로 들어와도 승인 상태에 맞는 고정 경로로만 이동합니다. */
import { RouteGuard } from '../src/auth/route-guard';
import { PendingScreen } from '../src/auth/pending-screen';
export default function PendingRoute() { return <RouteGuard scope="pending"><PendingScreen /></RouteGuard>; }
