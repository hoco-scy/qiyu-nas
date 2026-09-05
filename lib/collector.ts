export type CollectorMode = 'video' | 'audio';
// `movies`, `shows`, and `inbox` remain readable so completed jobs created by
// older versions keep their labels. New jobs use the content-type folders.
export type CollectorDestination = 'videos' | 'audio' | 'movies' | 'shows' | 'inbox';
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

export type CollectorInspectionCandidate = {
  url: string;
  kind: CollectorMode;
  label: string;
};

export type CollectorInspection = {
  source: string;
  candidates: CollectorInspectionCandidate[];
  message: string;
};

type CollectorPayload = {
  jobs?: CollectorJob[];
  job?: CollectorJob;
  inspection?: CollectorInspection;
  error?: string;
};

function collectorBaseUrl() {
  return (process.env.COLLECTOR_BASE_URL || 'http://collector:9090').replace(/\/+$/, '');
}

export async function collectorRequest(path: string, init: RequestInit = {}, timeout = 10_000) {
  const response = await fetch(`${collectorBaseUrl()}${path}`, {
    ...init,
    cache: 'no-store',
    signal: AbortSignal.timeout(timeout),
  });
  const payload = await response.json().catch(() => ({ error: '采集服务返回了无效响应' })) as CollectorPayload;
  return { response, payload };
}
