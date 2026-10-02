import type { Actor, Json, Op } from '../../core/types';
import type { Field, Shape } from '../../core/library';
import { send } from './transport';

/** A document as the library lists it: no content, a shape to draw. */
export interface DocSummary {
  id: string;
  title: string;
  description: string;
  v: number;
  createdAt: number;
  updatedAt: number;
  /** Position among the pinned (1 first), or null. */
  pinned: number | null;
  archivedAt: number | null;
  deck: string | null;
  shared: { view: boolean; edit: boolean };
  shape: Shape;
}

/** A card on the home page (GET /api/library). */
export type LibraryEntry =
  | ({ type: 'doc'; deckTitle?: string; match?: { field: Field; snippet: string } } & DocSummary)
  | {
      type: 'deck';
      id: string;
      title: string;
      description: string;
      createdAt: number;
      updatedAt: number;
      pinned: number | null;
      archivedAt: number | null;
      docs: string[];
      count: number;
      covers: { id: string; title: string; shape: Shape }[];
      match?: { field: Field; snippet: string };
    };

export interface Library {
  pinned: LibraryEntry[];
  rest: LibraryEntry[];
  total: number;
  query: string;
  filter: string;
  sort: string;
}

export interface Deck {
  id: string;
  title: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  pinned: number | null;
  archivedAt: number | null;
  docs: string[];
  /** GET /api/decks/:id: its documents' summaries, in order. */
  items?: DocSummary[];
}

export interface ShareLink {
  token: string;
  doc: string;
  access: 'view' | 'edit';
  createdAt: number;
  revokedAt: number | null;
  url: string;
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
  /** reason: why a share link was refused: "unknown", "revoked" or "forbidden". */
  constructor(message: string, public status: number, public reason?: string) {
    super(message);
  }
}

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await send(path, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown;
  try { json = JSON.parse(text); } catch { json = null; }
  if (!res.ok) throw new ApiError((json as { error?: string } | null)?.error ?? `The server answered ${res.status}.`, res.status, (json as { reason?: string } | null)?.reason);
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
