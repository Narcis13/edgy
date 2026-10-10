// Accounts: how passwords are kept, how sessions and API keys are made and
// recognised, and how repeated failed sign-ins are slowed down. No library:
// node:crypto has everything this needs.

import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';

/** scrypt's cost as a power of two; stored with each hash so it can be raised later. */
const COST = 15;
const R = 8;
const P = 1;
const KEY = 32;

function scrypt(password: string, salt: Buffer, cost: number, r: number, p: number): Promise<Buffer> {
  const N = 2 ** cost;
  return new Promise((resolve, reject) =>
    scryptCb(password.normalize('NFKC'), salt, KEY, { N, r, p, maxmem: 256 * N * r + 1024 * 1024 }, (e, key) => (e ? reject(e) : resolve(key))),
  );
}

/** A password as stored: `scrypt$<cost>$<r>$<p>$<salt>$<hash>`, salt and hash in base64url. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, COST, R, P);
  return ['scrypt', COST, R, P, salt.toString('base64url'), key.toString('base64url')].join('$');
}

/** A hash made from a password nobody has, so an unknown email costs as much time as a known one. */
let decoy: Promise<string> | null = null;

/** Whether the password matches the stored hash. With no hash (an unknown email), runs one scrypt anyway and says no. */
export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) {
    await verifyPassword(password, await (decoy ??= hashPassword(randomBytes(12).toString('hex'))));
    return false;
  }
  const [kind, cost, r, p, salt, hash] = stored.split('$');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const want = Buffer.from(hash, 'base64url');
  const got = await scrypt(password, Buffer.from(salt, 'base64url'), Number(cost), Number(r), Number(p));
  return got.length === want.length && timingSafeEqual(got, want);
}

/** What a password must be. */
export function passwordProblem(password: unknown): string | null {
  if (typeof password !== 'string' || password.length < 8) return 'A password needs at least 8 characters.';
  if (password.length > 200) return 'That password is longer than 200 characters.';
  return null;
}

export const normalEmail = (email: unknown): string => (typeof email === 'string' ? email.trim().toLowerCase() : '');
export const emailProblem = (email: string): string | null =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 200 ? null : 'That is not an email address.';

/** A secret to hand out once (a session cookie, an API key); only its digest is stored. */
export const newSecret = (): string => randomBytes(32).toString('base64url');
export const digest = (secret: string): string => createHash('sha256').update(secret).digest('base64url');

/** API keys look like `edgy_<43 characters>`, so they are easy to spot in a config and in a leak scan. */
export const KEY_PREFIX = 'edgy_';
export const newApiKey = (): string => KEY_PREFIX + newSecret();

export const SESSION_COOKIE = 'edgy_session';
/** How long a session lasts without being used. */
export const SESSION_DAYS = 30;

/** The Set-Cookie value for a session (or, with no token, one that removes it). */
export function sessionCookie(token: string | null, secure: boolean): string {
  const parts = [`${SESSION_COOKIE}=${token ?? ''}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${token ? SESSION_DAYS * 86400 : 0}`];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

// ── who looks like whom ──

/** Colours an avatar can take: the theme's accents, readable with white initials in both themes. */
export const COLORS = ['#2563eb', '#7c3aed', '#db2777', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0d9488', '#0891b2', '#4f46e5'];

export function colorFor(seed: string): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}

/** "Ana Pop" → "AP", "ana@x.io" → "A". */
export function initials(name: string): string {
  const words = name.replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean);
  return ((words[0]?.[0] ?? '?') + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase();
}

// ── slowing down guesses ──

export interface ThrottleClock {
  now(): number;
}

/** After this many failures in the window, each try waits, the wait doubling. */
const FREE_TRIES = 4;
const WINDOW = 15 * 60_000;
const MAX_WAIT = 300_000;

/**
 * Counts failed sign-ins by key (an email, an address). From the fifth failure
 * on, a try is refused until a wait has passed: 2 s, then 4, 8 … up to 5 minutes.
 */
export class Throttle {
  private seen = new Map<string, { fails: number; first: number; until: number }>();
  constructor(private clock: ThrottleClock = Date) {}

  /** Milliseconds to wait before trying again, or 0. */
  wait(...keys: string[]): number {
    const now = this.clock.now();
    let wait = 0;
    for (const k of keys) {
      const s = this.seen.get(k);
      if (!s) continue;
      if (now - s.first > WINDOW && now >= s.until) {
        this.seen.delete(k);
        continue;
      }
      wait = Math.max(wait, s.until - now);
    }
    return Math.max(0, wait);
  }

  fail(...keys: string[]): void {
    const now = this.clock.now();
    for (const k of keys) {
      const s = this.seen.get(k) ?? { fails: 0, first: now, until: 0 };
      s.fails++;
      if (s.fails > FREE_TRIES) s.until = now + Math.min(MAX_WAIT, 2000 * 2 ** (s.fails - FREE_TRIES - 1));
      this.seen.set(k, s);
    }
  }

  clear(key: string): void {
    this.seen.delete(key);
  }
}
