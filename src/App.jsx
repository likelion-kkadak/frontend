import { useState } from 'react';
import { LoadingState } from './components/ApiState.jsx';
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

  if (!auth.isAuthenticated) return <Landing />;
  if (route.page === 'setup') return <Setup />;
  return <Shell route={route} />;
}
