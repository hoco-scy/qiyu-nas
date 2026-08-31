export type CollectorMode = 'video' | 'audio';
export type CollectorDestination = 'movies' | 'shows' | 'inbox';
export type CollectorStatus = 'queued' | 'running' | 'completed' | 'failed' | 'interrupted';

export type CollectorJob = {
  id: string;
  url: string;
  mode: CollectorMode;
  destination: CollectorDestination;
  status: CollectorStatus;
  progress: number;
  message: string;
  createdAt: string;
  updatedAt: string;
  files: string[];
};

type CollectorPayload = { jobs?: CollectorJob[]; job?: CollectorJob; error?: string };

function collectorBaseUrl() {
  return (process.env.COLLECTOR_BASE_URL || 'http://collector:9090').replace(/\/+$/, '');
}

export async function collectorRequest(path: string, init: RequestInit = {}) {
  const response = await fetch(`${collectorBaseUrl()}${path}`, {
    ...init,
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  });
  const payload = await response.json().catch(() => ({ error: '采集服务返回了无效响应' })) as CollectorPayload;
  return { response, payload };
}
