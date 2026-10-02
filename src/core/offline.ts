// What an exported .html file carries besides the app itself: the document
// (or a deck's documents), the records they read and the fetch answers they
// show, as they were at the moment of export. The server writes it
// (server/export.ts); the page reads it (web/offline).

import type { Doc, Json } from './types';
import type { FetchState } from './sx';
import type { Shape } from './library';

export interface ExportPayload {
  kind: 'doc' | 'deck';
  exportedAt: number;
  docs: Doc[];
  /** Each document's card, for a deck's list of slides. */
  shapes: Record<string, Shape>;
  deck?: { id: string; title: string; description: string; docs: string[] };
  /** Every collection the documents read or write, by name. */
  records: Record<string, ({ id: string; at: number } & Record<string, Json>)[]>;
  /** Fetch cells' last answers, by document and cell id. */
  fetched: Record<string, Record<string, FetchState>>;
}

/** The id of the script element that holds the payload as JSON. */
export const PAYLOAD_ID = 'edgy-export';
