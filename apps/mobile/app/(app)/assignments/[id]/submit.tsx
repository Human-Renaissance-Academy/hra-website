/**
 * 역할: 과제 제출 흐름 라우트 진입점(/assignments/[id]/submit)
 * 사용 위치: app/(app)/assignments/[id]/submit.tsx
 * 주요 기능: 경로 파라미터 id와 선택적 mode(resume)를 읽어 AssignmentSubmitScreen에 전달
 */
import { useLocalSearchParams } from 'expo-router';
import { AssignmentSubmitScreen } from '../../../../src/features/assignments/assignment-submit-screen';

export default function AssignmentSubmitRoute() {
  const params = useLocalSearchParams<{ id?: string | string[]; mode?: string | string[] }>();
  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
  const rawMode = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  return (
    <AssignmentSubmitScreen
      assignmentId={rawId ?? ''}
      initialMode={rawMode === 'resume' ? 'resume' : 'new'}
    />
  );
}
