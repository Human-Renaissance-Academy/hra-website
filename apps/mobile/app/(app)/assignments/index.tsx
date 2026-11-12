/**
 * 역할: 내 과제 목록 라우트 진입점(/assignments)
 * 사용 위치: app/(app)/assignments/index.tsx (홈 내 과제 카드 및 내 정보 내 과제 행에서 이동)
 * 주요 기능: AssignmentListScreen 렌더링
 */
import { AssignmentListScreen } from '../../../src/features/assignments/assignment-list-screen';

export default function AssignmentsIndexRoute() {
  return <AssignmentListScreen />;
}
