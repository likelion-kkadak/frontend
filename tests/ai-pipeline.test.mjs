import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveAiPipeline } from '../src/api/aiPipeline.js';

const created = '2026-11-16T10:00:00Z';
const job = (over = {}) => ({ jobId: 'j', status: 'PROCESSING', createdAt: created, totalChannels: 3, completedChannels: 1, failedChannels: 0, messagesScanned: 148, decisionsFound: 0, ...over });
const req = (status, over = {}) => ({ requestId: `${status}-${over.channelName ?? 'c'}`, channelId: 'c', channelName: '기획-회의', status, attempts: 1, synchronizedAt: '2026-11-16T10:05:00Z', ...over });
const states = (p) => p.steps.map((s) => s.state).join(',');

test('no job and no analysis is idle with every step pending', () => {
  const p = deriveAiPipeline({});
  assert.equal(p.phase, 'idle');
  assert.equal(states(p), 'todo,todo,todo,todo');
});

test('starting or queued job is the request step', () => {
  assert.equal(deriveAiPipeline({ isStarting: true }).phase, 'request');
  const p = deriveAiPipeline({ job: job({ status: 'QUEUED' }) });
  assert.equal(p.phase, 'request');
  assert.equal(states(p), 'current,todo,todo,todo');
});

test('processing job reports channel progress and scanned messages', () => {
  const p = deriveAiPipeline({ job: job() });
  assert.equal(p.phase, 'collect');
  assert.equal(states(p), 'done,current,todo,todo');
  assert.equal(p.progress, 33);
  assert.match(p.detail, /채널 1\/3/);
  assert.match(p.detail, /메시지 148개/);
});

test('unknown job status is treated as in progress and shown as-is', () => {
  const p = deriveAiPipeline({ job: job({ status: 'SCANNING' }) });
  assert.equal(p.phase, 'collect');
  assert.match(p.detail, /상태 SCANNING/);
});

test('completed job with pending analysis is the AI analysis step', () => {
  const p = deriveAiPipeline({
    job: job({ status: 'COMPLETED', completedChannels: 3 }),
    requests: [req('pending'), req('retry-pending', { channelName: '개발-논의' }), req('completed-no-decision', { channelName: '잡담' })],
  });
  assert.equal(p.phase, 'analyze');
  assert.equal(states(p), 'done,done,current,todo');
  assert.match(p.message, /#기획-회의, #개발-논의/);
  assert.match(p.detail, /자동 재시도 대기 1개/);
});

test('finished round reports found candidates', () => {
  const p = deriveAiPipeline({ job: job({ status: 'COMPLETED', decisionsFound: 3, completedAt: created }), requests: [req('completed-with-candidates')] });
  assert.equal(p.phase, 'result');
  assert.equal(p.tone, 'success');
  assert.equal(states(p), 'done,done,done,done');
  assert.match(p.message, /결정 후보 3개/);
});

test('finished round with a retained failure warns and marks the result step', () => {
  const p = deriveAiPipeline({ job: job({ status: 'COMPLETED' }), requests: [req('retained-failure'), req('completed-no-decision', { channelName: '잡담' })] });
  assert.equal(p.phase, 'result');
  assert.equal(p.tone, 'warning');
  assert.equal(p.steps[3].state, 'warning');
  assert.equal(p.round[0].status, 'retained-failure', 'failures are listed first');
});

test('failed job marks the collect step as an error with the server message', () => {
  const p = deriveAiPipeline({ job: job({ status: 'FAILED', errorMessage: 'Missing Access' }) });
  assert.equal(p.phase, 'failed');
  assert.equal(states(p), 'done,error,todo,todo');
  assert.equal(p.detail, 'Missing Access');
});

test('analysis updated before this job belongs to an earlier round', () => {
  const p = deriveAiPipeline({ job: job({ status: 'COMPLETED' }), requests: [req('retained-failure', { synchronizedAt: '2026-11-15T09:00:00Z' })] });
  assert.equal(p.failures.length, 0);
  assert.equal(p.round.length, 0);
});
