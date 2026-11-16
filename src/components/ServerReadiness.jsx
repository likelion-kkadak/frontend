import { useEffect, useState } from 'react';

/** OAuth 세션 복원과 작업 공간 요청 전에 서버 연결을 확인한다. */
export default function ServerReadiness({ children }) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ ready: false, failed: false, checks: null });
  useEffect(() => {
    const controller = new AbortController();
    const deadline = Date.now() + 60000;
    let timer;
    let requestTimer;
    const check = async () => {
      let checks = null;
      let abort;
      try {
        const base = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
        const requestController = new AbortController();
        abort = () => requestController.abort();
        controller.signal.addEventListener('abort', abort, { once: true });
        requestTimer = setTimeout(abort, 15000);
        const response = await fetch(`${base}/health`, {
          cache: 'no-store',
          signal: requestController.signal,
        });
        const health = await response.json();
        if (controller.signal.aborted) return;
        checks = health.checks;
        if (response.ok && (health.ready === true || (health.ready === undefined && health.status === 'healthy'))) {
          setState({ ready: true, failed: false, checks });
          return;
        }
      } catch {
        if (controller.signal.aborted) return;
      } finally {
        clearTimeout(requestTimer);
        if (abort) controller.signal.removeEventListener('abort', abort);
      }
      const failed = Date.now() >= deadline;
      setState({ ready: false, failed, checks });
      if (!failed) timer = setTimeout(check, 3000);
    };
    setState({ ready: false, failed: false, checks: null });
    void check();
    return () => { controller.abort(); clearTimeout(timer); clearTimeout(requestTimer); };
  }, [attempt]);
  if (state.ready) return children;
  return (
    <div className="full-center"><div className="panel" role="status" aria-live="polite">
      <h2>{state.failed ? '서버 연결을 확인해 주세요' : '서버를 준비하고 있어요'}</h2>
      <p>{state.failed ? '서버 또는 Discord 봇 연결이 아직 준비되지 않았어요.' : '서버와 Discord 봇의 연결 상태를 확인하고 있어요.'}</p>
      {state.checks && <p>
        데이터베이스: {state.checks.database === true ? '정상' : '확인 중'} ·{' '}
        봇: {state.checks.bot === true ? '연결됨' : '확인 중'} ·{' '}
        Discord: {state.checks.discord === true ? '연결됨' : '확인 중'}
      </p>}
      {state.failed && <button className="btn btn-primary" onClick={() => setAttempt(value => value + 1)}>다시 시도</button>}
    </div></div>
  );
}
