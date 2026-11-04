/** 실제 기기 인셋을 제공할 수 없는 Jest 환경에서 공식 SafeArea 테스트 어댑터를 사용합니다. */
import mockSafeAreaContext from 'react-native-safe-area-context/jest/mock';
import { TextInput } from 'react-native';
import { MockIonicons } from './mock-ionicons';
jest.mock('react-native-safe-area-context', () => mockSafeAreaContext);
jest.mock('@expo/vector-icons/Ionicons', () => ({ __esModule: true, default: MockIonicons }));
// RN의 지연 모듈 로딩은 테스트 준비 단계에서 완료하여 렌더 동작 시간과 분리합니다.
void TextInput;
