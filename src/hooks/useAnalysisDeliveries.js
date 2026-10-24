import { useCallback, useRef, useState } from 'react';
import { getAnalysisDeliveries, retryAnalysisRequest } from '../api/endpoints.js';
import { getErrorMessage } from '../api/errors.js';
import { TAGS, invalidate } from './queryBus.js';
import { useApiMutation } from './useApiMutation.js';
import { useApiQuery } from './useApiQuery.js';

const POLL_MS = 5000;
const RETRY_WAIT_LIMIT_MS = 2 * 60 * 1000; // 재시도 결과를 이 시간까지만 기다리며 polling
const IN_PROGRESS = new Set(['pending', 'retry-pending']);

const newCommandId = () =>
  globalThis.crypto?.randomUUID?.() ??
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

/**
 * 재시도 접수 후 아직 결과가 반영되지 않았는지.
 * 접수 시점의 status·attempts가 그대로면 Bot이 아직 처리하지 않은 것으로 본다.
 */
const isAwaitingResult = (request, snapshot) =>
  Boolean(
    snapshot &&
      Date.now() - snapshot.at < RETRY_WAIT_LIMIT_MS &&
      request.status === snapshot.status &&
      request.attempts === snapshot.attempts,
  );

/**
 * 분석 실패 목록 · 재시도.
 * - 진행 중(pending/retry-pending) 항목이나 재시도 결과를 기다리는 항목이 있으면 자동 polling
 * - available=false면 실시간 상태가 아니므로 빈 목록·성공으로 해석하지 않는다 (isStale)
 * - 202 접수 ≠ 분석 완료. 완료 안내는 목록 status가 completed-* 가 된 뒤에 한다
 */
export function useAnalysisDeliveries(guildId) {
  // requestId → 재시도 접수 시점 스냅샷
  const [snapshots, setSnapshots] = useState({});
  const [retryingId, setRetryingId] = useState(null);

  const query = useApiQuery((signal) => getAnalysisDeliveries(guildId, { signal }), {
    scopeKey: guildId,
    enabled: Boolean(guildId),
    tags: [TAGS.ANALYSIS],
    refetchInterval: (data) =>
      data.requests.some((r) => IN_PROGRESS.has(r.status) || isAwaitingResult(r, snapshots[r.requestId]))
        ? POLL_MS
        : false,
  });

  // 같은 명령의 재전송(네트워크 실패 후 다시 누름)에는 같은 commandId 유지
  const commandIdsRef = useRef({});

  const mutation = useApiMutation(
    (request) => {
      commandIdsRef.current[request.requestId] ??= newCommandId();
      return retryAnalysisRequest(guildId, request.requestId, commandIdsRef.current[request.requestId]);
    },
    {
      onSuccess: (_command, request) => {
        delete commandIdsRef.current[request.requestId];
        setSnapshots((prev) => ({
          ...prev,
          [request.requestId]: { status: request.status, attempts: request.attempts, at: Date.now() },
        }));
        invalidate(TAGS.ANALYSIS);
      },
      onError: (error, request) => {
        // 서버가 응답한 실패면 그 명령은 끝난 것 → 다음 시도는 새 commandId
        if (!error.isNetworkError) delete commandIdsRef.current[request.requestId];
        if (error.status === 409) invalidate(TAGS.ANALYSIS); // 이미 상태가 바뀜 → 최신 목록 확인
      },
    },
  );

  /** @param {object} request 목록의 항목 (requestId·status·attempts 사용) */
  const retry = useCallback(
    async (request) => {
      setRetryingId(request.requestId);
      try {
        return await mutation.mutateAsync(request);
      } catch {
        return null;
      } finally {
        setRetryingId(null);
      }
    },
    [mutation.mutateAsync],
  );

  const data = query.data;
  const requests = (data?.requests ?? []).map((r) => {
    const isRetrying = isAwaitingResult(r, snapshots[r.requestId]);
    return {
      ...r,
      /** 재시도 접수됨, 결과 대기 중 */
      isRetrying,
      canRetry: r.status === 'retained-failure' && !isRetrying,
      /** 0이면 일정 없음 → 날짜로 표시하지 않음 */
      nextAttemptDate: r.nextAttemptAt > 0 ? new Date(r.nextAttemptAt) : null,
    };
  });

  return {
    ...query,
    requests,
    failures: requests.filter((r) => r.status === 'retained-failure'),
    /** Bot 상태가 최근에 동기화되지 않음 → 실시간처럼 보이지 말고 마지막 동기화 시각을 표시 */
    isStale: data ? !data.available : false,
    lastSynchronizedAt: data?.lastSynchronizedAt ?? null,
    retry,
    retryingId,
    retryError: mutation.error,
    retryErrorMessage: getErrorMessage(mutation.error, {
      403: '재시도는 서버 관리자만 실행할 수 있어요.',
      409: '이미 처리되었거나 재시도할 수 없는 상태예요. 최신 상태를 불러왔어요.',
    }),
  };
}
