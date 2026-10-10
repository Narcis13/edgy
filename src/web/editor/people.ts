// Who is in a document, as the editor shows them: the avatars in the header,
// what a person is doing, and the name an entry in Activity carries. Pure, so
// each is tried without a browser.

import type { Actor } from '../../core/types';

export type Role = 'owner' | 'editor' | 'viewer';

/** Someone with the document open right now (the server's `people` event). */
export interface Present {
  id: string;
  name: string;
  color: string;
  kind: 'human' | 'agent';
  selected: string | null;
  mode: 'edit' | 'live' | 'page' | string;
  /** The browser sessions this person has the document open in. */
  clients: string[];
}

/** An account that may open the document (`GET /api/docs/:id/people`). */
export interface Member {
  id: string;
  name: string;
  email: string | null;
  color: string;
  role: Role;
}

export interface You {
  /** The signed-in account, or null where there is none (an exported file, a deck being played). */
  meId: string | null;
  /** This browser tab's session id. */
  client: string;
}

/** The people to show next to the title: everyone but this person, humans only, in the order they came. */
export function othersPresent(people: Present[], you: You): Present[] {
  return people.filter((p) => p.kind === 'human' && p.id !== you.meId && !p.clients.includes(you.client));
}

/** The first `max` avatars, and how many more there are. */
export function avatarStack<T>(people: T[], max: number): { shown: T[]; more: number } {
  return { shown: people.slice(0, max), more: Math.max(0, people.length - max) };
}

/** "Ana — editing", "Ana — reading", and the cell they selected when there is one. */
export function describePresent(p: Pick<Present, 'name' | 'mode' | 'selected'>, cellName?: (id: string) => string | undefined): string {
  const what = p.mode === 'edit' ? 'editing' : 'reading';
  const at = p.selected ? ` (${cellName?.(p.selected) ?? p.selected})` : '';
  return `${p.name} — ${what}${at}`;
}

/** Is this entry's actor the person at this keyboard? By account when there is one, by tab otherwise. */
export function isYou(actor: Actor, you: You): boolean {
  if (actor.guest) return false;
  if (you.meId) return actor.id === you.meId;
  return actor.id === you.client;
}

/** Two actors are the same one: by id when both have it, else by kind and name. */
export function sameActor(a: Actor, b: Actor): boolean {
  if (a.kind !== b.kind || !!a.guest !== !!b.guest) return false;
  if (a.id != null && b.id != null) return a.id === b.id;
  return a.name === b.name;
}

export interface Named {
  name: string;
  /** This is the person looking. */
  you: boolean;
}

/**
 * What Activity calls an actor. A person is named as their account is named
 * now (a renamed person shows the new name); an agent says who it acts for; a
 * share-link guest is "Guest".
 */
export function actorName(actor: Actor, you: You, members: Member[]): Named {
  const member = actor.id ? members.find((m) => m.id === actor.id) : undefined;
  if (actor.guest) return { name: 'Guest', you: false };
  if (actor.kind === 'agent') {
    const forName = actor.for ? (member?.name ?? actor.for) : undefined;
    return { name: forName ? `${actor.name} for ${forName}` : actor.name, you: false };
  }
  if (isYou(actor, you) || (!actor.id && actor.name === 'You')) return { name: 'You', you: true };
  return { name: member?.name ?? actor.name, you: false };
}
