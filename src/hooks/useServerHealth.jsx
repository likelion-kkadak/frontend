import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

/**
 * BE · Bot · Discord 연결 상태.
 * 화면 진입을 막지 않고, 각 기능이 필요한 연결만 골라 확인하도록 상태만 알려준다.
 *
 * be:  'unknown'(아직 확인 전) | 'up' | 'down'
 * bot / discord: true(연결됨) | false(끊김) | null(알 수 없음 — 막지 않는다)
 */
const HealthContext = createContext(null);

const POLL_MS = 30000;
const POLL_WHEN_DOWN_MS = 10000;
const REQUEST_TIMEOUT_MS = 10000;
const UNKNOWN = { be: 'unknown', bot: null, discord: null, checkedAt: null };

const flag = (value) => (value === true ? true : value === false ? false : null);

async function fetchHealth(signal) {
  const base = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
  let response;
  try {
    response = await fetch(`${base}/health`, { cache: 'no-store', signal });
  } catch (error) {
    if (signal.aborted && signal.reason !== 'timeout') throw error;
    return { be: 'down', bot: null, discord: null };
  }
  let body = null;
  try {
    body = await response.json();
  } catch {
    // JSON이 아닌 응답: 5xx(프록시 연결 실패 등)는 BE 중단, 그 외(상태 확인 경로 없음)는 판단하지 않는다
    return { be: response.status >= 500 ? 'down' : 'unknown', bot: null, discord: null };
  }
  const checks = body?.checks ?? {};
  // 503이어도 JSON으로 답했다면 BE는 살아 있다. DB가 끊긴 경우만 BE 중단으로 본다
  return {
    be: checks.database === false ? 'down' : 'up',
    bot: flag(checks.bot),
    discord: flag(checks.discord),
  };
}

export function ServerHealthProvider({ children }) {
  const [health, setHealth] = useState(UNKNOWN);
  const [isChecking, setIsChecking] = useState(false);
  const inflight = useRef(null);
  const timer = useRef(null);
  const healthRef = useRef(health);
  healthRef.current = health;

  /** 상태를 다시 확인하고 결과를 돌려준다. 동시에 여러 번 불러도 요청은 하나만 보낸다. */
  const recheck = useCallback(() => {
    if (inflight.current) return inflight.current;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort('timeout'), REQUEST_TIMEOUT_MS);
    setIsChecking(true);
    const task = fetchHealth(controller.signal)
      .then((result) => {
        const next = { ...result, checkedAt: Date.now() };
        setHealth(next);
        // 끊긴 연결이 있으면 더 자주 확인해서 복구되는 즉시 안내를 해제한다
        const degraded = next.be === 'down' || next.bot === false || next.discord === false;
        clearTimeout(timer.current);
        timer.current = setTimeout(() => void recheck(), degraded ? POLL_WHEN_DOWN_MS : POLL_MS);
        return next;
      })
      .catch(() => healthRef.current)
      .finally(() => {
        clearTimeout(timeout);
        inflight.current = null;
        setIsChecking(false);
      });
    inflight.current = task;
    return task;
  }, []);

  /** API 요청이 연결 실패로 끝났을 때 알려주면 상태를 바로 다시 확인한다. */
  const reportConnectionFailure = useCallback(() => {
    if (healthRef.current.be !== 'down') void recheck();
  }, [recheck]);

  useEffect(() => {
    void recheck();
    const onWake = () => void recheck();
    const onVisible = () => document.visibilityState === 'visible' && onWake();
    window.addEventListener('online', onWake);
    window.addEventListener('focus', onWake);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer.current);
      window.removeEventListener('online', onWake);
      window.removeEventListener('focus', onWake);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [recheck]);

  const value = useMemo(
    () => ({
      ...health,
      isChecking,
      isBackendDown: health.be === 'down',
      isBotDown: health.bot === false,
      recheck,
      reportConnectionFailure,
    }),
    [health, isChecking, recheck, reportConnectionFailure],
  );
  return <HealthContext.Provider value={value}>{children}</HealthContext.Provider>;
}

const FALLBACK = {
  ...UNKNOWN,
  isChecking: false,
  isBackendDown: false,
  isBotDown: false,
  recheck: async () => UNKNOWN,
  reportConnectionFailure: () => undefined,
};

export function useServerHealth() {
  return useContext(HealthContext) ?? FALLBACK;
}

/** 네트워크 오류·타임아웃·게이트웨이 오류처럼 "서버에 닿지 못한" 실패인지 */
export const isConnectionError = (error) =>
  Boolean(error) && (error.isNetworkError || [502, 503, 504].includes(error.status));
