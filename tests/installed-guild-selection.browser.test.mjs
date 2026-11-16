import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('cookie bootstrap and selection revalidation gate stale guild data without logging out', { timeout: 45000 }, async () => {
  const requests = [];
  let reportResult;
  const browserResult = new Promise(resolveResult => { reportResult = resolveResult; });
  let guildReads = 0;
  let protectedReads = 0;
  const guild = { id: 'installed', name: '설치된 서버', permissions: '0', owner: false };
  const other = { ...guild, id: 'other', name: '다른 설치 서버' };
  // unavailable에 잘못 섞인 stale 목록도 UI가 방어적으로 제거해야 한다.
  const snapshot = () => ({ guilds: guildReads === 2 ? [] : guildReads >= 3 ? [guild, other] : [guild], guildSelection: { status: [1, 4].includes(guildReads) ? 'unavailable' : 'ready', checkedAt: null } });
  const server = await createServer({ root, configFile: false, server: { host: '127.0.0.1', port: 0 }, appType: 'custom', plugins: [react(), {
    name: 'selection-browser-fixture',
    configureServer(vite) {
      vite.middlewares.use(async (req, res, next) => {
        if (req.url === '/fixture-result') {
          let body = '';
          for await (const chunk of req) body += chunk;
          res.end('ok'); reportResult(body); return;
        }
        if (req.url.startsWith('/api/')) {
          requests.push(`${req.method} ${req.url}`);
          let data;
          if (req.url === '/api/v1/auth/session') data = { accessToken: 'fixture', expiresAt: new Date(Date.now() + 3600000).toISOString(), user: { id: 'user', name: '사용자' }, ...snapshot() };
          else if (req.url === '/api/v1/auth/guilds') {
            guildReads++;
            if (guildReads === 6) { res.statusCode = 401; data = null; }
            else data = snapshot();
          }
          else if (req.url === '/api/v1/auth/login') data = { accessToken: 'next-account', expiresAt: new Date(Date.now() + 3600000).toISOString(), user: { id: 'next-user', name: '다른 사용자' }, guilds: [{ ...guild, id: 'next-guild' }], guildSelection: { status: 'ready', checkedAt: null } };
          else if (req.url === '/api/v1/auth/token') data = { accessToken: 'renewed', expiresAt: new Date(Date.now() + 3600000).toISOString(), userId: 'next-user' };
          else if (req.url === '/api/v1/protected' && ++protectedReads > 1) data = { restored: true };
          else if (req.url === '/api/v1/slow') {
            data = { title: '이전 서버 카드' };
          }
          else { res.statusCode = 401; data = null; }
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: res.statusCode === 200, data, code: 'UNAUTHORIZED' }));
          return;
        }
        if (req.url !== '/') return next();
        const html = await vite.transformIndexHtml('/', `<html><body><div id="root"></div><script type="module">
          import React from 'react';
          import {createRoot} from 'react-dom/client';
          import {AuthProvider,useAuth} from '/src/hooks/useAuth.jsx';
          import {request} from '/src/api/client.js';
          import {tokenStore} from '/src/api/tokenStore.js';
          function Probe(){ const a=useAuth(); window.auth=a; return React.createElement('pre',{id:'state'},JSON.stringify({status:a.status,guildId:a.guildId,selection:a.guildSelection,guilds:a.guilds.map(g=>g.id)})); }
          createRoot(document.getElementById('root')).render(React.createElement(AuthProvider,null,React.createElement(Probe)));
          const wait = async (p) => { for(let i=0;i<150;i++){if(p())return;await new Promise(r=>setTimeout(r,20));}throw Error('state timeout '+document.body.textContent); };
          try {
            await wait(()=>window.auth?.isAuthenticated);
            if(window.auth.guildId!=='installed')throw Error('cookie session not restored');
            await window.auth.reloadGuilds();
            await wait(()=>window.auth.guildSelection?.status==='unavailable');
            if(window.auth.guildId!==null||!window.auth.isAuthenticated)throw Error('unavailable leaked selection or logged out');
            await window.auth.reloadGuilds();
            await wait(()=>window.auth.guildSelection?.status==='ready');
            if(window.auth.guilds.length!==0||window.auth.guildId!==null)throw Error('empty snapshot retained server');
            window.dispatchEvent(new Event('focus'));
            await wait(()=>window.auth.guilds.length===2&&!window.auth.isRevalidating);
            window.auth.selectGuild('other');
            await wait(()=>window.auth.guildId==='other');
            await window.auth.reloadGuilds();
            await wait(()=>window.auth.guildSelection.status==='unavailable');
            if(window.auth.guildId!==null)throw Error('unavailable exposed preferred guild');
            await window.auth.reloadGuilds();
            await wait(()=>window.auth.guildId==='other');
            const stale = request({method:'GET',url:'/api/v1/slow'}).then(()=>false,e=>e.code==='CANCELED');
            window.auth.selectGuild('installed');
            await wait(()=>window.auth.guildId==='installed');
            if(!await stale)throw Error('old guild response survived selection change');
            const oldAccount = request({method:'GET',url:'/api/v1/slow'}).then(()=>false,e=>e.code==='CANCELED');
            await window.auth.completeLogin({code:'fixture',state:'fixture'});
            await wait(()=>window.auth.user?.id==='next-user');
            if(!await oldAccount||window.auth.guildId!=='next-guild')throw Error('old account response crossed login');
            if(!(await request({method:'GET',url:'/api/v1/protected'})).restored)throw Error('safe GET did not recover token');
            const mutationDenied = await request({method:'POST',url:'/api/v1/mutation'}).then(()=>false,e=>e.status===401);
            if(!mutationDenied||!window.auth.isAuthenticated)throw Error('mutation recovery logged out or hid rejection');
            tokenStore.set({accessToken:'expired',userId:'next-user',expiresAt:'2000-01-01T00:00:00.000Z'});
            await window.auth.reloadGuilds().catch(()=>undefined);
            await wait(()=>window.auth.user?.id==='user'&&window.auth.isAuthenticated&&!window.auth.isRevalidating);
            document.body.dataset.result='passed';
          }catch(e){document.body.dataset.result='failed';document.body.append(e.message);}
          finally { await fetch('/fixture-result',{method:'POST',body:document.documentElement.outerHTML}); }
        </script></body></html>`);
        res.setHeader('Content-Type', 'text/html'); res.end(html);
      });
    },
  }] });
  const profile = await mkdtemp(resolve(tmpdir(), 'ggaddak-browser-'));
  try {
    await server.listen();
    const port = server.httpServer.address().port;
    const output = await new Promise((resolveOutput, reject) => {
      const browser = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, `http://127.0.0.1:${port}/`], { stdio: 'ignore' });
      browser.on('error', reject);
      browserResult.then(output => { clearTimeout(timer); browser.kill('SIGTERM'); browser.once('close', () => resolveOutput(output)); });
      const timer = setTimeout(() => { browser.kill('SIGKILL'); reject(Error('browser timeout: ' + requests.join(', '))); }, 15000);
      browser.on('close', () => clearTimeout(timer));
    });
    assert.match(output, /data-result="passed"/, output);
    assert.equal(requests.filter(r => r === 'GET /api/v1/auth/guilds').length, 6);
    assert.equal(requests.filter(r => r === 'POST /api/v1/auth/session').length, 2);
    assert.equal(requests.filter(r => r === 'POST /api/v1/auth/token').length, 2);
    assert.equal(requests.filter(r => r === 'GET /api/v1/protected').length, 2);
    assert.equal(requests.filter(r => r === 'POST /api/v1/mutation').length, 1);
  } finally {
    await server.close(); await rm(profile, { recursive: true, force: true });
  }
});
