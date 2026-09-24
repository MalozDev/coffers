const CACHE_PREFIX = "coffers:api-cache:v1:";
const USER_KEY = "coffers:cache-user";
const CLEAR_EVENT = "coffers:api-cache-clear";

interface CachedResponse {
  status: number;
  body: unknown;
  savedAt: number;
}

function isApiGet(input: RequestInfo | URL, init?: RequestInit): boolean {
  const method = init?.method || (input instanceof Request ? input.method : "GET");
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  return method.toUpperCase() === "GET" && new URL(url, window.location.origin).pathname.startsWith("/api/");
}

function requestUrl(input: RequestInfo | URL): string {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const url = new URL(raw, window.location.origin);
  url.searchParams.delete("_");
  return `${url.pathname}${url.search}`;
}

function userKey(): string | null {
  try {
    return sessionStorage.getItem(USER_KEY);
  } catch {
    return null;
  }
}

function cacheKey(url: string, user: string): string {
  return `${CACHE_PREFIX}${encodeURIComponent(user)}:${encodeURIComponent(url)}`;
}

function clearEntries(): void {
  try {
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(CACHE_PREFIX)) localStorage.removeItem(key);
    }
  } catch {
    // Storage can be unavailable in private browsing or restricted contexts.
  }
}

function shouldForceRefresh(init?: RequestInit): boolean {
  const headers = new Headers(init?.headers);
  return headers.get("cache-control")?.includes("no-cache") === true;
}

export function clearApiCache(): void {
  clearEntries();
  try {
    sessionStorage.removeItem(USER_KEY);
    window.dispatchEvent(new Event(CLEAR_EVENT));
  } catch {
    // Ignore unavailable browser storage.
  }
}

export function installApiCache(): void {
  if (typeof window === "undefined") return;
  const marker = "__coffersApiCacheInstalled";
  if ((window as Window & { [marker]?: boolean })[marker]) return;
  (window as Window & { [marker]?: boolean })[marker] = true;

  const originalFetch = window.fetch.bind(window);
  const clear = () => clearEntries();
  const handleStorage = (event: StorageEvent) => {
    if (event.key?.startsWith(CACHE_PREFIX)) clearEntries();
  };
  window.addEventListener("coffers:data-updated", clear);
  window.addEventListener(CLEAR_EVENT, clear);
  window.addEventListener("storage", handleStorage);

  window.fetch = async (input, init = {}) => {
    const isGet = isApiGet(input, init);
    const url = requestUrl(input);
    const user = userKey();
    const key = user && isGet ? cacheKey(url, user) : null;

    if (key && !shouldForceRefresh(init)) {
      try {
        const cached = localStorage.getItem(key);
        if (cached) {
          const entry = JSON.parse(cached) as CachedResponse;
          return new Response(JSON.stringify(entry.body), {
            status: entry.status,
            headers: { "Content-Type": "application/json", "X-Coffers-Cache": "HIT" },
          });
        }
      } catch {
        localStorage.removeItem(key);
      }
    }

    const response = await originalFetch(input, init);
    const snapshot = response.clone();

    if (isGet) {
      try {
        const result = await snapshot.json();
        const discoveredUser = result?.data?.user?.id || result?.data?.user?._id;
        if (discoveredUser) sessionStorage.setItem(USER_KEY, String(discoveredUser));
        const activeUser = userKey();
        if (response.ok && result?.success && activeUser && !shouldForceRefresh(init)) {
          localStorage.setItem(cacheKey(url, activeUser), JSON.stringify({ status: response.status, body: result, savedAt: Date.now() }));
        }
      } catch {
        // Non-JSON API responses are not cacheable.
      }
    } else if (response.ok) {
      clearEntries();
    }

    return response;
  };
}
