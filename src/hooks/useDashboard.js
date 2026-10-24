import { useCallback, useEffect, useRef, useState } from 'react';
import { createSyncJob, getDashboard, getSyncJob } from '../api/endpoints.js';
import { getErrorMessage, isRetryableError, toApiError } from '../api/errors.js';
import { isSyncJobTerminal, toDecisionCard } from '../api/models.js';
import { DECISION_CHANGED_TAGS, TAGS, invalidate } from './queryBus.js';
import { useApiQuery } from './useApiQuery.js';

/**
 * 홈 대시보드: 카드 개수 요약 · 최근 확정 결정(최대 5개) · 동기화 상태
 */
export function useDashboard(guildId) {
  const query = useApiQuery((signal) => getDashboard(guildId, { signal }), {
    scopeKey: guildId,
    enabled: Boolean(guildId),
    tags: [TAGS.DASHBOARD],
  });

  const dashboard = query.data;
  return {
    ...query,
    counts: dashboard?.counts ?? { confirmed: 0, onHold: 0, inReview: 0 },
    recentDecisions: (dashboard?.recentDecisions ?? []).map(toDecisionCard),
    lastSuccessfulAt: dashboard?.sync?.lastSuccessfulAt ?? null,
    latestJob: dashboard?.sync?.latestJob ?? null,
  };
}

const POLL_INTERVAL_MS = 2000;
const MAX_BACKOFF_MS = 30000;
const MAX_CONSECUTIVE_ERRORS = 5;

/**
 * "지금 동기화" 버튼: Sync Job 생성 → 완료/실패까지 상태 polling → 관련 화면 갱신
 *
 * @param {string|null} guildId
 * @param {object} [options]
 * @param {object|null} [options.activeJob] dashboard의 latestJob. 진행 중이면 자동으로 이어서 polling
 * @param {(job: object) => void} [options.onFinished] COMPLETED/FAILED 도달 시
 */
export function useSyncJob(guildId, { activeJob = null, onFinished } = {}) {
  const [job, setJob] = useState(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState(null);

  const pollRef = useRef({ timer: null, controller: null, jobId: null });
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;

  const stopPolling = useCallback(() => {
    const p = pollRef.current;
    clearTimeout(p.timer);
    p.controller?.abort();
    pollRef.current = { timer: null, controller: null, jobId: null };
    setIsPolling(false);
  }, []);

  const startPolling = useCallback(
    (jobId) => {
      if (!guildId || pollRef.current.jobId === jobId) return;
      stopPolling();
      pollRef.current.jobId = jobId;
      setIsPolling(true);

      let errorCount = 0;
      const tick = async (delay) => {
        pollRef.current.timer = setTimeout(async () => {
          const controller = new AbortController();
          pollRef.current.controller = controller;
          try {
            const next = await getSyncJob(guildId, jobId, { signal: controller.signal });
            if (pollRef.current.jobId !== jobId) return;
            errorCount = 0;
            setJob(next);
            setError(null);
            if (isSyncJobTerminal(next)) {
              stopPolling();
              invalidate(DECISION_CHANGED_TAGS); // Dashboard · Review Queue · 목록 · Timeline 갱신
              onFinishedRef.current?.(next);
              return;
            }
            tick(POLL_INTERVAL_MS);
          } catch (err) {
            const apiError = toApiError(err);
            if (apiError.isCanceled || pollRef.current.jobId !== jobId) return;
            errorCount += 1;
            // 429·네트워크·5xx는 backoff 후 재시도, 그 외(404·403 등)는 중단
            if (isRetryableError(apiError) && errorCount < MAX_CONSECUTIVE_ERRORS) {
              tick(Math.min(POLL_INTERVAL_MS * 2 ** errorCount, MAX_BACKOFF_MS));
            } else {
              setError(apiError);
              stopPolling();
            }
          }
        }, delay);
      };
      tick(0);
    },
    [guildId, stopPolling],
  );

  // 서버가 바뀌거나 화면을 떠나면 polling 중단
  useEffect(() => {
    setJob(null);
    setError(null);
    return stopPolling;
  }, [guildId, stopPolling]);

  // 페이지 진입 시 이미 진행 중인 Job이 있으면 이어서 추적
  const activeJobId = activeJob && !isSyncJobTerminal(activeJob) ? activeJob.jobId : null;
  useEffect(() => {
    if (activeJobId) startPolling(activeJobId);
  }, [activeJobId, startPolling]);

  const start = useCallback(
    async ({ forceFullSync = false } = {}) => {
      if (!guildId || isStarting || pollRef.current.jobId) return null;
      setIsStarting(true);
      setError(null);
      try {
        const created = await createSyncJob(guildId, { forceFullSync });
        setJob(created);
        invalidate(TAGS.DASHBOARD);
        startPolling(created.jobId);
        return created;
      } catch (err) {
        const apiError = toApiError(err);
        setError(apiError);
        // 409 = 이미 진행 중인 동기화 → 새 Job을 만들지 않고 대시보드를 다시 읽어 기존 Job을 이어서 추적
        if (apiError.status === 409) invalidate(TAGS.DASHBOARD);
        return null;
      } finally {
        setIsStarting(false);
      }
    },
    [guildId, isStarting, startPolling],
  );

  const total = job?.totalChannels ?? 0;
  const done = (job?.completedChannels ?? 0) + (job?.failedChannels ?? 0);

  return {
    job,
    start,
    isStarting,
    isRunning: isStarting || isPolling,
    /** 0~100, 채널 수 기준 */
    progress: total ? Math.round((done / total) * 100) : 0,
    isFailed: job?.status === 'FAILED',
    error,
    errorMessage: getErrorMessage(error, {
      400: '동기화할 채널이 없어요. 설정에서 채널을 먼저 선택해 주세요.',
      403: '동기화는 서버 관리자만 실행할 수 있어요.',
      409: '이미 동기화가 진행 중이에요. 진행 상황을 불러올게요.',
    }),
  };
}
