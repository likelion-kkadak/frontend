import { useState } from 'react';
import { ErrorState, LoadingState } from './components/ApiState.jsx';
import { ToastProvider } from './components/Toast.jsx';
import { AuthProvider, useAuth } from './hooks/useAuth.jsx';
import { useHashRoute } from './router.js';
import Landing from './screens/Landing.jsx';
import OAuthCallback, { hasOAuthParams } from './screens/OAuthCallback.jsx';
import PrototypeDemo from './screens/PrototypeDemo.jsx';
import Setup from './screens/Setup.jsx';
import Shell from './screens/Shell.jsx';
import './app.css';
import './redesign.css';

const isDemo = new URLSearchParams(window.location.search).has('demo');

export default function App() {
  // /?demo : 팀원이 만든 샘플 데이터 프로토타입 (API 호출 없음)
  if (isDemo) return <PrototypeDemo />;

  return (
    <ToastProvider>
      <AuthProvider>
        <Root />
      </AuthProvider>
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

  if (auth.isChecking) {
    return (
      <div className="full-center">
        <LoadingState variant="spinner" label="로그인 정보를 확인하고 있어요…" />
      </div>
    );
  }

  if (auth.status === 'session-error') return (
    <div className="full-center"><ErrorState error={auth.error} title="로그인 정보를 확인하지 못했어요" onRetry={auth.retrySession} /></div>
  );
  if (!auth.isAuthenticated) return <Landing />;
  if (auth.isRevalidating) return <div className="full-center"><LoadingState variant="spinner" label="봇이 설치된 서버를 확인하고 있어요…" /></div>;
  if (auth.guildSelection.status === 'unavailable') return (
    <div className="full-center"><div className="panel api-error" role="alert">
      <h2>서버의 봇 설치 여부를 확인하지 못했어요</h2>
      <p>잠시 후 다시 확인해 주세요. 로그인은 유지됩니다.</p>
      <button className="btn btn-primary" onClick={() => auth.reloadGuilds().catch(() => undefined)}>다시 시도</button>
      <button className="btn btn-outline" onClick={auth.logout}>로그아웃</button>
    </div></div>
  );
  if (route.page === 'setup') return <Setup key={auth.scopeKey} />;
  return <Shell key={auth.scopeKey} route={route} />;
}
