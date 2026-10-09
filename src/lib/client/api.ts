'use client';

export type ApiError = { code: string; message: string; reason: string | null; status: number; offline?: boolean };

export async function apiFetch<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      method: init?.method ?? (init?.json !== undefined ? 'POST' : 'GET'),
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
      body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
      cache: 'no-store',
    });
  } catch {
    const err: ApiError = { code: 'offline', message: 'You appear to be offline. Your game is saved. Reconnect to continue.', reason: null, status: 0, offline: true };
    throw err;
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const e = data?.error ?? {};
    const err: ApiError = { code: e.code ?? 'internal', message: e.message ?? 'Something went wrong.', reason: e.reason ?? null, status: res.status };
    throw err;
  }
  return data as T;
}

export const newKey = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
