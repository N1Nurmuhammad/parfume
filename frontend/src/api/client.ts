// Thin fetch wrapper around the /api backend. Carries the JWT, normalizes error
// responses (409 `code`, 422 validation arrays) into an ApiError, and triggers a
// global logout on 401.

const TOKEN_KEY = "parfume_token";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string | null) => {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
};

let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: () => void) => {
  onUnauthorized = fn;
};

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

interface Opts {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | null | undefined>;
}

export async function api<T = unknown>(path: string, opts: Opts = {}): Promise<T> {
  const { method = "GET", body, query } = opts;
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers["Authorization"] = "Bearer " + token;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let url = "/api" + path;
  if (query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== null && v !== undefined && v !== "") qs.set(k, String(v));
    }
    const s = qs.toString();
    if (s) url += "?" + s;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    onUnauthorized?.();
    throw new ApiError("unauthorized", 401);
  }
  if (!res.ok) {
    let detail: unknown = res.statusText;
    let code: string | undefined;
    try {
      const j = await res.json();
      detail = j.detail ?? detail;
      code = j.code;
    } catch {
      /* ignore */
    }
    // 422 validation errors arrive as an array of {loc,msg}
    if (Array.isArray(detail)) {
      detail = detail
        .map((e: { msg?: string }) => (e && e.msg) || JSON.stringify(e))
        .join("; ");
    }
    const msg = typeof detail === "string" ? detail : JSON.stringify(detail);
    throw new ApiError(msg, res.status, code);
  }
  if (res.status === 204) return null as T;
  return res.json() as Promise<T>;
}
