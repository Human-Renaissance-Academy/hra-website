/**
 * 역할: 내 과제 및 제출 화면의 순수 뷰모델·상태 전이 단위 테스트
 * 사용 위치: Jest 테스트 스위트 (npm test)
 * 주요 기능:
 * - 고정 시각 기준 상태 칩(제출 완료 / 미제출 / 마감됨: CLOSED 또는 dueAt <= now 경계) 판정 검증
 * - 목록 평탄화, 상세 뷰모델(기본 액션 노출 조건, 재개 배너, 제출 파일 메타) 검증
 * - 문서 선택 검증(비어 있지 않은 50MiB 이하 PDF 한 개) 및 SubmitEvent/SubmitResult 상태 전이 검증
 */
import {
  flattenAssignmentPages,
  isAssignmentOpenForSubmission,
  resolveAssignmentStatusChip,
  toAssignmentCardViewModel,
  toAssignmentDetailViewModel,
} from '../src/features/assignments/assignment-view-model';
import { assignmentsStrings } from '../src/features/assignments/strings';
import {
  createInitialSubmitViewState,
  parsePickedPdfAssets,
  reduceSubmitEvent,
  reduceSubmitResult,
} from '../src/features/assignments/submission-view-model';
import { assignmentId, saved, submitted } from './submission-fixtures';

const FIXED_NOW = '2026-11-05T10:00:00.000Z';

describe('resolveAssignmentStatusChip & isAssignmentOpenForSubmission', () => {
  test.each([
    [
      '제출 내역이 있으면 마감 이후나 CLOSED여도 제출 완료를 반환한다',
      {
        status: 'CLOSED' as const,
        dueAt: '2026-11-01T00:00:00.000Z',
        submission: { submissionId: 'sub-1', submittedAt: '2026-10-31T12:00:00.000Z' },
      },
      'submitted',
      assignmentsStrings.status.submitted,
      'success',
      false,
    ],
    [
      '미제출이고 PUBLISHED이며 마감 1ms 전이면 미제출을 반환하고 제출이 가능하다',
      {
        status: 'PUBLISHED' as const,
        dueAt: '2026-11-05T10:00:00.001Z',
        submission: null,
      },
      'unsubmitted',
      assignmentsStrings.status.unsubmitted,
      'warning',
      true,
    ],
    [
      '미제출이고 마감 시각과 정확히 같으면(dueAt === now) 마감됨을 반환하고 제출을 닫는다',
      {
        status: 'PUBLISHED' as const,
        dueAt: FIXED_NOW,
        submission: null,
      },
      'closed',
      assignmentsStrings.status.closed,
      'danger',
      false,
    ],
    [
      '미제출이고 마감이 지났으면 마감됨을 반환한다',
      {
        status: 'PUBLISHED' as const,
        dueAt: '2026-11-05T09:59:59.999Z',
        submission: null,
      },
      'closed',
      assignmentsStrings.status.closed,
      'danger',
      false,
    ],
    [
      '마감 전이어도 status가 CLOSED이면 마감됨을 반환한다',
      {
        status: 'CLOSED' as const,
        dueAt: '2026-11-10T00:00:00.000Z',
        submission: null,
      },
      'closed',
      assignmentsStrings.status.closed,
      'danger',
      false,
    ],
  ])('%s', (_label, item, expectedKind, expectedLabel, expectedTone, expectedOpen) => {
    // Given / When
    const chip = resolveAssignmentStatusChip(item, FIXED_NOW);
    const open = isAssignmentOpenForSubmission(item, FIXED_NOW);
    // Then
    expect(chip).toMatchObject({
      kind: expectedKind,
      label: expectedLabel,
      tone: expectedTone,
    });
    expect(open).toBe(expectedOpen);
  });
});

describe('toAssignmentCardViewModel & toAssignmentDetailViewModel', () => {
  test('목록 카드와 상세 뷰모델은 KST 마감 일시, 파일 크기, 재개 배너, 제출 액션 레이블을 계산한다', () => {
    // Given
    const detail = {
      assignmentId,
      targetId: '44444444-4444-4444-8444-444444444444',
      title: '1주차 독서 에세이',
      status: 'PUBLISHED' as const,
      dueAt: '2026-11-07T14:59:00.000Z',
      publishedAt: '2026-11-01T00:00:00.000Z',
      instructions: '첫째 줄 안내\n둘째 줄 안내',
      submission: {
        submissionId: '55555555-5555-4555-8555-555555555555',
        submittedAt: '2026-11-04T03:30:00.000Z',
      },
      file: {
        fileId: '66666666-6666-4666-8666-666666666666',
        originalName: '에세이.pdf',
        mimeType: 'application/pdf' as const,
        sizeBytes: 2048,
      },
    };

    // When
    const card = toAssignmentCardViewModel(detail, FIXED_NOW);
    const detailVm = toAssignmentDetailViewModel(detail, FIXED_NOW, saved);

    // Then
    expect(card.dueDateTimeText).toBe('마감: 2026.11.07 23:59');
    expect(card.dueCountdownText).toBe('D-2');
    expect(card.statusChip.label).toBe('제출 완료');
    expect(card.submittedAtText).toBe('제출 시각: 2026.11.04 12:30');

    expect(detailVm.instructionsText).toBe('첫째 줄 안내\n둘째 줄 안내');
    expect(detailVm.primarySubmitLabel).toBe('다시 제출하기');
    expect(detailVm.showResumeBanner).toBe(true);
    expect(detailVm.submittedFile).toMatchObject({
      fileName: '에세이.pdf',
      fileSizeText: '2.0 KiB',
      fileMetaText: '에세이.pdf (2.0 KiB)',
      submittedAtText: '제출 시각: 2026.11.04 12:30',
    });
  });

  test('페이지 병합 시 중복 targetId를 제거하고 빈 지침은 기본 문구로 대체한다', () => {
    // Given
    const item = {
      assignmentId,
      targetId: 'target-1',
      title: '과제 1',
      status: 'PUBLISHED' as const,
      dueAt: '2026-11-07T00:00:00.000Z',
      publishedAt: '2026-11-01T00:00:00.000Z',
      submission: null,
    };
    const pages = [
      { assignments: [item], page: { page: 1, pageSize: 20, hasNextPage: true } },
      { assignments: [item], page: { page: 2, pageSize: 20, hasNextPage: false } },
    ];

    // When
    const flattened = flattenAssignmentPages(pages);
    const detailVm = toAssignmentDetailViewModel(
      { ...item, instructions: '   ', file: null },
      FIXED_NOW,
      null,
    );

    // Then
    expect(flattened).toHaveLength(1);
    expect(detailVm.instructionsText).toBe(assignmentsStrings.detail.emptyInstructions);
    expect(detailVm.primarySubmitLabel).toBe('제출하기');
    expect(detailVm.showResumeBanner).toBe(false);
  });
});

describe('parsePickedPdfAssets & reduceSubmitEvent', () => {
  test.each([
    ['선택 취소/빈 배열', []],
    ['파일 2개 이상 선택', [
      { uri: 'cache://a.pdf', name: 'a.pdf', size: 100, mimeType: 'application/pdf' },
      { uri: 'cache://b.pdf', name: 'b.pdf', size: 100, mimeType: 'application/pdf' },
    ]],
    ['0바이트 파일', [{ uri: 'cache://empty.pdf', name: 'empty.pdf', size: 0, mimeType: 'application/pdf' }]],
    ['50MiB 초과 파일', [{ uri: 'cache://huge.pdf', name: 'huge.pdf', size: 50 * 1024 * 1024 + 1, mimeType: 'application/pdf' }]],
    ['PDF가 아닌 MIME', [{ uri: 'cache://note.txt', name: 'note.txt', size: 120, mimeType: 'text/plain' }]],
    ['공백 파일명', [{ uri: 'cache://blank.pdf', name: '   ', size: 120, mimeType: 'application/pdf' }]],
  ])('유효하지 않은 PDF 선택(%s)은 지정된 한국어 안내 문구를 반환한다', (_caseName, assets) => {
    // Given / When / Then
    expect(parsePickedPdfAssets(assets)).toEqual({
      ok: false,
      message: '비어 있지 않은 PDF 파일 한 개를 50MiB 이하로 선택해 주세요.',
    });
  });

  test('유효한 PDF 한 개는 공백 제거된 이름과 파일 크기 텍스트를 반환한다', () => {
    // Given / When / Then
    expect(
      parsePickedPdfAssets([
        {
          uri: 'cache://valid.pdf',
          name: '  과제제출본.pdf  ',
          size: 1024 * 1024,
          mimeType: 'application/pdf',
        },
      ]),
    ).toEqual({
      ok: true,
      file: {
        uri: 'cache://valid.pdf',
        name: '과제제출본.pdf',
        sizeBytes: 1024 * 1024,
        mimeType: 'application/pdf',
      },
      fileSizeText: '1.0 MiB',
    });
  });

  test.each([
    [{ state: 'validating' as const }, 'validating', true, true, assignmentsStrings.submit.steps.validating],
    [{ state: 'creatingIntent' as const }, 'creatingIntent', true, true, assignmentsStrings.submit.steps.creatingIntent],
    [{ state: 'authorizing' as const }, 'authorizing', true, true, assignmentsStrings.submit.steps.authorizing],
    [{ state: 'uploading' as const, percentage: 42.4 }, 'uploading', true, true, '파일을 전송하고 있습니다 (42%)'],
    [{ state: 'verifying' as const }, 'verifying', true, true, assignmentsStrings.submit.steps.verifying],
    [{ state: 'finalizing' as const }, 'finalizing', true, true, assignmentsStrings.submit.steps.finalizing],
    [{ state: 'cancelling' as const }, 'cancelling', true, false, assignmentsStrings.submit.steps.cancelling],
    [{ state: 'cancelled' as const }, 'cancelled', false, false, assignmentsStrings.submit.steps.cancelled],
  ])('이벤트 %o를 받으면 단계 %s로 전이한다', (event, expectedStep, isRunning, canCancel, expectedMessage) => {
    // Given
    const initial = createInitialSubmitViewState(false);
    // When
    const next = reduceSubmitEvent(initial, event, 1000);
    // Then
    expect(next.step).toBe(expectedStep);
    expect(next.isRunning).toBe(isRunning);
    expect(next.canCancel).toBe(canCancel);
    expect(next.statusMessage).toBe(expectedMessage);
  });

  test('성공 결과에서 일반 제출과 replayed 제출의 안내 문구를 구분한다', () => {
    // Given
    const initial = createInitialSubmitViewState(false);
    // When
    const freshSuccess = reduceSubmitResult(initial, { kind: 'success', submission: submitted }, 1000);
    const replayedSuccess = reduceSubmitResult(
      initial,
      { kind: 'success', submission: { ...submitted, replayed: true } },
      1000,
    );
    // Then
    expect(freshSuccess.step).toBe('success');
    expect(freshSuccess.completionDescription).toBe(assignmentsStrings.submit.steps.successDescription);
    expect(replayedSuccess.completionDescription).toBe(assignmentsStrings.submit.steps.replayedDescription);
  });
});
