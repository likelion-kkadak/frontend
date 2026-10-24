import { useCallback, useEffect, useRef, useState } from 'react';
import { toApiError } from '../api/errors.js';
import { subscribeTags } from './queryBus.js';

/**
 * 조회용 공통 훅. 로딩·에러·취소·재조회·폴링을 처리한다.
 *
 * @template T
 * @param {(signal: AbortSignal) => Promise<T>} fetcher
 * @param {object} options
 * @param {unknown[]} [options.deps]       바뀌면 다시 조회 (필터, 페이지 등)
 * @param {string} [options.scopeKey]      바뀌면 이전 데이터를 즉시 숨김 (보통 guildId — 다른 서버 데이터 노출 방지)
 * @param {boolean} [options.enabled=true] false면 조회하지 않음 (guildId가 없을 때 등)
 * @param {string[]} [options.tags]        invalidate(tag) 신호를 받으면 다시 조회
 * @param {number | ((data: T) => number | false)} [options.refetchInterval] 성공 후 다음 조회까지 ms (폴링)
 */
export function useApiQuery(fetcher, { deps = [], scopeKey = '', enabled = true, tags = [], refetchInterval } = {}) {
  const [state, setState] = useState({
    data: undefined,
    dataScope: null,
    error: null,
    isFetching: false,
  });
  const [reloadToken, setReloadToken] = useState(0);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const intervalRef = useRef(refetchInterval);
  intervalRef.current = refetchInterval;

  const refetch = useCallback(() => setReloadToken((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) return undefined;

    const controller = new AbortController();
    let pollTimer;
    setState((s) => ({ ...s, error: null, isFetching: true }));

    fetcherRef.current(controller.signal).then(
      (data) => {
        if (controller.signal.aborted) return;
        setState({ data, dataScope: scopeKey, error: null, isFetching: false });

        const interval = typeof intervalRef.current === 'function' ? intervalRef.current(data) : intervalRef.current;
        if (interval) pollTimer = setTimeout(refetch, interval);
      },
      (error) => {
        const apiError = toApiError(error);
        if (controller.signal.aborted || apiError.isCanceled) return;
        // 실패 시 자동 폴링은 멈춘다. 사용자가 다시 시도(refetch)하도록 한다.
        setState((s) => ({ ...s, error: apiError, isFetching: false }));
      },
    );

    return () => {
      controller.abort();
      clearTimeout(pollTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, scopeKey, reloadToken, refetch, ...deps]);

  const tagKey = tags.join('|');
  useEffect(() => {
    if (!tagKey) return undefined;
    return subscribeTags(tagKey.split('|'), refetch);
  }, [tagKey, refetch]);

  /** 응답으로 받은 최신 데이터를 바로 반영할 때 (예: 저장 API가 수정된 객체를 돌려줄 때) */
  const setData = useCallback(
    (updater) =>
      setState((s) => ({
        ...s,
        data: typeof updater === 'function' ? updater(s.data) : updater,
        dataScope: scopeKey,
      })),
    [scopeKey],
  );

  const data = state.dataScope === scopeKey ? state.data : undefined;
  const hasData = data !== undefined;

  return {
    data,
    error: enabled ? state.error : null,
    /** 처음 불러오는 중 (보여줄 데이터 없음) → 스켈레톤 */
    isLoading: enabled && !hasData && !state.error,
    /** 백그라운드 재조회 포함 요청 진행 중 → 작은 스피너 */
    isFetching: enabled && state.isFetching,
    isError: enabled && Boolean(state.error),
    isSuccess: hasData,
    refetch,
    setData,
  };
}
