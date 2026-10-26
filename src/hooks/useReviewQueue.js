import { useCallback, useState } from 'react';
import { getReviewQueue, reviewCandidate } from '../api/endpoints.js';
import { createValidationError, getErrorMessage } from '../api/errors.js';
import { toDecisionCard } from '../api/models.js';
import { DECISION_CHANGED_TAGS, TAGS, invalidate } from './queryBus.js';
import { useApiMutation } from './useApiMutation.js';
import { useApiQuery } from './useApiQuery.js';

/**
 * 검수 큐 목록.
 * @param {string|null} guildId
 * @param {{ status?: 'IN_REVIEW'|'ON_HOLD', page?: number, size?: number }} [params]
 */
export function useReviewQueue(guildId, { status = 'IN_REVIEW', page = 1, size = 20 } = {}) {
  const query = useApiQuery((signal) => getReviewQueue(guildId, { status, page, size }, { signal }), {
    deps: [status, page, size],
    scopeKey: guildId,
    enabled: Boolean(guildId),
    tags: [TAGS.REVIEW_QUEUE],
  });

  return {
    ...query,
    /** 원본 티켓 (검수 요청에 그대로 넘김) */
    tickets: query.data?.items ?? [],
    /** 카드 표시용 */
    cards: (query.data?.items ?? []).map(toDecisionCard),
    pageInfo: query.data?.pageInfo ?? { currentPage: page, pageSize: size, totalElements: 0, totalPages: 0 },
    isEmpty: query.isSuccess && query.data.items.length === 0,
  };
}

const REVIEW_ERROR_MESSAGES = {
  403: '이 서버의 후보를 검수할 권한이 없어요.',
  404: '이미 삭제되었거나 존재하지 않는 후보예요.',
  409: '이미 처리되었거나 다른 팀원이 먼저 수정한 후보예요. 최신 목록을 불러왔으니 다시 확인해 주세요.',
};

/**
 * 확정 / 보류 / 삭제 액션. 삭제(reject)는 저장되지 않고 검수 큐에서 제거된다 (사용자 플로우 1-3).
 * 409(버전 충돌)일 때 최신 버전을 자동 대입해 재요청하지 않는다 → 목록만 새로고침 (API 명세 5장)
 *
 * @example
 * const { confirm, defer, reject, pendingId, errorMessage } = useReviewAction(guildId);
 * <button disabled={pendingId === t.id} onClick={() => confirm(t)}>확정</button>
 */
export function useReviewAction(guildId, { onSuccess } = {}) {
  const [pendingId, setPendingId] = useState(null);

  const mutation = useApiMutation(
    (ticket, action, extra = {}) => {
      if (typeof ticket?.version !== 'number') {
        throw createValidationError({ version: '후보 버전 정보가 없어요. 목록을 새로고침해 주세요.' });
      }
      return reviewCandidate(guildId, ticket.ticketId ?? ticket.id, {
        ...extra, // title·rationale 등 검수하면서 고친 값, resolution=replace 관련 필드
        action,
        expectedVersion: ticket.version,
      });
    },
    {
      invalidates: DECISION_CHANGED_TAGS,
      onSuccess,
      onError: (error) => {
        if (error.status === 409 || error.status === 404) invalidate(TAGS.REVIEW_QUEUE);
      },
    },
  );

  const run = useCallback(
    async (ticket, action, extra) => {
      setPendingId(ticket.id);
      try {
        return await mutation.mutateAsync(ticket, action, extra);
      } catch {
        return null; // 오류는 error / errorMessage로 표시
      } finally {
        setPendingId(null);
      }
    },
    [mutation.mutateAsync],
  );

  return {
    /** extra 예: { resolution: 'independent' } 또는 { title: '수정한 제목' } */
    confirm: (ticket, extra) => run(ticket, 'confirm', extra),
    /**
     * 기존 결정을 대체하며 확정. predecessor도 최신 버전을 조회한 상태여야 함.
     * taskDispositions: [{ actionItemId, disposition: 'cancel'|'transfer', classification?: 'open'|'completed' }]
     */
    confirmReplacing: (ticket, predecessor, taskDispositions = [], extra) =>
      run(ticket, 'confirm', {
        ...extra,
        resolution: 'replace',
        predecessorId: predecessor.id,
        predecessorVersion: predecessor.version,
        taskDispositions,
      }),
    defer: (ticket, extra) => run(ticket, 'defer', extra),
    reject: (ticket, extra) => run(ticket, 'reject', extra),
    /** 처리 중인 티켓 id → 해당 카드 버튼만 비활성화 */
    pendingId,
    isPending: mutation.isPending,
    error: mutation.error,
    errorMessage: getErrorMessage(mutation.error, REVIEW_ERROR_MESSAGES),
    isConflict: mutation.error?.status === 409,
    reset: mutation.reset,
  };
}
