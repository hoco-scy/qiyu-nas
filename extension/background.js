const storageKey = 'captures';
const maxCandidates = 24;
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
  return undefined;
});
