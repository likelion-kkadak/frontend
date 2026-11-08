import test from 'node:test';
import assert from 'node:assert/strict';
import { runBrowserFixture } from './browser-fixture.mjs';

test('restored account stays visible during verification cooldown and only manual retry resumes requests', async () => {
  const result = await runBrowserFixture({ api: async ({ path }) => {
    if (path.endsWith('/auth/session')) return { data: {
      accessToken: 'fixture', expiresAt: new Date(Date.now() + 3600000).toISOString(),
      user: { id: 'user', name: 'Cooldown User' }, guilds: [],
      guildSelection: { status: 'unavailable', checkedAt: null },
      guildVerification: { status: 'rate_limited', retryAt: new Date(Date.now() + 1800).toISOString(), eventCoverage: 'disconnected' },
    } };
    if (path.endsWith('/auth/guilds')) return { data: { guilds: [], guildSelection: { status: 'ready', checkedAt: null }, guildVerification: { status: 'ready', retryAt: null, eventCoverage: 'trusted' } } };
    return { data: {} };
  }, source: `
    await wait(()=>document.body.textContent.includes('서버 권한 확인 대기'));
    assert(document.body.textContent.includes('Cooldown User'),'blocked screen lost the logged-in account');
    assert(document.body.textContent.includes('로그인됨'),'blocked screen lost the account status');
    assert(document.body.textContent.includes('서버 멤버 변경 확인 연결이 끊겼어요'),'coverage warning missing');
    const retry=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('다시 시도'));
    assert(retry?.disabled,'retry must be disabled during cooldown');
    assert(document.querySelector('[data-retry-countdown]'),'retry countdown missing');
    const checks=async()=> (await (await fetch('/fixture-requests')).json()).filter(r=>r==='GET /api/v1/auth/guilds').length;
    window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('online'));
    await new Promise(r=>setTimeout(r,100));assert(await checks()===0,'focus bypassed cooldown');
    await wait(()=>!retry.disabled);
    window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('online'));
    await new Promise(r=>setTimeout(r,100));assert(await checks()===0,'clock expiry automatically resumed verification');
    retry.click();await wait(async()=>await checks()===1);
    await wait(()=>!document.body.textContent.includes('서버 권한 확인 대기'));
  ` });
  assert.equal(result.passed, true, result.error);
});
