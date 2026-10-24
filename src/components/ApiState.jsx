import { getErrorMessage } from '../api/errors.js';
import './ApiState.css';

/** 처음 불러올 때: 카드 모양 스켈레톤 또는 스피너 */
export function LoadingState({ variant = 'skeleton', rows = 3, label = '불러오는 중이에요…' }) {
  if (variant === 'spinner') {
    return (
      <div className="api-loading" role="status" aria-live="polite">
        <span className="api-spinner" aria-hidden="true" />
        <span>{label}</span>
      </div>
    );
  }
  return (
    <div role="status" aria-live="polite" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="api-skeleton" />
      ))}
    </div>
  );
}

/** 백그라운드 재조회 중임을 알리는 작은 표시 */
export function InlineSpinner({ label = '새로고침 중' }) {
  return <span className="api-spinner api-spinner-sm" role="status" aria-label={label} />;
}

/**
 * 오류 패널. 401은 AuthProvider가 로그인 화면으로 돌려보내므로 여기서는 안내만 한다.
 * @param {object} props
 * @param {unknown} props.error
 * @param {() => void} [props.onRetry]
 * @param {string} [props.message]  직접 지정한 문구 (없으면 상태 코드로 생성)
 * @param {Record<number|string,string>} [props.messages] getErrorMessage 덮어쓰기
 */
export function ErrorState({ error, onRetry, title = '데이터를 불러오지 못했어요', message, messages, compact = false }) {
  if (!error && !message) return null;
  const text = message ?? getErrorMessage(error, messages);
  // 400·403·404는 다시 시도해도 같은 결과라 재시도 버튼을 숨김
  const retryable = onRetry && ![400, 403, 404].includes(error?.status);

  if (compact) {
    return (
      <p className="api-error-inline" role="alert">
        {text}
        {retryable && (
          <button type="button" className="text-link" onClick={onRetry}>
            다시 시도
          </button>
        )}
      </p>
    );
  }

  return (
    <div className="panel api-error" role="alert">
      <div className="api-error-icon" aria-hidden="true">!</div>
      <h2>{title}</h2>
      <p>{text}</p>
      {retryable && (
        <button type="button" className="btn btn-outline" onClick={onRetry}>
          다시 시도
        </button>
      )}
    </div>
  );
}

export function EmptyState({ children = '표시할 내용이 없어요.' }) {
  return <div className="empty-state">{children}</div>;
}

/**
 * 조회 훅 결과를 받아 로딩 → 오류 → 빈 상태 → 내용 순서로 보여준다.
 *
 * @example
 * const list = useDecisionList(guildId, filters);
 * <QueryState query={list} isEmpty={list.isEmpty} empty="조건에 맞는 Decision Card가 없습니다.">
 *   {() => list.cards.map((c) => <DecisionCard key={c.id} card={c} />)}
 * </QueryState>
 */
export function QueryState({ query, isEmpty = false, empty, loading, errorTitle, errorMessages, children }) {
  if (query.isLoading) return loading ?? <LoadingState />;
  if (query.isError && !query.isSuccess) {
    return <ErrorState error={query.error} onRetry={query.refetch} title={errorTitle} messages={errorMessages} />;
  }
  if (!query.isSuccess) return null; // enabled=false (서버 미선택 등)
  if (isEmpty) return <EmptyState>{empty}</EmptyState>;

  return (
    <>
      {/* 데이터는 있는데 재조회가 실패한 경우: 기존 내용 유지 + 짧은 안내 */}
      {query.isError && <ErrorState compact error={query.error} onRetry={query.refetch} messages={errorMessages} />}
      {typeof children === 'function' ? children(query.data) : children}
    </>
  );
}
