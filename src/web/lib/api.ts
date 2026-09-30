import type { Actor, Doc, Json, Op } from '../../core/types';

export interface DocSummary {
  id: string;
  title: string;
  v: number;
  createdAt: number;
  updatedAt: number;
  root: Doc['root'];
}

export interface TemplateSummary {
  id: string;
  title: string;
  about: string;
  root: Json;
}

export interface LogEntry {
  v: number;
  ts: number;
  actor: Actor;
  ops: Op[];
}

export interface Message {
  id: number;
  ts: number;
  actor: Actor;
  text: string;
  cell?: string;
}

export type Row = { id: string; at: number } & Record<string, Json>;

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown;
  try { json = JSON.parse(text); } catch { json = null; }
  if (!res.ok) throw new ApiError((json as { error?: string } | null)?.error ?? `The server answered ${res.status}.`, res.status);
  return json as T;
}

export async function uploadPicture(file: Blob): Promise<string> {
  const res = await fetch('/api/assets', { method: 'POST', headers: { 'content-type': file.type }, body: file });
  const json = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
  if (!res.ok || !json?.url) throw new ApiError(json?.error ?? 'The picture could not be uploaded.', res.status);
  return json.url;
}

export function timeAgo(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.round(s / 86400)} d ago`;
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
