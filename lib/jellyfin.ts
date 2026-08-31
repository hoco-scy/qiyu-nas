// The portal calls Jellyfin over the private Docker network.  This is not the
// public Caddy route, so it must not include the `/jellyfin` URL prefix.
const defaultBaseUrl = 'http://jellyfin:8096';

type JellyfinSession = { accessToken: string; userId: string; expiresAt: number };

type JellyfinImageTag = string | null | undefined;

type JellyfinItem = {
  Id: string;
  Name: string;
  Type: string;
  Overview?: string;
  ProductionYear?: number;
  RunTimeTicks?: number;
  PremiereDate?: string;
  ImageTags?: { Primary?: JellyfinImageTag };
  BackdropImageTags?: JellyfinImageTag[];
  PrimaryImageAspectRatio?: number;
  UserData?: { PlaybackPositionTicks?: number; Played?: boolean };
};

type JellyfinView = {
  Id: string;
  Name: string;
  CollectionType?: string;
  ImageTags?: { Primary?: JellyfinImageTag };
  PrimaryImageAspectRatio?: number;
};

let session: JellyfinSession | undefined;
let bootstrapPromise: Promise<boolean> | undefined;

function baseUrl() {
  return (process.env.JELLYFIN_BASE_URL || defaultBaseUrl).replace(/\/+$/, '');
}

function clientHeaders() {
  return {
    Authorization: 'MediaBrowser Client="Qiyu", Device="Qiyu NAS", DeviceId="qiyu-portal-v1", Version="1.0.0"',
  };
}

async function requestAuthentication(username: string, password: string) {
  return fetch(`${baseUrl()}/Users/AuthenticateByName`, {
    method: 'POST',
    headers: { ...clientHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ Username: username, Pw: password }),
    cache: 'no-store',
  });
}

async function bootstrapJellyfin(username: string, password: string) {
  const firstUser = await fetch(`${baseUrl()}/Startup/User`, {
    headers: clientHeaders(),
    cache: 'no-store',
  });

  // Jellyfin returns an authorization error here after its first-run wizard
  // has finished. In that case it is an existing installation, not one the
  // portal should modify.
  if (!firstUser.ok) return false;

  const setupHeaders = { ...clientHeaders(), 'Content-Type': 'application/json' };
  const userResponse = await fetch(`${baseUrl()}/Startup/User`, {
    method: 'POST',
    headers: setupHeaders,
    body: JSON.stringify({ Name: username, Password: password }),
    cache: 'no-store',
  });
  if (!userResponse.ok) return false;

  const completeResponse = await fetch(`${baseUrl()}/Startup/Complete`, {
    method: 'POST',
    headers: setupHeaders,
    cache: 'no-store',
  });
  return completeResponse.ok;
}

async function ensureJellyfinBootstrapped(username: string, password: string) {
  if (!bootstrapPromise) {
    bootstrapPromise = bootstrapJellyfin(username, password)
      .catch(() => false)
      .finally(() => { bootstrapPromise = undefined; });
  }
  return bootstrapPromise;
}

async function authenticate() {
  const username = process.env.JELLYFIN_USERNAME;
  const password = process.env.JELLYFIN_PASSWORD;
  if (!username || !password) throw new Error('Jellyfin service credentials are not configured');
  let response = await requestAuthentication(username, password);
  if (response.status === 401 && await ensureJellyfinBootstrapped(username, password)) {
    response = await requestAuthentication(username, password);
  }
  if (!response.ok) throw new Error(`Jellyfin authentication failed (${response.status})`);
  const payload = await response.json() as { AccessToken?: string; User?: { Id?: string } };
  if (!payload.AccessToken || !payload.User?.Id) throw new Error('Jellyfin returned an invalid session');
  session = { accessToken: payload.AccessToken, userId: payload.User.Id, expiresAt: Date.now() + 45 * 60 * 1000 };
  return session;
}

async function currentSession(force = false) {
  if (!force && session && session.expiresAt > Date.now()) return session;
  return authenticate();
}

export async function jellyfinFetch(endpoint: string, init: RequestInit = {}, retry = true) {
  const activeSession = await currentSession(!retry);
  const initialHeaders = new Headers(init.headers);
  const response = await fetch(`${baseUrl()}${endpoint}`, {
    ...init,
    headers: new Headers({ ...clientHeaders(), 'X-Emby-Token': activeSession.accessToken, ...Object.fromEntries(initialHeaders.entries()) }),
    cache: 'no-store',
  });
  if (response.status === 401 && retry) {
    session = undefined;
    return jellyfinFetch(endpoint, init, false);
  }
  return response;
}

export async function jellyfinUserId() {
  return (await currentSession()).userId;
}

function imageEndpoint(id: string, hasImage: JellyfinImageTag, type: 'Primary' | 'Backdrop' = 'Primary') {
  return hasImage ? `/api/media/image/${encodeURIComponent(id)}?type=${type}` : null;
}

export type MediaLibrary = {
  id: string;
  name: string;
  type: string;
  image: string | null;
};

export type MediaItem = {
  id: string;
  name: string;
  type: string;
  overview: string;
  year: number | null;
  runtimeMinutes: number | null;
  image: string | null;
  backdrop: string | null;
  progress: number | null;
};

function mapItem(item: JellyfinItem): MediaItem {
  const runtimeMinutes = item.RunTimeTicks ? Math.round(item.RunTimeTicks / 600_000_000) : null;
  const progress = item.RunTimeTicks && item.UserData?.PlaybackPositionTicks
    ? Math.min(100, Math.round((item.UserData.PlaybackPositionTicks / item.RunTimeTicks) * 100))
    : null;
  return {
    id: item.Id,
    name: item.Name,
    type: item.Type,
    overview: item.Overview || '',
    year: item.ProductionYear || (item.PremiereDate ? new Date(item.PremiereDate).getFullYear() : null),
    runtimeMinutes,
    image: imageEndpoint(item.Id, item.ImageTags?.Primary),
    backdrop: imageEndpoint(item.Id, item.BackdropImageTags?.[0], 'Backdrop'),
    progress,
  };
}

export async function mediaLibraries(): Promise<MediaLibrary[]> {
  const userId = await jellyfinUserId();
  const response = await jellyfinFetch(`/Users/${encodeURIComponent(userId)}/Views`);
  if (!response.ok) throw new Error(`Unable to list Jellyfin libraries (${response.status})`);
  const payload = await response.json() as { Items?: JellyfinView[] };
  return (payload.Items || []).map((item) => ({
    id: item.Id,
    name: item.Name,
    type: item.CollectionType || 'mixed',
    image: imageEndpoint(item.Id, item.ImageTags?.Primary),
  }));
}

export async function mediaItems(parentId?: string, limit = 48): Promise<MediaItem[]> {
  const userId = await jellyfinUserId();
  const query = new URLSearchParams({
    Recursive: 'true',
    IncludeItemTypes: 'Movie,Series,Episode',
    Fields: 'Overview,ProductionYear,PremiereDate,RunTimeTicks,PrimaryImageAspectRatio,UserData,BackdropImageTags',
    SortBy: 'DateCreated,SortName',
    SortOrder: 'Descending',
    Limit: String(Math.min(Math.max(limit, 1), 96)),
  });
  if (parentId) query.set('ParentId', parentId);
  const response = await jellyfinFetch(`/Users/${encodeURIComponent(userId)}/Items?${query}`);
  if (!response.ok) throw new Error(`Unable to list Jellyfin items (${response.status})`);
  const payload = await response.json() as { Items?: JellyfinItem[] };
  return (payload.Items || []).map(mapItem);
}

export async function mediaItem(id: string): Promise<MediaItem> {
  const userId = await jellyfinUserId();
  const response = await jellyfinFetch(`/Users/${encodeURIComponent(userId)}/Items/${encodeURIComponent(id)}?Fields=Overview,ProductionYear,PremiereDate,RunTimeTicks,PrimaryImageAspectRatio,UserData,BackdropImageTags`);
  if (!response.ok) throw new Error(`Unable to read Jellyfin item (${response.status})`);
  return mapItem(await response.json() as JellyfinItem);
}
