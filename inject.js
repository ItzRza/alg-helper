// inject.js — Chrome-u remote debugging ilə açır, login gözləyir,
// sonra obfuscated skripti birbaşa səhifəyə yeridir (console paste lazım deyil).
// Node.js 18+ (WebSocket + fetch) tələb edir.

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = 9222;
// Hər run üçün tam yeni profil: köhnə hesab/cookie qalmır.
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), 'alg-helper-profile-'));
const SITE = 'https://learn.algoritmika.az';
const SCRIPT_URL = 'https://cdn.jsdelivr.net/gh/ItzRza/alg-helper@5c5c1e4/demo2.min.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));

function log(...a) { console.log(...a); }

function findBrowser() {
  const pf = process.env.PROGRAMFILES || 'C:\\Program Files';
  const pf86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
  const local = process.env.LOCALAPPDATA || '';
  const candidates = [
    path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return null;
}

async function httpJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

async function portReady(timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { await httpJson('http://127.0.0.1:' + PORT + '/json/version'); return true; }
    catch (e) { await sleep(500); }
  }
  return false;
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener('message', ev => {
      let msg;
      try { msg = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data)); } catch (e) { return; }
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    });
  }
  send(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params: params || {} }));
    });
  }
  close() { try { this.ws.close(); } catch (e) {} }
}

async function getPageTarget() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await httpJson('http://127.0.0.1:' + PORT + '/json');
      const t = list.find(x => x.type === 'page' && x.url && x.url.indexOf('learn.algoritmika.az') !== -1);
      if (t) return t;
    } catch (e) {}
    await sleep(500);
  }
  const list = await httpJson('http://127.0.0.1:' + PORT + '/json');
  return list.find(x => x.type === 'page') || null;
}

async function main() {
  const browser = findBrowser();
  if (!browser) {
    log('XETA: Chrome/Edge tapilmadi.');
    process.exit(1);
  }
  log('Brauzer: ' + browser);
  log('Profil:  ' + PROFILE);

  const already = await portReady(800);
  if (!already) {
    log('Brauzer acilir (remote debugging)...');
    const args = [
      '--remote-debugging-port=' + PORT,
      '--user-data-dir=' + PROFILE,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-features=Translate',
      SITE
    ];
    const child = spawn(browser, args, { detached: true, stdio: 'ignore' });
    child.unref();
  }

  if (!(await portReady(30000))) {
    log('XETA: DevTools portu acilmadi. Kohne AlgHelper pəncərəsini baglayib yeniden cehd edin.');
    process.exit(1);
  }

  const target = await getPageTarget();
  if (!target) {
    log('XETA: Sehife tapilmadi.');
    process.exit(1);
  }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', reject);
  });
  const cdp = new CDP(ws);

  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Network.enable');
  try { await cdp.send('Storage.enable'); } catch (e) {}

  log('Hesabdan cixilir (cookie + storage temizlenir)...');
  try { await cdp.send('Network.clearBrowserCookies'); } catch (e) {}
  try { await cdp.send('Network.clearBrowserCache'); } catch (e) {}
  try {
    await cdp.send('Storage.clearDataForOrigin', {
      origin: 'https://learn.algoritmika.az',
      storageTypes: 'all'
    });
  } catch (e) {}
  try {
    await cdp.send('Runtime.evaluate', {
      expression: 'try{localStorage.clear();sessionStorage.clear();}catch(e){}'
    });
  } catch (e) {}

  await cdp.send('Page.reload', { ignoreCache: true });
  try { await cdp.send('Page.navigate', { url: SITE + '/login' }); } catch (e) {}

  log('Login sehifesi gozlenilir...');
  let sawLogin = false;
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    try {
      const r = await cdp.send('Runtime.evaluate', { expression: 'location.href', returnByValue: true });
      const href = (r.result && r.result.value) || '';
      if (href.indexOf('/login') !== -1) { sawLogin = true; break; }
    } catch (e) {}
  }
  if (!sawLogin) log('Login URL-si gorunmedi, davam edilir...');

  log('');
  log('=== ZEHMET OLMASA BRAUZERDE LOGIN EDIN ===');
  log('Login bitenden sonra skript avtomatik yeridilecek.');
  log('');

  let loggedIn = false;
  for (let i = 0; i < 600; i++) {
    await sleep(2000);
    try {
      const r = await cdp.send('Runtime.evaluate', { expression: 'location.href', returnByValue: true });
      const href = (r.result && r.result.value) || '';
      if (href.indexOf('learn.algoritmika.az') !== -1 && href.indexOf('/login') === -1) {
        loggedIn = true;
        break;
      }
    } catch (e) {}
  }

  if (!loggedIn) {
    log('XETA: Login asgar olunmadi (10 deqiqe gozlenildi).');
    cdp.close();
    process.exit(1);
  }

  log('Login oldu. Skript yuklenir...');
  await sleep(1500);

  let source;
  if (process.argv[2]) {
    try {
      source = fs.readFileSync(process.argv[2], 'utf8');
    } catch (e) {
      log('XETA: Skript oxunmadi: ' + e.message);
      cdp.close();
      process.exit(1);
    }
  } else {
    try {
      const r = await fetch(SCRIPT_URL);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      source = await r.text();
    } catch (e) {
      log('XETA: Skript yuklenmedi: ' + e.message);
      cdp.close();
      process.exit(1);
    }
  }

  log('Skript sehifeye yeridilir...');
  const res = await cdp.send('Runtime.evaluate', {
    expression: source,
    awaitPromise: false
  });

  if (res && res.exceptionDetails) {
    log('XETA: Skript ise dusmedi: ' + (res.exceptionDetails.text || 'unknown'));
  } else {
    log('Skript ise salindi.');
  }

  await sleep(2000);
  try { await cdp.send('Runtime.evaluate', { expression: 'console.clear()' }); } catch (e) {}
  log('Konsol temizlendi. Panel sag-altda olmalidir.');
  log('F5 edende skript silinecek.');

  cdp.close();
  process.exit(0);
}

main().catch(e => {
  log('XETA: ' + (e && e.message ? e.message : e));
  process.exit(1);
});
