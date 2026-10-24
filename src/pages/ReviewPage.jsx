import { useEffect, useState } from 'react';
import { ErrorState } from '../components/ApiState.jsx';
import { useToast } from '../components/Toast.jsx';
import { CategoryBadge, PageHead, Pagination, TrashIcon } from '../components/ui.jsx';
import { useReviewAction, useReviewQueue } from '../hooks/useReviewQueue.js';
import { navigate } from '../router.js';

/**
 * 검수 큐 (디자인: image/검수큐.png)
 * 검토 대기(IN_REVIEW) 후보만 보여준다. 확정·보류하면 카드 전체 리스트로 옮겨지고,
 * 삭제하면 저장되지 않고 검수 큐에서 제거된다 (사용자 플로우 1-1 ~ 1-4).
 */
const DONE_TEXT = {
  confirm: '확정했어요. 카드 전체 리스트에 추가됐어요.',
  defer: '보류했어요. 카드 전체 리스트(보류)에 추가됐어요.',
  reject: '후보를 삭제했어요. 검수 큐에서 제거됐어요.',
};

export default function ReviewPage({ route, guildId, sync, canManage, startSync }) {
  const toast = useToast();
  const page = Math.max(1, Number(route.params.page) || 1);
  const queue = useReviewQueue(guildId, { status: 'IN_REVIEW', page });
  const review = useReviewAction(guildId);

  useEffect(() => {
    if (review.error) toast(review.errorMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [review.error]);

  // 마지막 항목을 처리해 현재 페이지가 비면 앞 페이지로
  useEffect(() => {
    if (queue.isEmpty && page > 1) navigate('/review', { page: page - 1 });
  }, [queue.isEmpty, page]);

  // "N개 처리 완료" 화면용: 이번에 이 화면에서 처리한 개수
  const [processed, setProcessed] = useState(0);

  const act = async (ticket, action) => {
    if (action === 'reject' && !window.confirm('이 후보를 삭제할까요? 삭제한 후보는 저장되지 않아요.')) return;
    const fn = action === 'confirm' ? review.confirm : action === 'defer' ? review.defer : review.reject;
    const result = await fn(ticket, action === 'confirm' ? { resolution: 'independent' } : undefined);
    if (result) {
      setProcessed((n) => n + 1);
      toast(DONE_TEXT[action]);
    }
  };

  const open = (id) => navigate(`/decision/${encodeURIComponent(id)}`);
  const total = queue.pageInfo.totalElements;
  const allDone = queue.isEmpty && processed > 0;

  let head;
  if (sync.isRunning) {
    head = <PageHead title="AI가 결정 후보를 찾고 있어요" desc={`Discord 메시지를 분석하는 중입니다 · ${sync.progress}%`} />;
  } else if (allDone) {
    head = <PageHead title="AI 초안 검수" desc="Discord 동기화 결과를 확인합니다." />;
  } else if (queue.isSuccess && total > 0) {
    head = (
      <PageHead
        title={`AI가 새로운 결정 후보 ${total}개를 찾았어요`}
        desc="Discord에서 추출한 초안을 확인하고 확정·수정·보류해 주세요."
      />
    );
  } else {
    head = <PageHead title="새로운 결정 후보가 없어요" desc="Discord를 동기화하면 새 메시지에서 결정 후보를 찾아 드려요." />;
  }

  return (
    <>
      {head}

      {sync.isFailed && !sync.isRunning && (
        <div className="panel review-empty">
          <div className="api-error-icon" aria-hidden="true">
            !
          </div>
          <h2>Discord에서 메시지를 가져오지 못했어요</h2>
          <p>
            {sync.job?.errorMessage || '연결 상태를 확인한 뒤 다시 시도해 주세요.'}
            <br />
            문제가 계속되면 연결 설정을 확인해 주세요.
          </p>
          <button type="button" className="btn btn-outline" onClick={startSync} disabled={!canManage}>
            다시 시도
          </button>{' '}
          <button type="button" className="btn btn-ghost" onClick={() => navigate('/settings', { tab: 'connect' })}>
            연결 설정
          </button>
        </div>
      )}

      {queue.isLoading || (sync.isRunning && !queue.isSuccess) ? (
        <>
          <div className="review-skeleton" />
          <div className="review-skeleton" />
          <div className="review-skeleton" />
        </>
      ) : queue.isError && !queue.isSuccess ? (
        <ErrorState error={queue.error} onRetry={queue.refetch} title="검수 큐를 불러오지 못했어요" />
      ) : allDone ? (
        <div className="panel review-empty">
          <div className="metric-icon" style={{ margin: 'auto', color: '#16a34a', background: '#e8f8ee' }}>
            ✓
          </div>
          <h2>{processed}개 처리 완료</h2>
          <p>
            모든 AI 초안 검수가 끝났어요.
            <br />
            확정·보류한 결정은 카드 전체 리스트에서 확인할 수 있어요.
          </p>
          <button type="button" className="btn btn-primary" onClick={() => navigate('/list')}>
            카드 전체 리스트로 이동
          </button>
        </div>
      ) : queue.isEmpty ? (
        <div className="panel review-empty">
          <div className="metric-icon" style={{ margin: 'auto', color: '#6366f1', background: '#f0f0ff' }}>
            ✓
          </div>
          <h2>검토할 후보가 없습니다</h2>
          <p>
            대기 중인 후보를 모두 검토했어요.
            <br />
            기존 결정은 WHY 검색과 카드 전체 리스트에서 확인할 수 있어요.
          </p>
          <button type="button" className="btn btn-primary" onClick={() => navigate('/dashboard')}>
            대시보드로 이동
          </button>
        </div>
      ) : (
        <>
          {queue.isError && <ErrorState compact error={queue.error} onRetry={queue.refetch} />}
          <div className="review-list">
            {queue.tickets.map((ticket, i) => (
              <ReviewCard
                key={ticket.id}
                card={queue.cards[i]}
                busy={review.pendingId === ticket.id}
                onConfirm={() => act(ticket, 'confirm')}
                onEdit={() => open(ticket.id)}
                onDefer={() => act(ticket, 'defer')}
                onDelete={() => act(ticket, 'reject')}
              />
            ))}
          </div>
          <Pagination pageInfo={queue.pageInfo} onChange={(p) => navigate('/review', { page: p })} />
        </>
      )}
    </>
  );
}

/** 검수 후보 카드: 태그 · 제목 · 결정/근거 두 줄 · 오른쪽 확정/수정/보류 · 휴지통(삭제) */
function ReviewCard({ card, busy, onConfirm, onEdit, onDefer, onDelete }) {
  return (
    <article className="review-card">
      <button type="button" className="review-card-delete" onClick={onDelete} disabled={busy} aria-label="후보 삭제" title="삭제">
        <TrashIcon />
      </button>
      <div className="review-card-body">
        <div className="tags">
          <CategoryBadge category={card.category} />
          {card.pivot && <span className="badge pivot">PIVOT (자동판단)</span>}
        </div>
        <h3>{card.title}</h3>
        <dl className="review-card-lines">
          <div>
            <dt>결정</dt>
            <dd>{card.summary}</dd>
          </div>
          <div>
            <dt>근거</dt>
            <dd>{card.why}</dd>
          </div>
        </dl>
      </div>
      <div className="review-card-actions">
        <button type="button" className="rv-confirm" disabled={busy} onClick={onConfirm}>
          {busy ? '처리 중' : '확정'}
        </button>
        <button type="button" className="rv-edit" disabled={busy} onClick={onEdit}>
          수정
        </button>
        <button type="button" className="rv-defer" disabled={busy} onClick={onDefer}>
          보류
        </button>
      </div>
    </article>
  );
}
