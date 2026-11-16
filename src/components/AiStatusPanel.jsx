import { useEffect, useRef, useState } from 'react';
import { analysisStatusLabel, channelLabel, deriveAiPipeline } from '../api/aiPipeline.js';
import { formatDateTime, formatRelative } from '../api/models.js';
import { invalidate, TAGS } from '../hooks/queryBus.js';
import { useAnalysisDeliveries } from '../hooks/useAnalysisDeliveries.js';
import { useServerHealth } from '../hooks/useServerHealth.jsx';
import { navigate } from '../router.js';

const ACTIVE = new Set(['request', 'collect', 'analyze']);

/**
 * AI 동작 상태 패널 (대시보드).
 * 동기화 중에는 단계(수집 요청 → 메시지 수집 → AI 분석 → 결과)를 보여주고,
 * 끝나면 결과 요약만 남긴다. "자세히"를 펼치면 채널별 분석 상태와 작업 정보를 볼 수 있다.
 *
 * @param {object} props
 * @param {string} props.guildId
 * @param {object} props.sync        useSyncJob 결과
 * @param {object|null} props.latestJob dashboard의 마지막 Job (페이지 진입 시 진행 중인 Job 포함)
 * @param {boolean} props.canManage
 */
export default function AiStatusPanel({ guildId, sync, latestJob, canManage }) {
  const deliveries = useAnalysisDeliveries(guildId);
  const health = useServerHealth();
  const [open, setOpen] = useState(false);

  const job = sync.job ?? latestJob ?? null;
  const pipeline = deriveAiPipeline({ job, isStarting: sync.isStarting, requests: deliveries.requests });
  const active = ACTIVE.has(pipeline.phase);

  // 수집이 진행되거나 끝나면 분석 요청 목록도 다시 읽어 AI 분석 단계로 자연스럽게 넘어가게 한다
  // (처음 화면에 들어올 때는 목록을 이미 읽고 있으므로 건너뛴다)
  const jobKey = `${job?.jobId}:${job?.status}:${job?.completedChannels}:${job?.failedChannels}`;
  const lastJobKey = useRef(jobKey);
  useEffect(() => {
    if (lastJobKey.current === jobKey) return;
    lastJobKey.current = jobKey;
    if (job?.jobId) invalidate(TAGS.ANALYSIS);
  }, [jobKey, job?.jobId]);

  const staleText = deliveries.isStale
    ? `Bot 상태가 최근에 갱신되지 않아 실제와 다를 수 있어요${
        deliveries.lastSynchronizedAt ? ` · 마지막 갱신 ${formatRelative(deliveries.lastSynchronizedAt)}` : ''
      }`
    : null;

  return (
    <section className={`panel ai-status ai-status-${pipeline.tone}`} aria-label="AI 동작 상태">
      <div className="ai-status-head">
        <span className={`ai-status-dot${active ? ' is-active' : ''}`} aria-hidden="true" />
        <div className="ai-status-text" role="status" aria-live="polite">
          <b>
            <span className="ai-status-kicker">AI 동작 상태</span>
            {pipeline.message}
          </b>
          {pipeline.detail && <p>{pipeline.detail}</p>}
        </div>
        {pipeline.phase === 'result' && pipeline.candidates > 0 && (
          <button type="button" className="text-link" onClick={() => navigate('/review')}>
            검수 큐 보기 →
          </button>
        )}
        <button type="button" className="text-link ai-status-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? '접기' : '자세히'}
        </button>
      </div>

      {(active || open) && (
        <ol className="ai-steps">
          {pipeline.steps.map((step, i) => (
            <li key={step.key} className={`ai-step is-${step.state}`} aria-current={step.state === 'current' ? 'step' : undefined}>
              <span className="ai-step-mark" aria-hidden="true">
                {step.state === 'done' ? '✓' : step.state === 'error' || step.state === 'warning' ? '!' : i + 1}
              </span>
              <span className="ai-step-label">{step.label}</span>
            </li>
          ))}
        </ol>
      )}
      {pipeline.progress != null && (
        <div className="sync-progress ai-status-progress" aria-label={`수집 진행률 ${pipeline.progress}%`}>
          <i style={{ width: `${pipeline.progress}%` }} />
        </div>
      )}

      {(health.isBotDown || staleText) && (
        <p className="ai-status-note">
          {health.isBotDown ? 'Bot 연결이 끊겨 새 수집·분석이 진행되지 않아요. 이미 저장된 후보는 그대로 검수할 수 있어요.' : staleText}
        </p>
      )}

      {open && (
        <div className="ai-status-detail">
          <ChannelTable deliveries={deliveries} rows={pipeline.round} canManage={canManage} botDown={health.isBotDown} />
          {job && <JobInfo job={job} />}
        </div>
      )}
    </section>
  );
}

function ChannelTable({ deliveries, rows, canManage, botDown }) {
  if (deliveries.isLoading) return <p className="muted">채널별 분석 상태를 불러오는 중…</p>;
  if (deliveries.isError && !deliveries.isSuccess) {
    return (
      <p className="muted">
        채널별 분석 상태를 불러오지 못했어요.{' '}
        <button type="button" className="text-link" onClick={deliveries.refetch}>
          다시 시도
        </button>
      </p>
    );
  }
  if (!rows.length) return <p className="muted">이번 동기화에서 분석한 채널이 아직 없어요.</p>;

  return (
    <>
      <div className="table-wrap ai-channel-wrap">
        <table className="ai-channel-table">
          <thead>
            <tr>
              <th>채널</th>
              <th>상태</th>
              <th>시도</th>
              <th>다음 재시도</th>
              <th>마지막 오류</th>
              <th aria-label="조치" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.requestId}>
                <td className="ai-channel-name">{channelLabel(r)}</td>
                <td>
                  <span className={`ai-badge ai-badge-${r.status}`}>{r.isRetrying ? '재시도 접수됨' : analysisStatusLabel(r.status)}</span>
                </td>
                <td>{r.attempts ?? 0}회</td>
                <td>{r.nextAttemptDate ? formatDateTime(r.nextAttemptDate.toISOString()) : '—'}</td>
                <td className="ai-channel-error" title={r.lastError || undefined}>
                  {r.lastError || r.errorCategory || '—'}
                </td>
                <td>
                  {r.canRetry && canManage && (
                    <button
                      type="button"
                      className="btn btn-outline ai-retry"
                      disabled={botDown || deliveries.retryingId === r.requestId}
                      title={botDown ? 'Bot 연결을 확인할 수 없어 재시도할 수 없어요' : undefined}
                      onClick={() => deliveries.retry(r)}
                    >
                      {deliveries.retryingId === r.requestId ? '요청 중…' : '다시 분석'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {deliveries.retryError && <p className="api-error-inline">{deliveries.retryErrorMessage}</p>}
    </>
  );
}

/** 디버깅용 작업 정보 */
function JobInfo({ job }) {
  const items = [
    ['작업 ID', job.jobId],
    ['상태', job.status],
    ['채널', `${job.completedChannels ?? 0} 완료 · ${job.failedChannels ?? 0} 실패 / 전체 ${job.totalChannels ?? 0}`],
    ['확인한 메시지', `${job.messagesScanned ?? 0}개`],
    ['찾은 후보', `${job.decisionsFound ?? 0}개`],
    ['전체 다시 수집', job.forceFullSync ? '예' : '아니오'],
    ['요청', formatDateTime(job.createdAt)],
    ['시작', formatDateTime(job.startedAt)],
    ['완료', formatDateTime(job.completedAt)],
  ];
  return (
    <dl className="ai-job-info">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v || '—'}</dd>
        </div>
      ))}
      {job.errorMessage && (
        <div className="ai-job-error">
          <dt>오류</dt>
          <dd>{job.errorMessage}</dd>
        </div>
      )}
    </dl>
  );
}
