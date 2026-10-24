import { useEffect, useRef } from 'react';
import { getChannelSettings } from '../api/endpoints.js';
import { getErrorMessage } from '../api/errors.js';
import { ErrorState, LoadingState } from '../components/ApiState.jsx';
import { useAuth, useOAuthCallback } from '../hooks/useAuth.jsx';
import { navigate } from '../router.js';

/** URL에 Discord OAuth 결과(code·state)가 있는지 */
export const hasOAuthParams = () => {
  const params = new URLSearchParams(window.location.search);
  return params.has('state') && (params.has('code') || params.has('error'));
};

/**
 * Discord가 돌려보낸 콜백 처리.
 * 로그인 성공 후 선택된 서버에 동기화 채널이 없으면 연결 설정, 있으면 대시보드로 보낸다.
 */
export default function OAuthCallback({ onDone }) {
  const { status, error } = useOAuthCallback();
  const { guildId, isAuthenticated, startLogin } = useAuth();
  const routedRef = useRef(false);

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

  if (status === 'error') {
    return (
      <div className="full-center">
        <div style={{ width: 'min(480px, 100%)' }}>
          <ErrorState
            title="Discord 로그인에 실패했어요"
            message={getErrorMessage(error, {
              401: '로그인 확인 정보가 만료되었어요. 처음부터 다시 로그인해 주세요.',
              400: '로그인 확인 정보가 올바르지 않아요. 처음부터 다시 로그인해 주세요.',
            })}
          />
          <div className="center-actions">
            <button type="button" className="btn btn-primary" onClick={() => startLogin().catch(() => undefined)}>
              다시 로그인
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => {
                navigate('/');
                onDone();
              }}
            >
              처음 화면으로
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="full-center">
      <LoadingState variant="spinner" label="Discord 계정을 확인하고 있어요…" />
    </div>
  );
}
