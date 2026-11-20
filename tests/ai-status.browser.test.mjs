import test from 'node:test';
import assert from 'node:assert/strict';
import { runBrowserFixture } from './browser-fixture.mjs';

const guild = { id: 'guild', name: 'Fixture', owner: true, permissions: '32', icon: null };
const selection = { guilds: [guild], guildSelection: { status: 'ready', checkedAt: null } };
const defaults = ({ path }) => {
  if (path.endsWith('/auth/session')) return { data: { accessToken: 'fixture', expiresAt: new Date(Date.now() + 3600000).toISOString(), user: { id: 'user', name: 'User' }, ...selection } };
  if (path.endsWith('/auth/guilds')) return { data: selection };
  if (path.endsWith('/discord/channels')) return { data: { guildId: 'guild', channels: [], monitoredChannelIds: ['channel'] } };
  if (path.endsWith('/dashboard')) return { data: { counts: { confirmed: 0, onHold: 0, inReview: 0 }, recentDecisions: [], sync: { lastSuccessfulAt: null, latestJob: null } } };
  if (path.endsWith('/decisions')) return { data: { items: [], pageInfo: { page: 1, size: 3, totalElements: 0, totalPages: 0 } } };
  return { data: {} };
};

test('the dashboard walks through collect, AI analysis and result after a manual sync', async () => {
  const createdAt = new Date().toISOString();
  let jobReads = 0;
  let readsAfterComplete = 0;
  let completed = false;
  const job = (over) => ({ jobId: 'job-1', guildId: 'guild', createdAt, startedAt: createdAt, completedAt: null, errorMessage: null, forceFullSync: false, totalChannels: 2, completedChannels: 0, failedChannels: 0, messagesScanned: 0, decisionsFound: 0, status: 'QUEUED', ...over });
  const delivery = (status) => ({ requestId: 'r1', guildId: 'guild', channelId: 'channel', channelName: '기획-회의', status, attempts: 1, nextAttemptAt: 0, synchronizedAt: new Date().toISOString() });

  const result = await runBrowserFixture({
    route: '/#/dashboard',
    api: (context) => {
      const { path, req } = context;
      if (path.endsWith('/sync-jobs') && req.method === 'POST') return { status: 202, data: job({}) };
      if (path.endsWith('/sync-jobs/job-1')) {
        jobReads++;
        if (jobReads === 1) return { data: job({ status: 'PROCESSING', completedChannels: 1, messagesScanned: 148 }) };
        completed = true;
        return { data: job({ status: 'COMPLETED', completedChannels: 2, messagesScanned: 230, decisionsFound: 2, completedAt: new Date().toISOString() }) };
      }
      if (path.endsWith('/analysis-deliveries')) {
        if (!completed) return { data: { requests: [], available: true, lastSynchronizedAt: null } };
        readsAfterComplete++;
        return { data: { requests: [delivery(readsAfterComplete === 1 ? 'pending' : 'completed-with-candidates')], available: true, lastSynchronizedAt: null } };
      }
      return defaults(context);
    },
    source: `
      await wait(()=>document.body.textContent.includes('아직 AI 분석 기록이 없어요'));
      const sync=[...document.querySelectorAll('.sync-strip button')].find(b=>b.textContent.includes('지금 동기화'));
      await wait(()=>!sync.disabled); sync.click();
      await wait(()=>document.body.textContent.includes('Discord 메시지를 수집하고 있어요'));
      assert(document.body.textContent.includes('채널 1/2'),'collect progress missing');
      assert(document.querySelector('.ai-step.is-current')?.textContent.includes('메시지 수집'),'collect step was not current');
      await wait(()=>document.body.textContent.includes('AI가 #기획-회의 대화를 분석하고 있어요'));
      assert(document.querySelector('.ai-step.is-current')?.textContent.includes('AI 분석'),'analysis step was not current');
      const {invalidate}=await import('/src/hooks/queryBus.js'); invalidate('analysisDeliveries');
      await wait(()=>document.body.textContent.includes('결정 후보 2개를 찾았어요'));
      clickText('자세히');
      await wait(()=>document.querySelector('.ai-channel-table'));
      assert(document.querySelector('.ai-channel-table').textContent.includes('후보 저장 완료'),'channel status missing');
      assert(document.querySelector('.ai-job-info').textContent.includes('job-1'),'job id missing for debugging');
    `,
  });
  assert.equal(result.passed, true, result.error);
  assert.equal(result.requests.filter((r) => r.startsWith('POST /api/v1/sync-jobs')).length, 1);
});

test('a retained analysis failure can be retried from the detail table', async () => {
  const createdAt = new Date(Date.now() - 60000).toISOString();
  const result = await runBrowserFixture({
    route: '/#/dashboard',
    api: (context) => {
      const { path } = context;
      if (path.endsWith('/dashboard')) return { data: { counts: { confirmed: 0, onHold: 0, inReview: 0 }, recentDecisions: [], sync: { lastSuccessfulAt: createdAt, latestJob: { jobId: 'job-0', status: 'COMPLETED', createdAt, completedAt: createdAt, totalChannels: 1, completedChannels: 1, failedChannels: 0, messagesScanned: 10, decisionsFound: 0 } } } };
      if (path.endsWith('/analysis-deliveries')) return { data: { requests: [{ requestId: 'r9', guildId: 'guild', channelId: 'channel', channelName: '개발-논의', status: 'retained-failure', attempts: 3, nextAttemptAt: 0, lastError: 'LLM timeout', synchronizedAt: new Date().toISOString() }], available: true, lastSynchronizedAt: null } };
      if (path.endsWith('/retry')) return { status: 202, data: { id: 'cmd', requestId: 'r9', guildId: 'guild', createdAt, acknowledgedAt: null } };
      return defaults(context);
    },
    source: `
      await wait(()=>document.body.textContent.includes('분석에 실패한 채널이 1개 있어요'));
      clickText('자세히');
      await wait(()=>document.querySelector('.ai-retry'));
      assert(document.querySelector('.ai-channel-table').textContent.includes('LLM timeout'),'last error missing');
      document.querySelector('.ai-retry').click();
      await wait(()=>document.querySelector('.ai-channel-table').textContent.includes('재시도 접수됨'));
    `,
  });
  assert.equal(result.passed, true, result.error);
  assert.equal(result.requests.filter((r) => r.startsWith('POST /api/v1/analysis-deliveries/r9/retry')).length, 1);
});
