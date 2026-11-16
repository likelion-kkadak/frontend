import test from 'node:test';
import assert from 'node:assert/strict';
import { runBrowserFixture } from './browser-fixture.mjs';

const guild = { id: 'guild', name: 'Fixture', owner: true, permissions: '32', icon: null };
const selection = { guilds: [guild], guildSelection: { status: 'ready', checkedAt: null } };
const defaults = ({ path }) => {
  if (path.endsWith('/auth/session')) return { data: { accessToken: 'fixture', expiresAt: new Date(Date.now() + 3600000).toISOString(), user: { id: 'user', name: 'User' }, ...selection } };
  if (path.endsWith('/auth/guilds')) return { data: selection };
  if (path.endsWith('/discord/channels')) return { data: { guildId: 'guild', channels: [{ id: 'channel', guildId: 'guild', name: 'general', type: 0, accessible: true }], monitoredChannelIds: [] } };
  return { data: {} };
};

test('same eligible server preserves unsaved channel selection after focus revalidation', async () => {
  const result = await runBrowserFixture({ api: defaults, source: `
    await wait(()=>document.querySelector('.channel-checks input:not(:disabled)'));
    document.querySelector('.channel-checks input').click();
    await wait(()=>document.querySelector('.channel-checks input').checked);
    window.dispatchEvent(new Event('focus'));
    await wait(async()=> (await (await fetch('/fixture-requests')).json()).some(r=>r==='GET /api/v1/auth/guilds'));
    await new Promise(r=>setTimeout(r,100));
    await wait(()=>document.querySelector('.channel-checks input')&&!document.body.textContent.includes('봇이 설치된 서버를 확인하고 있어요'));
    assert(document.querySelector('.channel-checks input').checked,'unsaved channel selection was lost');
  ` });
  assert.equal(result.passed, true, result.error);
});

test('same eligible server preserves the real Decision Record editor across manual refresh', async () => {
  const result = await runBrowserFixture({ route: '/#/decision/card', api: context => {
    if (context.path.endsWith('/decisions/card')) return { data: { id: 'card', version: 1, title: 'Fixture decision', decision: 'Saved decision', rationale: 'Saved rationale', status: 'CONFIRMED', alternatives: [], createdAt: '2026-11-01T00:00:00.000Z', source: { guildId: 'guild', channelId: 'channel', participants: [] } } };
    return defaults(context);
  }, source: `
    await wait(()=>document.querySelector('#f-rationale'));
    const input=document.querySelector('#f-rationale');
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'Unsaved rationale');
    input.dispatchEvent(new Event('input',{bubbles:true}));
    await new Promise(r=>setTimeout(r,20));
    clickText('서버 목록 새로고침');
    await wait(async()=> (await (await fetch('/fixture-requests')).json()).some(r=>r==='GET /api/v1/auth/guilds'));
    await new Promise(r=>setTimeout(r,100));
    assert(document.querySelector('#f-rationale')?.value==='Unsaved rationale','Decision Record draft was lost');
    assert(document.querySelector('#f-rationale')===input,'same server editor was remounted');
  ` });
  assert.equal(result.passed, true, result.error);
});

test('unknown selection hides and blocks a retained draft, recovery restores it, and revocation discards it', async () => {
  let reads = 0;
  const result = await runBrowserFixture({ api: context => {
    if (context.path.endsWith('/auth/guilds')) {
      reads++;
      return { data: reads === 1 ? { guilds: [], guildSelection: { status: 'unavailable', checkedAt: null } } : reads === 2 ? selection : { guilds: [], guildSelection: { status: 'ready', checkedAt: null } } };
    }
    return defaults(context);
  }, source: `
    await wait(()=>document.querySelector('.channel-checks input:not(:disabled)'));
    const input=document.querySelector('.channel-checks input'); input.click();
    await wait(()=>input.checked);
    window.dispatchEvent(new Event('focus'));
    await wait(()=>document.body.textContent.includes('서버의 봇 설치 여부를 확인하지 못했어요'));
    assert(input.closest('[hidden]')&&input.closest('[inert]'),'unverified draft was visible or interactive');
    const {request}=await import('/src/api/client.js');
    const blocked=await request({method:'PUT',url:'/api/v1/discord/channels',data:{channelIds:['channel']}}).then(()=>false,e=>e.code==='CANCELED');
    assert(blocked,'unverified mutation reached HTTP');
    clickText('다시 시도');
    await wait(()=>!input.closest('[hidden]'));
    assert(input.checked,'recovered eligible server lost draft');
    clickText('서버 목록 새로고침');
    await wait(()=>document.body.textContent.includes('봇이 설치된 가입 서버가 없습니다'));
    assert(!input.isConnected,'revoked server retained its draft subtree');
  ` });
  assert.equal(result.passed, true, result.error);
  assert.equal(result.requests.some(r => r.startsWith('PUT ')), false);
});

test('canceling Discord login can return to the login screen without a cookie session', async () => {
  const result = await runBrowserFixture({ route: '/?state=fixture&error=access_denied', api: context => {
    if (context.path.endsWith('/auth/session')) return { status: 401, data: null };
    return defaults(context);
  }, source: `
    await wait(()=>document.body.textContent.includes('Discord 로그인에 실패했어요'));
    clickText('처음 화면으로');
    await wait(()=>document.body.textContent.includes('Discord로 시작하기'));
    assert(!document.body.textContent.includes('로그인 정보를 확인하고 있어요'),'callback cancellation remained checking');
  ` });
  assert.equal(result.passed, true, result.error);
  assert.equal(result.requests.filter(r => r.startsWith('POST /api/v1/auth/login')).length, 0);
});

test('canceling login restores an existing cookie session when returning to the first screen', async () => {
  const result = await runBrowserFixture({ route: '/?state=fixture&error=access_denied', api: defaults, source: `
    await wait(()=>document.body.textContent.includes('Discord 로그인에 실패했어요'));
    clickText('처음 화면으로');
    await wait(()=>document.querySelector('.shell'));
    assert(document.body.textContent.includes('Fixture'),'existing account server was not restored');
  ` });
  assert.equal(result.passed, true, result.error);
  assert.equal(result.requests.filter(r => r === 'POST /api/v1/auth/session').length, 1);
});

test('an incomplete state-only URL still restores the browser session', async () => {
  const result = await runBrowserFixture({ route: '/?state=incomplete#/setup', api: defaults, source: `
    await wait(()=>document.querySelector('.channel-checks input:not(:disabled)'));
    assert(!document.body.textContent.includes('로그인 정보를 확인하고 있어요'),'incomplete URL prevented session restore');
  ` });
  assert.equal(result.passed, true, result.error);
});

test('retrying canceled OAuth obtains a fresh authorization and consumes its login once', async () => {
  let posted;
  const result = await runBrowserFixture({ route: '/?state=old-state&error=access_denied', api: async context => {
    if (context.path.endsWith('/auth/authorize')) return { data: { url: `http://${context.req.headers.host}/?state=fresh-state&code=fresh-code` } };
    if (context.path.endsWith('/auth/login')) {
      let body=''; for await (const chunk of context.req) body+=chunk;
      posted=JSON.parse(body);
      return { data: defaults({ path: '/api/v1/auth/session' }).data };
    }
    return defaults(context);
  }, source: `
    if (!sessionStorage.getItem('retry-phase')) {
      await wait(()=>document.body.textContent.includes('Discord 로그인에 실패했어요'));
      sessionStorage.setItem('retry-phase','started');
      clickText('다시 로그인');
      await new Promise(()=>{});
    } else {
      await wait(()=>document.querySelector('.channel-checks input:not(:disabled)'));
      assert(!window.location.search,'one-time OAuth parameters were retained');
    }
  ` });
  assert.equal(result.passed, true, result.error);
  assert.deepEqual(posted, { code: 'fresh-code', state: 'fresh-state' });
  assert.equal(result.requests.filter(r => r === 'GET /api/v1/auth/authorize').length, 1);
  assert.equal(result.requests.filter(r => r === 'POST /api/v1/auth/login').length, 1);
});
