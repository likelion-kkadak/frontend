import { CARD_STATUSES, formatRelative } from '../api/models.js';
import { EmptyState, ErrorState, InlineSpinner, LoadingState } from '../components/ApiState.jsx';
import { DecisionCard, PageHead } from '../components/ui.jsx';
import ConnectionBanner from '../components/ConnectionBanner.jsx';
import SyncButton from '../components/SyncButton.jsx';
import { useDecisionList } from '../hooks/useDecisions.js';
import { isConnectionError, useServerHealth } from '../hooks/useServerHealth.jsx';
import { navigate } from '../router.js';

const QUICK_QUESTIONS = ['왜 타깃을 좁혔지?', '왜 GPS를 뺐지?', '최근 기술 결정은?'];

function Metric({ label, value, icon, tint, color, onClick }) {
  return (
    <div className="metric">
      <div className="metric-top">
        <span>{label}</span>
        <span className="metric-icon" style={{ background: tint, color }}>
          {icon}
        </span>
      </div>
      <div className="metric-number">{value}</div>
      <button type="button" className="metric-note" onClick={onClick}>
        카드 리스트 보기 →
      </button>
    </div>
  );
}

export default function DashboardPage({ guildId, dashboard, sync, canManage, startSync }) {
  const { counts, lastSuccessfulAt, latestJob } = dashboard;
  // 시안의 "최근 생성된 카드 3개"와 "총 N개" — Decision Card(확정+보류)만 센다 (검토 대기 후보는 검수 큐에서)
  const recent = useDecisionList(guildId, { status: CARD_STATUSES, size: 3 });
  const total = counts.confirmed + counts.onHold;
  const lastSync = formatRelative(lastSuccessfulAt);
  const health = useServerHealth();
  // BE 연결 실패는 상단 배너가 안내하므로 본문 오류 화면으로 바꾸지 않는다 (화면설계 03-01)
  const connectionLost = health.isBackendDown || isConnectionError(dashboard.error);

  let syncText = lastSync ?? '아직 동기화 기록이 없어요';
  if (sync.isRunning) syncText = `동기화 진행 중 · 채널 ${sync.job?.completedChannels ?? 0}/${sync.job?.totalChannels ?? 0}`;
  else if (latestJob?.status === 'FAILED') syncText = `최근 동기화 실패 · ${lastSync ? `마지막 성공 ${lastSync}` : '성공 기록 없음'}`;

  return (
    <>
      <PageHead title="Dashboard" right={dashboard.isFetching && !dashboard.isLoading ? <InlineSpinner /> : null} />
      <div className={`sync-strip${health.isBotDown ? ' sync-strip-warning' : ''}`}>
        {/* Bot이 끊기면 동기화만 막고, 조회·검수·수정은 그대로 쓴다 (화면설계 03-02) */}
        {health.isBotDown ? (
          <span className="sync-bot-down" role="status">◉ ⚠ Bot 연결을 확인할 수 없습니다.</span>
        ) : (
          <span>◉ Discord 동기화 · {syncText}</span>
        )}
        <SyncButton sync={sync} canManage={canManage} botDown={health.isBotDown} onClick={startSync} />
      </div>
      {sync.isRunning && (
        <div className="sync-progress" aria-label={`동기화 진행률 ${sync.progress}%`}>
          <i style={{ width: `${sync.progress}%` }} />
        </div>
      )}
      <ConnectionBanner query={dashboard} />
      <section className="hero">
        <div className="hero-kicker">프로젝트 메모리</div>
        <h2>우리 팀의 결정을 한눈에.</h2>
        <p>흩어진 대화 속에 숨은 결정과 그 이유를 다시 연결해보세요.</p>
      </section>

      {dashboard.isLoading ? (
        <LoadingState rows={3} />
      ) : connectionLost && !dashboard.isSuccess ? (
        <EmptyState>서버에 다시 연결되면 카드 요약과 최근 Decision Card를 불러올게요.</EmptyState>
      ) : dashboard.isError && !dashboard.isSuccess ? (
        <ErrorState error={dashboard.error} onRetry={dashboard.refetch} title="대시보드를 불러오지 못했어요" />
      ) : (
        <>
          {dashboard.isError && !connectionLost && <ErrorState compact error={dashboard.error} onRetry={dashboard.refetch} />}
          <div className="section-head">
            <h2>
              카드 요약 <span className="summary-total">총 {total}개</span>
            </h2>
          </div>
          <section className="dashboard-grid wire-dashboard">
            <div>
              <section className="metrics metrics-three">
                <Metric
                  label="확정된 결정"
                  value={counts.confirmed}
                  icon="✓"
                  tint="#e8f8ee"
                  color="#16a34a"
                  onClick={() => navigate('/list', { status: 'CONFIRMED' })}
                />
                <Metric
                  label="보류된 결정"
                  value={counts.onHold}
                  icon="◷"
                  tint="#fff6e5"
                  color="#f59e0b"
                  onClick={() => navigate('/list', { status: 'ON_HOLD' })}
                />
                <Metric
                  label="검토 대기"
                  value={counts.inReview}
                  icon="▤"
                  tint="#f0f0ff"
                  color="#6366f1"
                  onClick={() => navigate('/review')}
                />
              </section>
              <div className="section-head">
                <h2>최근 생성된 Decision Card</h2>
                <button type="button" className="text-link" onClick={() => navigate('/list')}>
                  전체 보기 →
                </button>
              </div>
              <section className="decision-list">
                {recent.isLoading ? (
                  <LoadingState rows={3} />
                ) : recent.isError && !recent.isSuccess ? (
                  <ErrorState compact error={recent.error} onRetry={recent.refetch} />
                ) : recent.cards.length ? (
                  recent.cards.map((card) => (
                    <DecisionCard key={card.id} card={card} onOpen={() => navigate(`/decision/${encodeURIComponent(card.id)}`)} />
                  ))
                ) : (
                  <EmptyState>
                    아직 Decision Card가 없어요.
                    <br />
                    Discord를 동기화하면 AI가 결정 후보를 찾아 드려요.
                  </EmptyState>
                )}
              </section>
            </div>
            <aside className="panel quick-card">
              <h3>✦ 빠른 질문</h3>
              <p>최근 결정의 이유를 바로 찾아보세요.</p>
              {QUICK_QUESTIONS.map((q) => (
                <button key={q} type="button" className="filter prompt" onClick={() => navigate('/search', { q })}>
                  {q}
                </button>
              ))}
            </aside>
          </section>
        </>
      )}
      <div className="footer">까닭 KKADAK · 팀의 중요한 결정, 까닭까지 기억해요.</div>
    </>
  );
}
