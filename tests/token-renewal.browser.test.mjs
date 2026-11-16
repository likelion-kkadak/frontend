import test from 'node:test';
import assert from 'node:assert/strict';
import { runBrowserFixture } from './browser-fixture.mjs';

const guild = { id: 'guild', name: 'Fixture', owner: true, permissions: '32', icon: null };
const selection = { guilds: [guild], guildSelection: { status: 'ready', checkedAt: null } };
const session = (expiresAt = new Date(Date.now() + 3600000).toISOString()) => ({ accessToken: 'fixture', expiresAt, user: { id: 'user', name: 'User' }, ...selection });

test('scheduled renewal and concurrent 401 reads share one HTTP token request without guild polling', async () => {
  const result = await runBrowserFixture({ api: async ({ req, path }) => {
    if (path.endsWith('/auth/session')) return { data: session(new Date(Date.now() + 125000).toISOString()) };
    if (path.endsWith('/auth/token')) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      return { data: { accessToken: 'renewed', expiresAt: new Date(Date.now() + 3600000).toISOString(), userId: 'user' } };
    }
    if (path.includes('/protected/')) return req.headers.authorization === 'Bearer renewed' ? { data: { restored: true } } : { status: 401, data: null };
    if (path.endsWith('/discord/channels')) return { data: { channels: [], monitoredChannelIds: [] } };
    if (path.endsWith('/auth/guilds')) return { data: selection };
    return { data: {} };
  }, source: `
    await wait(()=>document.querySelector('.setup-wrap'));
    await new Promise(r=>setTimeout(r,4250));
    const {request}=await import('/src/api/client.js');
    const values=await Promise.all([1,2,3].map(i=>request({method:'GET',url:'/api/v1/protected/'+i})));
    assert(values.every(v=>v.restored),'safe reads did not recover');
  ` });
  assert.equal(result.passed, true, result.error);
  assert.equal(result.requests.filter(r => r === 'POST /api/v1/auth/token').length, 1);
  assert.equal(result.requests.filter(r => r === 'GET /api/v1/auth/guilds').length, 0);
  for (const id of [1, 2, 3]) assert.equal(result.requests.filter(r => r === `GET /api/v1/protected/${id}`).length, 2);
});

test('temporary token failure preserves the session and mutation recovery never replays the mutation', async () => {
  let renewals = 0;
  const result = await runBrowserFixture({ api: ({ req, path }) => {
    if (path.endsWith('/auth/session')) return { data: session() };
    if (path.endsWith('/auth/token')) return [1, 3].includes(++renewals) ? { status: 503, data: null } : { data: { accessToken: 'renewed', expiresAt: new Date(Date.now() + 3600000).toISOString(), userId: 'user' } };
    if (path.endsWith('/protected')) return req.headers.authorization === 'Bearer renewed' ? { data: { restored: true } } : { status: 401, data: null };
    if (path.endsWith('/mutation')) return { status: 401, data: null };
    if (path.endsWith('/discord/channels')) return { data: { channels: [], monitoredChannelIds: [] } };
    return { data: {} };
  }, source: `
    await wait(()=>document.querySelector('.setup-wrap'));
    const {request}=await import('/src/api/client.js');
    const {tokenStore}=await import('/src/api/tokenStore.js');
    const failure=await request({method:'GET',url:'/api/v1/protected'}).then(()=>0,e=>e.status);
    assert(failure===503&&tokenStore.get(),'temporary failure destroyed the authenticated session');
    assert((await request({method:'GET',url:'/api/v1/protected'})).restored,'explicit retry did not recover');
    const mutation=await request({method:'POST',url:'/api/v1/mutation'}).then(()=>0,e=>e.status);
    assert(mutation===401&&tokenStore.get(),'mutation recovery lost the original failure or session');
  ` });
  assert.equal(result.passed, true, result.error);
  assert.equal(result.requests.filter(r => r === 'POST /api/v1/auth/session').length, 1);
  assert.equal(result.requests.filter(r => r === 'POST /api/v1/mutation').length, 1);
  assert.equal(result.requests.filter(r => r === 'POST /api/v1/auth/logout').length, 0);
});

test('a token response from another account reboots the cookie session before any old read is retried', async () => {
  let restores = 0;
  const result = await runBrowserFixture({ api: ({ path }) => {
    if (path.endsWith('/auth/session')) return { data: ++restores === 1 ? session() : { ...session(), accessToken: 'other-account', user: { id: 'other', name: 'Other account' }, guilds: [{ ...guild, id: 'other-guild', name: 'Other server' }] } };
    if (path.endsWith('/auth/token')) return { data: { accessToken: 'unverified-other-token', expiresAt: new Date(Date.now() + 3600000).toISOString(), userId: 'other' } };
    if (path.endsWith('/protected')) return { status: 401, data: null };
    if (path.endsWith('/discord/channels')) return { data: { channels: [], monitoredChannelIds: [] } };
    return { data: {} };
  }, source: `
    await wait(()=>document.querySelector('#serverSelect')?.value==='guild');
    const {request}=await import('/src/api/client.js');
    await request({method:'GET',url:'/api/v1/protected'}).catch(()=>undefined);
    await wait(()=>document.querySelector('#serverSelect')?.value==='other-guild');
    const {tokenStore}=await import('/src/api/tokenStore.js');
    assert(tokenStore.get()?.accessToken==='other-account','unverified account token leaked before cookie restore');
  ` });
  assert.equal(result.passed, true, result.error);
  assert.equal(result.requests.filter(r => r === 'GET /api/v1/protected').length, 1);
  assert.equal(result.requests.filter(r => r === 'POST /api/v1/auth/session').length, 2);
});

test('logging out invalidates a late renewal response instead of restoring the old token', async () => {
  const result = await runBrowserFixture({ api: async ({ path }) => {
    if (path.endsWith('/auth/session')) return { data: session() };
    if (path.endsWith('/auth/token')) {
      await new Promise(resolve => setTimeout(resolve, 250));
      return { data: { accessToken: 'too-late', expiresAt: new Date(Date.now() + 3600000).toISOString(), userId: 'user' } };
    }
    if (path.endsWith('/auth/logout')) return { data: null };
    if (path.endsWith('/discord/channels')) return { data: { channels: [], monitoredChannelIds: [] } };
    return { data: {} };
  }, source: `
    await wait(()=>document.querySelector('.setup-wrap'));
    const {renewAccessToken}=await import('/src/api/client.js');
    const pending=renewAccessToken().then(()=>false,e=>e.code==='CANCELED');
    await wait(async()=> (await (await fetch('/fixture-requests')).json()).includes('POST /api/v1/auth/token'));
    clickText('로그아웃');
    await wait(()=>document.body.textContent.includes('Discord로 시작하기'));
    assert(await pending,'old authentication renewal survived logout');
    const {tokenStore}=await import('/src/api/tokenStore.js');
    assert(tokenStore.get()===null,'late renewal resurrected a logged-out token');
  ` });
  assert.equal(result.passed, true, result.error);
});
