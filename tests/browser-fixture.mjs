import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Executes real React screens against a controlled HTTP boundary and reports browser assertions. */
export async function runBrowserFixture({ source, route = '/#/setup', api }) {
  const requests = [];
  let finish;
  const completed = new Promise(resolve => { finish = resolve; });
  const server = await createServer({ root, configFile: false, appType: 'custom', server: { host: '127.0.0.1', port: 0 }, plugins: [react(), {
    name: 'screen-regression-fixture',
    configureServer(vite) {
      vite.middlewares.use(async (req, res, next) => {
        const path = new URL(req.url, 'http://fixture').pathname;
        if (path === '/fixture-result') {
          let body = ''; for await (const chunk of req) body += chunk;
          res.end('ok'); finish(JSON.parse(body)); return;
        }
        if (path === '/fixture-requests') {
          res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(requests)); return;
        }
        if (path.startsWith('/api/')) {
          requests.push(`${req.method} ${req.url}`);
          const result = await api({ req, path, requests });
          res.statusCode = result.status ?? 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: res.statusCode < 400, code: result.code ?? (res.statusCode < 400 ? 'OK' : 'UNAUTHORIZED'), data: result.data })); return;
        }
        if (path !== '/') return next();
        const html = await vite.transformIndexHtml('/', `<html><body><div id="root"></div><script type="module">
          import React from 'react'; import {createRoot} from 'react-dom/client'; import App from '/src/App.jsx';
          const assert = (ok, message) => { if(!ok)throw Error(message); };
          const wait = async p => { for(let i=0;i<250;i++){if(await p())return;await new Promise(r=>setTimeout(r,20));}throw Error('state timeout: '+document.body.textContent.slice(0,300)); };
          const clickText = text => { const button=[...document.querySelectorAll('button')].find(b=>b.textContent.includes(text)); assert(button,'button missing: '+text); button.click(); };
          createRoot(document.getElementById('root')).render(React.createElement(App));
          let result;
          try { ${source}; result={passed:true}; } catch(e){result={passed:false,error:e.message};}
          await fetch('/fixture-result',{method:'POST',body:JSON.stringify(result)});
        </script></body></html>`);
        res.setHeader('Content-Type', 'text/html'); res.end(html);
      });
    },
  }] });
  const profile = await mkdtemp(resolve(tmpdir(), 'ggaddak-screen-'));
  let browser;
  let timeout;
  try {
    await server.listen();
    browser = spawn(process.env.CHROME_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, `http://127.0.0.1:${server.httpServer.address().port}${route}`], { stdio: 'ignore' });
    browser.once('error', error => finish({ passed: false, error: error.message }));
    const result = await Promise.race([completed, new Promise((_, reject) => { timeout = setTimeout(() => reject(Error('browser timeout: '+requests.join(', '))), 15000); })]);
    return { ...result, requests };
  } finally {
    clearTimeout(timeout);
    if (browser?.exitCode === null) { const closed = new Promise(resolve => browser.once('close', resolve)); browser.kill('SIGTERM'); await closed; }
    await server.close(); await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}
