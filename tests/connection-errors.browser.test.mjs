import test from 'node:test';
import assert from 'node:assert/strict';
import { runBrowserFixture } from './browser-fixture.mjs';

const guild = { id: 'guild', name: 'Fixture', owner: true, permissions: '32', icon: null };
const selection = { guilds: [guild], guildSelection: { status: 'ready', checkedAt: null } };
const dashboard = { counts: { confirmed: 2, onHold: 1, inReview: 3 }, recentDecisions: [], sync: { lastSuccessfulAt: null, latestJob: null } };
const defaults = ({ path }) => {
  if (path.endsWith('/auth/session')) return { data: { accessToken: 'fixture', expiresAt: new Date(Date.now() + 3600000).toISOString(), user: { id: 'user', name: 'User' }, ...selection } };
  if (path.endsWith('/auth/guilds')) return { data: selection };
  if (path.endsWith('/discord/channels')) return { data: { guildId: 'guild', channels: [], monitoredChannelIds: ['channel'] } };
  if (path.endsWith('/dashboard')) return { data: dashboard };
  if (path.endsWith('/review-queue')) return { data: { items: [], pageInfo: { page: 1, size: 20, totalElements: 0, totalPages: 0 } } };
  if (path.endsWith('/decisions')) return { data: { items: [], pageInfo: { page: 1, size: 3, totalElements: 0, totalPages: 0 } } };
  return { data: {} };
};
const healthy = { status: 200, body: { status: 'healthy', ready: true, checks: { database: true, bot: true, discord: true } } };

test('Bot outage keeps the workspace open and disables only sync', async () => {
  const result = await runBrowserFixture({
    route: '/#/dashboard',
    api: defaults,
    health: () => ({ status: 503, body: { status: 'degraded', ready: false, checks: { database: true, bot: false, discord: true } } }),
    source: `
      await wait(()=>document.body.textContent.includes('Bot 연결을 확인할 수 없습니다.'));
      const syncButtons=[...document.querySelectorAll('button')].filter(b=>b.textContent.includes('지금 동기화'));
      assert(syncButtons.length===2,'expected sidebar and dashboard sync buttons');
      assert(syncButtons.every(b=>b.disabled),'sync stayed enabled during a Bot outage');
      await wait(()=>document.querySelector('.metric-number')?.textContent==='2');
      assert(!document.querySelector('.connection-banner'),'Bot outage was reported as a server outage');
      clickText('검수 큐');
      await wait(()=>location.hash.includes('review'));
      assert(!document.body.textContent.includes('서버를 준비하고 있어요'),'review queue was gated');
    `,
  });
  assert.equal(result.passed, true, result.error);
  assert.equal(result.requests.some(r => r.startsWith('POST /api/v1/sync-jobs')), false);
});

test('Backend outage shows a retry banner without leaving the dashboard', async () => {
  const result = await runBrowserFixture({
    route: '/#/dashboard',
    api: context => (context.path.endsWith('/dashboard') ? { status: 503, data: null } : defaults(context)),
    health: () => ({ status: 502 }),
    source: `
      await wait(()=>document.querySelector('.connection-banner'));
      assert(document.body.textContent.includes('서버에 연결할 수 없습니다.'),'banner text missing');
      assert(document.querySelector('.shell'),'server outage left the dashboard');
      assert(!document.body.textContent.includes('대시보드를 불러오지 못했어요'),'outage replaced the dashboard with an error screen');
    `,
  });
  assert.equal(result.passed, true, result.error);
});

test('retrying while the backend stays down keeps the banner and re-enables the button', async () => {
  const result = await runBrowserFixture({
    route: '/#/dashboard',
    api: context => (context.path.endsWith('/dashboard') ? { status: 503, data: null } : defaults(context)),
    health: () => ({ status: 502 }),
    source: `
      await wait(()=>document.querySelector('.connection-banner button'));
      const button=document.querySelector('.connection-banner button');
      button.click();
      await wait(()=>!document.querySelector('.connection-banner button').disabled);
      assert(document.querySelector('.connection-banner'),'banner disappeared while the server was still down');
    `,
  });
  assert.equal(result.passed, true, result.error);
});

test('retry clears the banner after the backend recovers', async () => {
  let up = false;
  const result = await runBrowserFixture({
    route: '/#/dashboard',
    api: context => {
      if (context.path === '/api/v1/fixture-recover') { up = true; return { data: null }; }
      if (context.path.endsWith('/dashboard') && !up) return { status: 503, data: null };
      return defaults(context);
    },
    health: () => (up ? healthy : { status: 502 }),
    source: `
      await wait(()=>document.querySelector('.connection-banner button'));
      await fetch('/api/v1/fixture-recover');
      clickText('다시 시도');
      await wait(()=>!document.querySelector('.connection-banner'));
      await wait(()=>document.body.textContent.includes('확정된 결정'));
    `,
  });
  assert.equal(result.passed, true, result.error);
});
