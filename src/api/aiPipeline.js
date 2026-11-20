import { ANALYSIS_STATUS_LABEL, SYNC_JOB_STATUS, formatRelative } from './models.js';

/**
 * AI 동작 상태: 동기화 Job(수집)과 분석 요청 목록(AI 분석)을 합쳐 지금 어느 단계인지 계산한다.
 * 시연·디버깅 때 "AI가 실제로 무엇을 하고 있는지" 화면에서 볼 수 있게 하기 위함.
 *
 * 단계: 수집 요청 → 메시지 수집 → AI 분석 → 결과
 * - Job.status는 명세상 자유 문자열이라, 알려지지 않은 값은 "진행 중"으로 보고 원래 값을 그대로 노출한다.
 * - 분석 요청은 채널 단위이며, 이번 동기화 이후 갱신된 항목(synchronizedAt ≥ Job 생성 시각)을 이번 회차로 본다.
 */
export const AI_STEPS = [
  { key: 'request', label: '수집 요청' },
  { key: 'collect', label: '메시지 수집' },
  { key: 'analyze', label: 'AI 분석' },
  { key: 'result', label: '결과' },
];

const IN_PROGRESS = new Set(['pending', 'retry-pending']);
/** 상세 목록 정렬: 손이 필요한 것 → 진행 중 → 완료 */
const STATUS_ORDER = ['retained-failure', 'retry-pending', 'pending', 'completed-with-candidates', 'completed-no-decision'];

const isTerminal = (job) => job?.status === SYNC_JOB_STATUS.COMPLETED || job?.status === SYNC_JOB_STATUS.FAILED;

export const channelLabel = (request) => `#${request.channelName || request.channelId}`;

export const analysisStatusLabel = (status) => ANALYSIS_STATUS_LABEL[status] ?? status ?? '알 수 없음';

/**
 * @param {object} input
 * @param {object|null} input.job        진행 중이거나 마지막 동기화 Job (SyncJobView)
 * @param {boolean} [input.isStarting]   Job 생성 요청을 보내는 중
 * @param {object[]} [input.requests]    분석 요청 목록 (useAnalysisDeliveries의 requests)
 * @returns {{
 *   phase: 'idle'|'request'|'collect'|'analyze'|'result'|'failed',
 *   steps: { key: string, label: string, state: 'done'|'current'|'warning'|'error'|'todo' }[],
 *   message: string, detail: string|null, tone: 'info'|'success'|'warning'|'error',
 *   progress: number|null, candidates: number, analyzing: object[], failures: object[], round: object[],
 * }}
 */
export function deriveAiPipeline({ job = null, isStarting = false, requests = [] }) {
  const since = job?.createdAt ? Date.parse(job.createdAt) : NaN;
  const round = Number.isNaN(since)
    ? requests
    : requests.filter((r) => {
        const at = Date.parse(r.synchronizedAt);
        return Number.isNaN(at) || at >= since;
      });
  const sorted = [...round].sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status));
  // 진행 중인 분석은 회차와 관계없이 지금 일어나는 일이므로 전체에서 본다
  const analyzing = requests.filter((r) => IN_PROGRESS.has(r.status));
  const failures = round.filter((r) => r.status === 'retained-failure');
  const channelsWithCandidates = round.filter((r) => r.status === 'completed-with-candidates').length;
  const candidates = job?.status === SYNC_JOB_STATUS.COMPLETED ? job.decisionsFound ?? 0 : 0;

  let phase;
  if (isStarting || job?.status === SYNC_JOB_STATUS.QUEUED) phase = 'request';
  else if (job && !isTerminal(job)) phase = 'collect';
  else if (job?.status === SYNC_JOB_STATUS.FAILED) phase = 'failed';
  else if (analyzing.length) phase = 'analyze';
  else if (job || round.length) phase = 'result';
  else phase = 'idle';

  const order = AI_STEPS.map((s) => s.key);
  const currentIndex = phase === 'failed' ? order.indexOf('collect') : order.indexOf(phase);
  const resultHasError = phase === 'result' && failures.length > 0;
  const steps = AI_STEPS.map((step, i) => {
    let state = 'todo';
    if (phase === 'idle') state = 'todo';
    else if (phase === 'failed' && i === currentIndex) state = 'error';
    else if (i < currentIndex) state = 'done';
    // 일부 채널만 실패한 결과는 오류가 아니라 확인이 필요한 상태(warning)로 둔다
    else if (i === currentIndex) state = phase === 'result' ? (resultHasError ? 'warning' : 'done') : 'current';
    return { ...step, state };
  });

  const total = job?.totalChannels ?? 0;
  const doneChannels = (job?.completedChannels ?? 0) + (job?.failedChannels ?? 0);
  const progress = phase === 'collect' && total ? Math.round((doneChannels / total) * 100) : null;
  const finishedAt = formatRelative(job?.completedAt);

  let message;
  let detail = null;
  let tone = 'info';
  switch (phase) {
    case 'request':
      message = '동기화를 요청했어요. Bot이 작업을 시작하길 기다리고 있어요.';
      break;
    case 'collect':
      message = 'Discord 메시지를 수집하고 있어요.';
      detail = [
        total ? `채널 ${doneChannels}/${total}` : null,
        job?.messagesScanned != null ? `메시지 ${job.messagesScanned}개 확인` : null,
        job?.failedChannels ? `실패 채널 ${job.failedChannels}개` : null,
        job?.status && job.status !== SYNC_JOB_STATUS.PROCESSING ? `상태 ${job.status}` : null,
      ]
        .filter(Boolean)
        .join(' · ');
      break;
    case 'analyze': {
      const names = analyzing.slice(0, 2).map(channelLabel).join(', ');
      const more = analyzing.length > 2 ? ` 외 ${analyzing.length - 2}개` : '';
      message = `AI가 ${names}${more} 대화를 분석하고 있어요.`;
      const waiting = analyzing.filter((r) => r.status === 'retry-pending').length;
      detail = waiting ? `자동 재시도 대기 ${waiting}개` : null;
      break;
    }
    case 'failed':
      tone = 'error';
      message = '동기화에 실패했어요.';
      detail = job?.errorMessage || '설정에서 채널 연결 상태를 확인한 뒤 다시 시도해 주세요.';
      break;
    case 'result':
      if (candidates > 0) {
        tone = 'success';
        message = `결정 후보 ${candidates}개를 찾았어요.`;
      } else if (channelsWithCandidates > 0) {
        tone = 'success';
        message = `채널 ${channelsWithCandidates}개에서 결정 후보를 찾았어요.`;
      } else {
        message = '새로 찾은 결정 후보가 없어요.';
      }
      if (failures.length) {
        tone = 'warning';
        detail = `분석에 실패한 채널이 ${failures.length}개 있어요.`;
      } else if (finishedAt) {
        detail = `${finishedAt} 완료`;
      }
      break;
    default:
      message = '아직 AI 분석 기록이 없어요.';
      detail = '지금 동기화를 누르면 Discord 대화를 수집해 AI가 결정 후보를 찾아요.';
  }

  return { phase, steps, message, detail, tone, progress, candidates, analyzing, failures, round: sorted };
}
