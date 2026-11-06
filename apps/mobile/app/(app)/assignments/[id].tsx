/**
 * 역할: 과제 상세 라우트 진입점(/assignments/[id])
 * 사용 위치: app/(app)/assignments/[id].tsx
 * 주요 기능: 경로 파라미터 id를 읽어 AssignmentDetailScreen에 전달
 */
import { useLocalSearchParams } from 'expo-router';
import { AssignmentDetailScreen } from '../../../src/features/assignments/assignment-detail-screen';

export default function AssignmentDetailRoute() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
  return <AssignmentDetailScreen assignmentId={rawId ?? ''} />;
}
