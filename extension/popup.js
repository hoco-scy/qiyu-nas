const portalInput = document.querySelector('#portal-url');
const page = document.querySelector('#page');
const status = document.querySelector('#status');
const candidates = document.querySelector('#candidates');
const count = document.querySelector('#count');
let tab;

function message(payload) { return chrome.runtime.sendMessage(payload); }

function normalizedPortal(value) {
  const url = new URL(value.trim());
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('栖屿入口必须是 HTTP 或 HTTPS 地址。');
  return url.origin;
}

function pack(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function currentTab() {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url || !/^https?:/.test(tab.url)) throw new Error('请在普通 HTTP/HTTPS 网页中使用嗅探。');
  page.textContent = new URL(tab.url).hostname;
}

function render(capture) {
  const entries = capture.candidates || [];
  count.textContent = String(entries.length);
  candidates.replaceChildren();
  if (!entries.length) {
    const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = capture.armed ? '正在观察。请在网页中实际打开或播放内容。' : '播放页面内容后，候选会显示在这里。'; candidates.append(empty); return;
  }
  for (const candidate of entries) {
    const row = document.createElement('div'); row.className = 'candidate';
    const detail = document.createElement('div');
    const title = document.createElement('b'); title.textContent = candidate.kind === 'audio' ? '音频资源' : '视频资源';
    const host = document.createElement('span'); host.textContent = candidate.host;
    detail.append(title, host);
    const send = document.createElement('button'); send.textContent = '带回栖屿';
    send.addEventListener('click', async () => {
      try {
        const target = new URL('/collect', normalizedPortal(portalInput.value));
        target.hash = `qiyu-capture=${pack({ url: candidate.url, referer: capture.pageUrl, mode: candidate.kind })}`;
        const result = await message({ type: 'open-transfer', target: target.toString() });
        if (!result?.ok) throw new Error(result?.error || '无法打开栖屿。');
        status.textContent = '已在栖屿打开候选；请在门户中确认后再开始采集。';
      } catch (error) { status.textContent = error instanceof Error ? error.message : '无法打开栖屿。'; }
    });
    row.append(detail, send); candidates.append(row);
  }
}

document.querySelector('#start').addEventListener('click', async () => {
  try {
    await currentTab();
    const portal = normalizedPortal(portalInput.value);
    await chrome.storage.local.set({ portalUrl: portal });
    const granted = await chrome.permissions.request({ origins: ['http://*/*', 'https://*/*'] });
    if (!granted) throw new Error('需要允许站点访问权限，扩展才能观察该标签页的跨域媒体请求。');
    await message({ type: 'arm', tabId: tab.id, pageUrl: tab.url });
    status.textContent = '正在观察当前标签页。';
    render({ armed: true, candidates: [] });
  } catch (error) { status.textContent = error instanceof Error ? error.message : '无法开始观察。'; }
});

document.querySelector('#stop').addEventListener('click', async () => {
  if (!tab?.id) return;
  await message({ type: 'disarm', tabId: tab.id });
  status.textContent = '已停止并清除本标签页候选。'; render({ armed: false, candidates: [] });
});

async function refresh() {
  if (!tab?.id) return;
  render(await message({ type: 'candidates', tabId: tab.id }));
}

const { portalUrl = '' } = await chrome.storage.local.get({ portalUrl: '' });
portalInput.value = portalUrl;
try { await currentTab(); await refresh(); } catch (error) { status.textContent = error instanceof Error ? error.message : '当前页面不可用。'; }
setInterval(() => { void refresh(); }, 900);
