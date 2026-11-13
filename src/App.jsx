import { useEffect, useRef, useState } from 'react';
import { ErrorState, LoadingState } from './components/ApiState.jsx';
import { ToastProvider } from './components/Toast.jsx';
import { AuthProvider, useAuth, WorkspaceAuthProvider } from './hooks/useAuth.jsx';
import { invalidate, TAGS } from './hooks/queryBus.js';
import { useHashRoute } from './router.js';
import Landing from './screens/Landing.jsx';
import OAuthCallback, { hasOAuthParams } from './screens/OAuthCallback.jsx';
import PrototypeDemo from './screens/PrototypeDemo.jsx';
import Setup from './screens/Setup.jsx';
import Shell from './screens/Shell.jsx';
import './app.css';
import './redesign.css';
import ServerReadiness from './components/ServerReadiness.jsx';

const isDemo = new URLSearchParams(window.location.search).has('demo');

export default function App() {
  // /?demo : 팀원이 만든 샘플 데이터 프로토타입 (API 호출 없음)
  if (isDemo) return <PrototypeDemo />;

  return (
    <ToastProvider>
      <ServerReadiness>
      <AuthProvider>
        <Root />
      </AuthProvider>
      </ServerReadiness>
    </ToastProvider>
  );
}

/**
 * 화면 결정 순서: OAuth 콜백 → 세션 확인 중 → 비로그인(랜딩) → 연결 설정 → 메인 화면
 */
function Root() {
  const auth = useAuth();
  const route = useHashRoute();
  const [inCallback, setInCallback] = useState(hasOAuthParams);

  if (inCallback) return <OAuthCallback onDone={() => setInCallback(false)} />;

  let gate = null;
  if (auth.isChecking) {
    gate = (
      <div className="full-center">
        <LoadingState variant="spinner" label="로그인 정보를 확인하고 있어요…" />
      </div>
    );
  } else if (auth.status === 'session-error') gate = (
    <div className="full-center"><ErrorState error={auth.error} title="로그인 정보를 확인하지 못했어요" onRetry={auth.retrySession} /></div>
  );
  else if (!auth.isAuthenticated) gate = <Landing />;
  else if (auth.guildVerification?.status === 'rate_limited') gate = <GuildRateLimitedGate auth={auth} />;
  else if (auth.isRevalidating) gate = <div className="full-center"><LoadingState variant="spinner" label="봇이 설치된 서버를 확인하고 있어요…" /></div>;
  else if (auth.guildSelection.status === 'unavailable') gate = (
    <div className="full-center"><div className="panel api-error" role="alert">
      <h2>서버의 봇 설치 여부를 확인하지 못했어요</h2>
      <p>잠시 후 다시 확인해 주세요. 로그인은 유지됩니다.</p>
      <button className="btn btn-primary" onClick={() => auth.reloadGuilds().catch(() => undefined)}>다시 시도</button>
      <button className="btn btn-outline" onClick={auth.logout}>로그아웃</button>
    </div></div>
  );
  return <>{gate}<Workspace auth={auth} route={route} blocked={Boolean(gate)} /></>;
}

function Workspace({ auth, route, blocked }) {
  const verified = useRef(null);
  const wasBlocked = useRef(blocked);
  if (auth.status === 'anonymous' || verified.current?.auth.scopeKey !== auth.scopeKey) verified.current = null;
  if (!blocked) verified.current = { auth, route };
  useEffect(() => {
    if (wasBlocked.current && !blocked) invalidate(Object.values(TAGS));
    wasBlocked.current = blocked;
  }, [blocked]);
  const snapshot = verified.current;
  if (!snapshot) return null;
  return (
    <div hidden={blocked} inert={blocked ? '' : undefined} data-workspace="">
      <WorkspaceAuthProvider value={snapshot.auth}>
        {snapshot.route.page === 'setup'
          ? <Setup key={snapshot.auth.scopeKey} />
          : <Shell key={snapshot.auth.scopeKey} route={snapshot.route} />}
      </WorkspaceAuthProvider>
    </div>
  );
}

function GuildRateLimitedGate({ auth }) {
  const [now, setNow] = useState(Date.now());
  const retryAtMs = auth.guildVerification?.retryAt ? Date.parse(auth.guildVerification.retryAt) : 0;
  const remainingMs = Math.max(0, retryAtMs - now);
  const remainingSec = Math.ceil(remainingMs / 1000);

  useEffect(() => {
    if (remainingMs <= 0) return undefined;
    const interval = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(interval);
  }, [remainingMs]);

  const coverageWarning =
    auth.guildVerification?.eventCoverage === 'disconnected'
      ? '서버 멤버 변경 확인 연결이 끊겼어요'
      : auth.guildVerification?.eventCoverage === 'members_intent_disabled'
      ? '서버 멤버 이벤트 권한이 비활성화되었어요'
      : auth.guildVerification?.eventCoverage === 'expired'
      ? '서버 멤버 변경 확인 연결이 만료되었어요'
      : null;

  return (
    <div className="full-center">
      <div className="panel api-error" role="alert">
        <h2>서버 권한 확인 대기</h2>
        <p>
          <span>{auth.user?.name || auth.user?.username || '사용자'}</span>{' '}
          <span className="badge badge-subtle">로그인됨</span>
        </p>
        <p>Discord 요청 제한으로 인해 잠시 서버 권한 확인을 대기 중입니다. 로그인은 유지됩니다.</p>
        {coverageWarning && <p className="text-warning">{coverageWarning}</p>}
        {remainingSec > 0 && (
          <p data-retry-countdown>{remainingSec}초 후 다시 시도할 수 있어요</p>
        )}
        <div className="actions" style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={remainingSec > 0}
            onClick={() => auth.reloadGuilds().catch(() => undefined)}
          >
            다시 시도
          </button>
          <button type="button" className="btn btn-outline" onClick={auth.logout}>
            로그아웃
          </button>
        </div>
      </div>
    </div>
  );
}
