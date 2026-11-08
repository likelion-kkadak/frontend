import test from 'node:test';
import assert from 'node:assert/strict';
import { runBrowserFixture } from './browser-fixture.mjs';

test('persistent permission verification failure does not repeatedly restart the workspace', async () => {
  const selection = { guilds: [{ id: 'guild', name: 'Fixture', owner: false, permissions: '0' }], guildSelection: { status: 'ready', checkedAt: null } };
  const result = await runBrowserFixture({ route: '/#/dashboard', api: async ({ path }) => {
    if (path.endsWith('/auth/session')) return { data: { accessToken: 'fixture', expiresAt: new Date(Date.now() + 3600000).toISOString(), user: { id: 'user', name: 'User' }, ...selection } };
    await new Promise(resolve => setTimeout(resolve, 10));
    if (path.endsWith('/auth/guilds')) return { data: selection };
    if (path.endsWith('/dashboard') || path.endsWith('/decisions')) return { status: 502, code: 'GUILD_ACCESS_UNAVAILABLE', data: null };
    return { data: {} };
  }, source: `
    await wait(async()=> (await (await fetch('/fixture-requests')).json()).some(r=>r==='GET /api/v1/auth/guilds'));
    await new Promise(r=>setTimeout(r,500));
    const requests=await (await fetch('/fixture-requests')).json();
    const checks=requests.filter(r=>r==='GET /api/v1/auth/guilds').length;
    assert(checks<=1,'persistent permission errors triggered '+checks+' automatic workspace restarts');
  ` });
  assert.equal(result.passed, true, result.error);
});

test('persistent failures stay gated through focus and manual failure, then manual recovery preserves the card draft', async () => {
  let failing = false;
  const selection = { guilds: [{ id: 'guild', name: 'Fixture', owner: true, permissions: '32' }], guildSelection: { status: 'ready', checkedAt: null } };
  const result = await runBrowserFixture({ route: '/#/decision/card', api: async ({ path }) => {
    if (path.endsWith('/fixture/fail')) { failing = true; return { data: null }; }
    if (path.endsWith('/fixture/recover')) { failing = false; return { data: null }; }
    if (path.endsWith('/auth/session')) return { data: { accessToken: 'fixture', expiresAt: new Date(Date.now() + 3600000).toISOString(), user: { id: 'user', name: 'User' }, ...selection } };
    await new Promise(resolve => setTimeout(resolve, 10));
    if (path.endsWith('/auth/guilds')) return { data: selection };
    if (failing && (path.endsWith('/dashboard') || path.includes('/decisions'))) return { status: 502, code: 'GUILD_ACCESS_UNAVAILABLE', data: null };
    if (path.endsWith('/decisions/card')) return { data: { id: 'card', version: 1, title: 'Fixture', decision: 'Saved decision', rationale: 'Saved rationale', status: 'CONFIRMED', alternatives: [], createdAt: '2026-11-01T00:00:00.000Z', source: { guildId: 'guild', channelId: 'channel', participants: [] } } };
    if (path.endsWith('/decisions')) return { data: { items: [], total: 0 } };
    return { data: {} };
  }, source: `
    await wait(()=>document.querySelector('#f-rationale'));
    const input=document.querySelector('#f-rationale');
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'Unsaved draft');
    input.dispatchEvent(new Event('input',{bubbles:true}));
    await fetch('/api/v1/fixture/fail');
    window.dispatchEvent(new Event('focus'));
    const gated=()=>Boolean(input.closest('[hidden]')&&document.body.textContent.includes('서버의 봇 설치 여부를 확인하지 못했어요'));
    await wait(gated);
    const checks=async()=> (await (await fetch('/fixture-requests')).json()).filter(r=>r==='GET /api/v1/auth/guilds').length;
    const stopped=await checks();
    for(let i=0;i<3;i++){window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('online'));}
    await new Promise(r=>setTimeout(r,150));
    assert(await checks()===stopped,'focus or online bypassed the recovery stop');
    clickText('다시 시도');
    await wait(async()=>await checks()>stopped); await wait(gated);
    await new Promise(r=>setTimeout(r,150));
    assert(await checks()===stopped+1,'manual failure restarted automatic recovery');
    await fetch('/api/v1/fixture/recover');
    clickText('다시 시도');
    await wait(()=>!input.closest('[hidden]'));
    await new Promise(r=>setTimeout(r,100));
    assert(input.isConnected&&input.value==='Unsaved draft','manual recovery lost the draft');
    const requests=await (await fetch('/fixture-requests')).json();
    assert(requests.filter(r=>r==='POST /api/v1/auth/session').length===1,'recovery replaced the login session');
    assert(!requests.some(r=>r.startsWith('POST /api/v1/auth/logout')),'recovery logged the user out');
    const recovered=await checks();
    await fetch('/api/v1/fixture/fail');
    const {getDashboard}=await import('/src/api/endpoints.js');
    await getDashboard('guild').catch(()=>undefined);
    await wait(gated);
    assert(await checks()===recovered+1,'a recovered episode did not permit one fresh recovery');
  ` });
  assert.equal(result.passed, true, result.error);
});

for (const unavailable of ['http', 'selection']) {
  test(`failed automatic list recovery (${unavailable}) remains stopped until manual retry`, async () => {
    let recovered = false;
    const selection = { guilds: [{ id: 'guild', name: 'Fixture', owner: true, permissions: '32' }], guildSelection: { status: 'ready', checkedAt: null } };
    const result = await runBrowserFixture({ route: '/#/dashboard', api: async ({ path }) => {
      if (path.endsWith('/fixture/recover')) { recovered = true; return { data: null }; }
      if (path.endsWith('/auth/session')) return { data: { accessToken: 'fixture', expiresAt: new Date(Date.now() + 3600000).toISOString(), user: { id: 'user', name: 'User' }, ...selection } };
      if (path.endsWith('/auth/guilds')) return recovered ? { data: selection } : unavailable === 'http' ? { status: 502, data: null } : { data: { guilds: [], guildSelection: { status: 'unavailable', checkedAt: null } } };
      if (!recovered && (path.endsWith('/dashboard') || path.endsWith('/decisions'))) return { status: 502, code: 'GUILD_ACCESS_UNAVAILABLE', data: null };
      return { data: {} };
    }, source: `
      await wait(()=>document.body.textContent.includes('서버의 봇 설치 여부를 확인하지 못했어요'));
      const checks=async()=> (await (await fetch('/fixture-requests')).json()).filter(r=>r==='GET /api/v1/auth/guilds').length;
      const stopped=await checks();
      window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('online'));
      await new Promise(r=>setTimeout(r,150));
      assert(await checks()===stopped,'focus bypassed failed list recovery');
      await fetch('/api/v1/fixture/recover');clickText('다시 시도');
      await wait(()=>!document.querySelector('[data-workspace]')?.hidden);
      assert(await checks()===stopped+1,'manual recovery did not perform one list read');
    ` });
    assert.equal(result.passed, true, result.error);
  });
}

test('a successful ordinary manual refresh preserves automatic recovery for a later genuine failure', async () => {
  let failing = false;
  const selection = { guilds: [{ id: 'guild', name: 'Fixture', owner: true, permissions: '32' }], guildSelection: { status: 'ready', checkedAt: null } };
  const result = await runBrowserFixture({ route: '/#/dashboard', api: async ({ path }) => {
    if (path.endsWith('/fixture/fail')) { failing = true; return { data: null }; }
    if (path.endsWith('/auth/session')) return { data: { accessToken: 'fixture', expiresAt: new Date(Date.now() + 3600000).toISOString(), user: { id: 'user', name: 'User' }, ...selection } };
    if (path.endsWith('/auth/guilds')) return { data: selection };
    if (failing && (path.endsWith('/dashboard') || path.endsWith('/decisions'))) return { status: 502, code: 'GUILD_ACCESS_UNAVAILABLE', data: null };
    return { data: {} };
  }, source: `
    await wait(()=>document.querySelector('.shell'));
    const checks=async()=> (await (await fetch('/fixture-requests')).json()).filter(r=>r==='GET /api/v1/auth/guilds').length;
    const before=await checks();
    clickText('서버 목록 새로고침');
    await wait(async()=>await checks()===before+1);
    await wait(()=>!document.querySelector('[data-workspace]').hidden);
    await new Promise(r=>setTimeout(r,100));
    await fetch('/api/v1/fixture/fail');
    const {getDashboard}=await import('/src/api/endpoints.js');
    await getDashboard('guild').catch(()=>undefined);
    await wait(()=>document.body.textContent.includes('서버의 봇 설치 여부를 확인하지 못했어요'));
    await new Promise(r=>setTimeout(r,100));
    assert(await checks()===before+2,'healthy manual refresh consumed the next automatic recovery');
  ` });
  assert.equal(result.passed, true, result.error);
});
