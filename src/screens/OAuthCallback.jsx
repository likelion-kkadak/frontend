import { useEffect, useRef } from 'react';
import { getChannelSettings } from '../api/endpoints.js';
import { LoadingState } from '../components/ApiState.jsx';
import { useAuth, useOAuthCallback } from '../hooks/useAuth.jsx';
import { navigate } from '../router.js';

export { hasOAuthParams } from '../hooks/useAuth.jsx';

/**
 * Discord가 돌려보낸 콜백 처리.
 * 로그인 성공 후 선택된 서버에 동기화 채널이 없으면 연결 설정, 있으면 대시보드로 보낸다.
 * 실패하면 onDone({ failed: true })로 랜딩의 오류 모달에 넘긴다.
 */
export default function OAuthCallback({ onDone }) {
  const { status, error } = useOAuthCallback();
  const { guildId, isAuthenticated, retrySession } = useAuth();
  const routedRef = useRef(false);

  // 실패하면 랜딩으로 돌아가 오류 모달을 띄운다. 직접 취소한 경우는 모달 없이 랜딩만 보여준다
  useEffect(() => {
    if (status !== 'error' || routedRef.current) return;
    routedRef.current = true;
    navigate('/');
    retrySession();
    onDone({ failed: error?.code !== 'OAUTH_CANCELED' });
  }, [status, error, onDone, retrySession]);

  useEffect(() => {
    if (status !== 'success' || !isAuthenticated || routedRef.current) return;
    routedRef.current = true;

    const finish = (path) => {
      navigate(path);
      onDone();
    };
    if (!guildId) {
      finish('/setup');
      return;
    }
    getChannelSettings(guildId)
      .then((settings) => finish(settings.monitoredChannelIds.length ? '/dashboard' : '/setup'))
      .catch(() => finish('/dashboard'));
  }, [status, isAuthenticated, guildId, onDone]);

  return (
    <div className="full-center">
      <LoadingState variant="spinner" label="Discord 계정을 확인하고 있어요…" />
    </div>
  );
}
