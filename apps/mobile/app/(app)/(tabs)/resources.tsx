/**
 * 역할: 자료실(Resources) 탭 라우트 진입점
 * 사용 위치: app/(app)/(tabs)/resources.tsx
 * 주요 기능:
 * - 루트 공급자의 공유 캐시를 사용하는 ResourcesScreenView 렌더링
 */
import { ResourcesScreenView } from '../../../src/features/resources/resources-screen';

export default function ResourcesScreen() {
  return <ResourcesScreenView />;
}
