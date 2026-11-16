import { useEffect, useRef, useState } from 'react';
import { invalidate, TAGS } from '../hooks/queryBus.js';
import { isConnectionError, useServerHealth } from '../hooks/useServerHealth.jsx';

/**
 * BE 연결 오류 배너 (화면설계 03-01).
 * 모달이 아니라 일반 레이아웃 안에 놓여, 기존 콘텐츠를 가리지 않고 아래로 민다.
 *
 * @param {object} props
 * @param {{ error: unknown, isFetching: boolean }} props.query 이 화면의 주 조회. 연결 실패로 끝났는지 같이 본다
 */
export default function ConnectionBanner({ query }) {
  const health = useServerHealth();
  const queryLost = isConnectionError(query.error);
  const [retrying, setRetrying] = useState(false);
  const sawFetch = useRef(false);

  // 조회가 연결 실패로 끝나면 상태 확인을 앞당긴다
  const { reportConnectionFailure } = health;
  useEffect(() => {
    if (queryLost) reportConnectionFailure();
  }, [queryLost, reportConnectionFailure]);

  // 다시 시도: 상태 확인 → 살아 있으면 화면 데이터를 다시 읽고, 그 조회가 끝날 때까지 로딩 유지
  useEffect(() => {
    if (retrying !== 'refetch') return undefined;
    if (query.isFetching) sawFetch.current = true;
    else if (sawFetch.current) setRetrying(false);
    // 다시 읽을 조회가 시작되지 않는 경우에도 로딩에 갇히지 않게
    const fallback = setTimeout(() => !sawFetch.current && setRetrying(false), 2000);
    return () => clearTimeout(fallback);
  }, [retrying, query.isFetching]);

  const retry = async () => {
    setRetrying(true);
    const next = await health.recheck();
    if (next.be === 'down') {
      setRetrying(false);
      return;
    }
    sawFetch.current = false;
    setRetrying('refetch');
    invalidate(Object.values(TAGS));
  };

  if (!retrying && !health.isBackendDown && !queryLost) return null;
  return (
    <div className="connection-banner" role="alert">
      <span className="connection-banner-icon" aria-hidden="true">!</span>
      <div className="connection-banner-text">
        <b>서버에 연결할 수 없습니다.</b>
        <p>일부 기능이 일시적으로 제한될 수 있습니다. 연결 상태를 확인한 후 다시 시도해 주세요.</p>
      </div>
      <button type="button" className="btn btn-primary" onClick={retry} disabled={Boolean(retrying)} aria-busy={Boolean(retrying)}>
        {retrying ? '확인 중…' : '다시 시도'}
      </button>
    </div>
  );
}
