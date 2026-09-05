const storageKey = 'captures';
const transferKey = 'pendingTransfers';
const maxCandidates = 24;
const transferLifetimeMs = 15 * 60 * 1000;
const mediaExtensions = new Map([
  ['3gp', 'video'], ['aac', 'audio'], ['flac', 'audio'], ['m3u8', 'video'], ['m4a', 'audio'],
  ['m4v', 'video'], ['mkv', 'video'], ['mov', 'video'], ['mp3', 'audio'], ['mp4', 'video'],
  ['mpeg', 'video'], ['mpg', 'video'], ['oga', 'audio'], ['ogg', 'audio'], ['opus', 'audio'],
  ['ts', 'video'], ['wav', 'audio'], ['webm', 'video'],
]);
let updates = Promise.resolve();

function publicUrl(value) {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.replace(/\.$/, '').toLowerCase();
    if (!['http:', 'https:'].includes(parsed.protocol) || !host || host === 'localhost' || host.endsWith('.local')) return null;
    if (/^(127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return null;
    if (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:')) return null;
    return parsed;
  } catch {
    return null;
  }
}

function kindFor(url, mime = '') {
  const parsed = publicUrl(url);
  if (!parsed) return null;
  const extension = parsed.pathname.split('.').pop()?.toLowerCase() || '';
  if (mediaExtensions.has(extension)) return mediaExtensions.get(extension);
  const type = mime.split(';', 1)[0].trim().toLowerCase();
  if (type.startsWith('audio/')) return 'audio';
  if (type.startsWith('video/') || ['application/vnd.apple.mpegurl', 'application/x-mpegurl', 'application/dash+xml'].includes(type)) return 'video';
  return null;
}

async function changeCaptures(operation) {
  updates = updates.then(async () => {
    const { [storageKey]: captures = {} } = await chrome.storage.session.get({ [storageKey]: {} });
    operation(captures);
    await chrome.storage.session.set({ [storageKey]: captures });
  }).catch(() => undefined);
  return updates;
}

async function record(details, mime = '') {
  const kind = details.type === 'media' ? kindFor(details.url) || 'video' : kindFor(details.url, mime);
  if (!kind || details.tabId < 0) return;
  await changeCaptures((captures) => {
    const capture = captures[details.tabId];
    if (!capture || !capture.armed || capture.candidates.some((item) => item.url === details.url)) return;
    const parsed = publicUrl(details.url);
    if (!parsed) return;
    capture.candidates.unshift({
      url: parsed.toString(),
      kind,
      label: details.type === 'media' ? '浏览器媒体请求' : '媒体响应类型',
      host: parsed.hostname,
      capturedAt: new Date().toISOString(),
    });
    capture.candidates = capture.candidates.slice(0, maxCandidates);
  });
}

function transferTarget(value) {
  const target = new URL(value);
  if (!['http:', 'https:'].includes(target.protocol) || target.pathname !== '/collect' || !target.hash.startsWith('#qiyu-capture=')) {
    throw new Error('带回栖屿的地址无效。');
  }
  return target;
}

async function openTransfer(value) {
  const target = transferTarget(value);
  const tab = await chrome.tabs.create({ url: target.toString(), active: true });
  if (!tab.id) throw new Error('无法打开栖屿标签页。');
  const { [transferKey]: transfers = {} } = await chrome.storage.session.get({ [transferKey]: {} });
  transfers[tab.id] = { target: target.toString(), origin: target.origin, expiresAt: Date.now() + transferLifetimeMs };
  await chrome.storage.session.set({ [transferKey]: transfers });
  // `tabs.create` can begin navigating before the session write resolves.
  // Check the tab once more so an immediate login redirect cannot race past
  // the onUpdated listener.
  const current = await chrome.tabs.get(tab.id);
  if (current.url) await restoreTransferAfterLogin(tab.id, current.url);
}

async function restoreTransferAfterLogin(tabId, value) {
  const { [transferKey]: transfers = {} } = await chrome.storage.session.get({ [transferKey]: {} });
  const transfer = transfers[tabId];
  if (!transfer) return;
  const remove = () => {
    delete transfers[tabId];
    return chrome.storage.session.set({ [transferKey]: transfers });
  };
  if (transfer.expiresAt <= Date.now()) {
    await remove();
    return;
  }
  let current;
  try { current = new URL(value); } catch { return; }
  if (current.origin !== transfer.origin || current.pathname !== '/collect') return;
  // A directly authenticated visit has already delivered the payload. Remove
  // it before the portal client clears the URL fragment.
  if (current.hash.startsWith('#qiyu-capture=')) {
    await remove();
    return;
  }
  await remove();
  await chrome.tabs.update(tabId, { url: transfer.target });
}

chrome.webRequest.onBeforeRequest.addListener(
  (details) => { void record(details); },
  { urls: ['http://*/*', 'https://*/*'] },
);

chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    const contentType = details.responseHeaders?.find((header) => header.name.toLowerCase() === 'content-type')?.value || '';
    void record(details, contentType);
  },
  { urls: ['http://*/*', 'https://*/*'] },
  ['responseHeaders'],
);

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) void restoreTransferAfterLogin(tabId, changeInfo.url);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void chrome.storage.session.get({ [transferKey]: {} }).then(({ [transferKey]: transfers = {} }) => {
    if (!(tabId in transfers)) return;
    delete transfers[tabId];
    return chrome.storage.session.set({ [transferKey]: transfers });
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'arm') {
    void changeCaptures((captures) => {
      captures[message.tabId] = { armed: true, pageUrl: message.pageUrl, candidates: [] };
    }).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message?.type === 'candidates') {
    chrome.storage.session.get({ [storageKey]: {} }).then(({ [storageKey]: captures }) => {
      sendResponse(captures[message.tabId] || { armed: false, candidates: [] });
    });
    return true;
  }
  if (message?.type === 'disarm') {
    void changeCaptures((captures) => { delete captures[message.tabId]; }).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message?.type === 'open-transfer') {
    void openTransfer(message.target)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : '无法打开栖屿。' }));
    return true;
  }
  return undefined;
});
