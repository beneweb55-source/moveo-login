/**
 * Watch history: one store, two audiences.
 *
 * A GUEST and a CONNECTED user must both get a working "reprendre la lecture".
 * The guest's copy lives in localStorage because that is the only storage that
 * survives every event §7 lists — refresh, navigation, closing and reopening
 * the tab, a browser restart, disabling or enabling an extension, and a new
 * visit — without us holding personal data on the server for someone who never
 * asked for an account. The authenticated copy lives in `watch_history` on the
 * server, written through /api/watch-time.
 *
 * WHAT THIS FILE WILL NOT DO
 *
 * §13 of the audit brief forbids treating an iframe `load`, the mere existence
 * of a player, or an artificial timer as evidence of playback. Nothing here
 * writes a position it was not handed by a verified source: a position only
 * ever arrives from `VideoPlayer`, which passes it through
 * `parsePlaybackProgress` (lib/playerMessages.ts) first. A page that mounts a
 * player and watches nothing produces NO position — and the entry it produces
 * says so, by carrying no `timestamp`.
 *
 * The same rule is why `timestamp` is not a convenience field: its PRESENCE is
 * the claim "we have a measured position", and its absence is the claim "we
 * know which episode you were on, and nothing more". The UI reads it that way,
 * and must keep doing so — see components/HistoryCard.tsx.
 */

export interface WatchHistoryItem {
  id: string;
  type: "movie" | "tv";
  title: string;
  poster_path: string;
  season?: number;
  episode?: number;
  provider: string;
  last_watched: number; // Date.now()
  /**
   * Measured playback position, in seconds. ABSENT when no verified position
   * was ever observed for this entry — never 0 as a stand-in for "unknown",
   * because 0 is a real position (the start of the video) and conflating the
   * two is what makes a "reprendre" button lie.
   */
  timestamp?: number;
  /** Total duration, in seconds. Present only alongside a measured position. */
  duration?: number;
  /** Derived at write time from timestamp/duration; 95% or more counts as done. */
  completed?: boolean;
}

/** Kept for continuity: existing visitors already have entries under this key. */
const HISTORY_KEY = "watch_history";

/** How many entries we keep. Enough to cover a realistic back catalogue. */
const MAX_ITEMS = 20;

/**
 * Fired when the history changes because of a DIRECT action: an entry deleted,
 * or the whole list cleared on sign-out.
 *
 * It is deliberately NOT fired by `saveWatchHistory`. The player persists a
 * position every `WATCH_PROGRESS_THROTTLE_MS` while a video plays, so an event
 * from there would have every mounted list re-fetching on that same beat — one
 * request per five seconds per open view, which is exactly the shape §14
 * forbids. A list that needs to notice new progress is re-read on the next
 * mount instead, where the cost is paid once.
 */
export const HISTORY_UPDATED_EVENT = "watch-history-updated";

const announceHistoryChanged = (): void => {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new Event(HISTORY_UPDATED_EVENT));
  } catch {
    // A browser that refuses to dispatch is not a reason to fail the caller:
    // the store itself has already been written.
  }
};

/**
 * The completion test and the no-regression arithmetic live in
 * lib/progressionGuard.ts, because the SERVER applies the same rule when a
 * second device writes to a row this one wrote. One implementation, two
 * callers — a guarantee enforced by two reimplementations is not a guarantee.
 */
import {
  isComplete,
  resolveProgression,
  type ProgressionFields,
} from "@/lib/progressionGuard";

/** Convenience wrapper so the store can pass its own optional fields. */
export const isCompleted = (
  timestamp?: number,
  duration?: number,
): boolean => isComplete(timestamp ?? null, duration ?? null);

// ─── storage primitive ───

/**
 * localStorage that cannot throw.
 *
 * Reading it can throw in more situations than "no entry exists": Safari in
 * private mode throws on write while reads succeed, a browser with site data
 * disabled throws on both, and a corrupted value throws in JSON.parse. The
 * previous implementation called `JSON.parse` with no guard and `HistorySection`
 * called it OUTSIDE its try block, so one malformed character in localStorage
 * left the section stuck on its loading state forever. Every access goes
 * through here so that cannot happen again.
 */
const readRaw = (): string | null => {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(HISTORY_KEY);
  } catch {
    return null;
  }
};

const writeRaw = (value: string): boolean => {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(HISTORY_KEY, value);
    return true;
  } catch {
    return false;
  }
};

const toIntOrUndefined = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isInteger(parsed)) return parsed;
  }
  return undefined;
};

const toFiniteOrUndefined = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

/**
 * Repairs one stored entry, or returns null when it cannot be a history item.
 *
 * This exists because the store is user-writable: it is plain localStorage, and
 * it also carries entries written by older versions of this app whose shape has
 * since changed. Normalising on READ (rather than trusting the file) is what
 * lets a field be added without a migration step that could itself fail.
 */
const normaliseItem = (raw: unknown): WatchHistoryItem | null => {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const item = raw as Record<string, unknown>;

  const id = typeof item.id === "string" ? item.id : String(item.id ?? "");
  if (id === "" || id === "undefined") return null;
  if (item.type !== "movie" && item.type !== "tv") return null;

  const lastWatched = toFiniteOrUndefined(item.last_watched);

  // `??` and not `||` throughout: season 0 is TMDB's SPECIALS season and a
  // position of 0 is the start of the video. `||` collapses both to "absent".
  const timestamp = toFiniteOrUndefined(item.timestamp);
  const duration = toFiniteOrUndefined(item.duration);

  return {
    id,
    type: item.type,
    title: typeof item.title === "string" ? item.title : "",
    poster_path: typeof item.poster_path === "string" ? item.poster_path : "",
    season: toIntOrUndefined(item.season),
    episode: toIntOrUndefined(item.episode),
    provider: typeof item.provider === "string" ? item.provider : "",
    last_watched: lastWatched ?? 0,
    ...(timestamp === undefined ? {} : { timestamp }),
    ...(duration === undefined ? {} : { duration }),
    completed:
      typeof item.completed === "boolean"
        ? item.completed
        : isCompleted(timestamp, duration),
  };
};

// ─── merge (also the guest → account rule, §9) ───

/**
 * Maps a stored entry onto the fields lib/progressionGuard.ts works in.
 *
 * `timestamp` is the POSITION and `last_watched` is when it was observed — the
 * names are the opposite way round from what they suggest, which is why the
 * mapping is written once, here, instead of at each call site. `?? null` and not
 * `||`: 0 is a real position and season 0 is TMDB's SPECIALS.
 */
const progressionFieldsOf = (item: WatchHistoryItem): ProgressionFields => ({
  position: item.timestamp ?? null,
  duration: item.duration ?? null,
  season: item.season ?? null,
  episode: item.episode ?? null,
  observedAt: item.last_watched ?? null,
});

/**
 * Decides which of two records of the same title to keep.
 *
 * Pure, so it can be tested against the real rule instead of a mock. It is used
 * in two places on purpose — locally when a new observation arrives, and when a
 * guest's stored history is merged into an account — because §9 says a merge
 * must never "écraser arbitrairement une progression correcte", and that
 * guarantee is only worth having if both paths agree on what "correct" means.
 *
 * THE RULE ITSELF IS NOT WRITTEN HERE. It is `resolveProgression` in
 * lib/progressionGuard.ts — the same function the server calls before it writes
 * a row — so the rule this browser applies and the rule the database applies
 * cannot disagree. This function maps an entry onto that module's fields, calls
 * it, and maps the winner back.
 *
 * It used to decide the different-episode case itself, comparing `last_watched`,
 * while the server took the incoming value unconditionally. Those two answers
 * had already diverged, and the cost was a stale guest entry rewinding an
 * account's position; the note at the top of lib/progressionGuard.ts records it.
 */
export const mergeWatchEntries = (
  existing: WatchHistoryItem | undefined,
  incoming: WatchHistoryItem,
): WatchHistoryItem => {
  if (!existing) return incoming;

  // The fields are built ONCE and held in variables. `resolveProgression`
  // returns one of its two arguments BY REFERENCE, and that identity is how the
  // winner is identified — calling `progressionFieldsOf(incoming)` a second time
  // would build a different object, the comparison would be false for every
  // merge, and the stored position would freeze forever. The guard's own
  // contract test pins this, which is how the mistake below was caught.
  const existingFields = progressionFieldsOf(existing);
  const incomingFields = progressionFieldsOf(incoming);
  const winner = resolveProgression(existingFields, incomingFields);
  return winner === incomingFields ? incoming : existing;
};

// ─── local storage (the guest's copy, and the local mirror) ───

export const getWatchHistory = (): WatchHistoryItem[] => {
  const raw = readRaw();
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normaliseItem)
      .filter((item): item is WatchHistoryItem => item !== null)
      .sort((a, b) => b.last_watched - a.last_watched);
  } catch {
    // A value we cannot parse is not a reason to fail the caller. The history
    // is a convenience; a broken store shows as an empty history, once.
    return [];
  }
};

/** The stored entry for one title, or undefined. Identity is type + id. */
export const getWatchHistoryItem = (
  type: "movie" | "tv",
  id: string,
): WatchHistoryItem | undefined =>
  getWatchHistory().find((item) => item.type === type && item.id === String(id));

/**
 * Records an observation, merging it with whatever is already stored.
 *
 * Deduplication is on `type` AND `id`. The previous version keyed on `id`
 * alone, so movie 550 and TV 550 were the same slot and watching one erased the
 * other.
 */
/**
 * Writes one observation to the local store, merged, and returns the entry that
 * ended up stored — or null when there is nothing to store (no browser store, or
 * a value that does not normalise).
 *
 * Split out so that the merge path can AWAIT the server write and learn its
 * outcome while the player's high-frequency path stays fire-and-forget. Both use
 * this one function, which is the point: a second copy of the merge and the
 * write for the merge path is exactly how the two would drift apart.
 */
const writeLocalHistory = (item: WatchHistoryItem): WatchHistoryItem | null => {
  if (typeof window === "undefined") return null;

  const normalised = normaliseItem({
    ...item,
    completed: isCompleted(item.timestamp, item.duration),
  });
  if (!normalised) return null;

  const history = getWatchHistory();
  const index = history.findIndex(
    (existing) => existing.type === normalised.type && existing.id === normalised.id,
  );
  const merged = mergeWatchEntries(
    index === -1 ? undefined : history[index],
    normalised,
  );

  const rest = index === -1 ? history : history.filter((_, i) => i !== index);
  const next = [merged, ...rest]
    .sort((a, b) => b.last_watched - a.last_watched)
    .slice(0, MAX_ITEMS);

  writeRaw(JSON.stringify(next));
  return merged;
};

export const saveWatchHistory = (item: WatchHistoryItem): void => {
  const merged = writeLocalHistory(item);
  if (!merged) return;
  // Fire-and-forget: the player calls this every few seconds while a video plays
  // and has nothing to do with the answer. See syncItemToServer.
  void syncItemToServer(merged);
};

/**
 * The same write, awaited, reporting whether the server accepted it.
 *
 * Used only by the guest → account merge, which has to know whether it landed
 * before it records the merge as done (§9).
 *
 * `true` when there was nothing to store: the merge iterates entries that
 * `getWatchHistory` has already normalised, so a null cannot arise from that
 * path — and reporting a failure would leave the merge marker unwritten and
 * retried on every page load, forever, for an entry that will never be valid.
 */
const writeLocalAndSync = async (item: WatchHistoryItem): Promise<boolean> => {
  const merged = writeLocalHistory(item);
  if (!merged) return true;
  return syncItemToServer(merged);
};

/**
 * Deletes a title from the history.
 *
 * `type` is optional so a caller that only knows the id still works; when it is
 * omitted every entry with that id goes, which is the honest reading of an
 * ambiguous request. This function previously had no caller anywhere in the
 * app — the capability §15 asks for was written and never wired up.
 */
export const removeFromHistory = (id: string, type?: "movie" | "tv"): void => {
  if (typeof window === "undefined") return;
  const target = String(id);
  const next = getWatchHistory().filter(
    (item) =>
      !(item.id === target && (type === undefined || item.type === type)),
  );
  writeRaw(JSON.stringify(next));
  announceHistoryChanged();
};

/**
 * Empties the local history.
 *
 * Called on sign-out. Without it, a shared browser keeps showing the previous
 * person's titles — and the next person to sign in on that machine inherits
 * them, which is the local half of the §23 rule that one account's history must
 * not be readable by another.
 */
export const clearWatchHistory = (): void => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(HISTORY_KEY);
  } catch {
    // Nothing to do: if the store is unreadable it is already empty to us.
  }
  announceHistoryChanged();
};

// ─── server sync (connected users) ───

/**
 * Set once the server has answered 401 for a write, i.e. we know this visitor
 * is not signed in. It stops a guest from firing one doomed request per
 * observation for the whole session.
 *
 * §14 asks for no request storms, and the old code had exactly that shape: a
 * guest generated a rejected POST for every progress update, on every title,
 * forever — because a 401 was never remembered.
 */
let serverSyncUnauthorised = false;

/**
 * Sends one entry. Returns whether the server now holds it.
 *
 * The boolean exists for the guest → account merge (§9). The caller that relays
 * a visitor's whole history writes a "this has been merged for this account"
 * marker afterwards, and a marker written for a relay that only PARTLY succeeded
 * is a silent, permanent partial merge: the entries that failed are never
 * retried, because the marker says the work is done. A silent `void` return is
 * what let that happen.
 *
 * `false` is also the answer for a guest (401): nothing was stored on the
 * server, so a caller must not conclude that something was.
 */
const syncItemToServer = async (item: WatchHistoryItem): Promise<boolean> => {
  if (serverSyncUnauthorised) return false;

  try {
    const res = await fetch("/api/watch-time", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        media_type: item.type,
        media_id: item.id,
        minutes: 0, // Progression update only, no time increment
        title: item.title,
        poster_path: item.poster_path,
        // `??` and not `||`: 0 is a real value for all four. Season 0 is TMDB's
        // SPECIALS season, and a position of 0 is the start of the video. `||`
        // turned both into null, and the route's COALESCE then kept the stale
        // value instead of storing what was sent.
        current_time: item.timestamp ?? null,
        total_duration: item.duration ?? null,
        season: item.season ?? null,
        episode: item.episode ?? null,
        // When this observation was made, so the route can tell a STALE entry
        // from a current one when the season/episode differs — the case a guest
        // merge creates, where a month-old "S1E1 at 0:40" must not rewind an
        // account that has since reached "S2E7 at 32:14" (§9). It orders
        // DIFFERENT episodes only; within one episode a later observation is
        // never a reason to rewind, which is the measured VidLink rule.
        observed_at: item.last_watched ?? null,
        // NO `session_id`. Deliberate, and the opposite of the obvious fix.
        //
        // Sending it would turn /api/watch-time from "authenticated writes" into
        // "unauthenticated writes to a key the caller names": the route has no
        // way to verify the id it is handed, because the visitor has no identity
        // to check it against. What that buys is a guest's minutes appearing in
        // an aggregate admin figure; what it costs is an anonymous write into a
        // shared table under a client-chosen value. The guest's actual
        // requirement — a resume that survives refresh, restart and a new visit
        // — is met by localStorage, which is where a guest's history belongs,
        // and §23 asks for no server-side guest surface at all.
        //
        // A guest therefore gets one 401, which the latch above remembers.
      }),
    });

    if (res.status === 401) {
      serverSyncUnauthorised = true;
      return false;
    }
    if (!res.ok) {
      // A rejected response does not throw, so without this check the catch
      // below never fires and a 400 or 500 looked exactly like a success.
      console.warn(
        `[watch-history] sync rejected with ${res.status}; progression not saved`,
      );
      return false;
    }
    return true;
  } catch {
    // Non-critical for the LOCAL copy, which is already written. It is reported
    // as a failure so that a merge does not record a success it did not have.
    return false;
  }
};

/** Test seam: lets a suite exercise the retry behaviour without a network. */
export const __resetServerSyncLatch = (): void => {
  serverSyncUnauthorised = false;
};

/**
 * Deletes one title from the signed-in viewer's server history.
 *
 * §15 asks for the ability to delete an entry, and deleting only the local copy
 * would be a half-truth: the server row would be read back on the next page load
 * and the entry would reappear, so the button would look like it had failed.
 *
 * Best-effort by design. The local copy is already gone by the time this runs,
 * so a failure degrades to "removed from this device" — which is exactly what a
 * guest gets — rather than to an error the viewer cannot act on.
 *
 * No `session_id` is sent, for the same reason the write path does not send one:
 * the route resolves the row from the authenticated session, and a caller-named
 * key would let one visitor delete another visitor's entry (§23).
 */
export const removeServerHistoryItem = async (
  type: "movie" | "tv",
  id: string | number,
): Promise<void> => {
  if (serverSyncUnauthorised) return;
  const query = `media_type=${encodeURIComponent(type)}&media_id=${encodeURIComponent(String(id))}`;
  try {
    const res = await fetch(`/api/watch-time?${query}`, { method: "DELETE" });
    if (res.status === 401) {
      serverSyncUnauthorised = true;
      return;
    }
    if (!res.ok) {
      console.warn(`[watch-history] delete rejected with ${res.status}`);
    }
  } catch {
    // Non-critical: the local copy is already removed.
  }
};

/**
 * Pushes this device's whole history to the signed-in account (§9).
 *
 * Called once, after a sign-in, so that a viewer who watched as a guest does not
 * lose that progress by creating an account. Every item goes through
 * `saveWatchHistory`, which means the server sees the SAME merge rule the
 * browser applied — the route re-applies `resolveProgression` on top, so a row
 * the account already held with a later position is not overwritten by an older
 * local one.
 *
 * The local copy is deliberately KEPT. Push-then-keep matches what happened:
 * one person, one device, a new account. The boundary that protects a shared
 * machine is sign-OUT, which clears the local history.
 */
export const pushLocalHistoryToAccount = async (): Promise<{
  total: number;
  allSynced: boolean;
}> => {
  const items = getWatchHistory();
  // A 401 received while signed out latched the write path off. Signing in does
  // not un-latch it by itself, so without this the whole merge would be silently
  // skipped — the exact "history lost" defect §9 forbids. The caller also clears
  // the latch as soon as a session is proven, because THIS reset is only reached
  // when the merge actually runs, and the merge is skipped entirely once the
  // per-account marker exists.
  __resetServerSyncLatch();

  let allSynced = true;
  // SEQUENTIALLY, not `Promise.all`. These are writes to one table for one user,
  // and the route reads the current row before it writes it; firing twenty of
  // them at once invites those read-modify-write pairs to interleave, including
  // with a player that is writing the same title in this very tab. One at a time
  // costs a few hundred milliseconds on a first sign-in and cannot race.
  for (const item of items) {
    const synced = await writeLocalAndSync(item);
    if (!synced) allSynced = false;
  }

  return { total: items.length, allSynced };
};

// ─── anonymous session id ───

/**
 * The guest's storage handle.
 *
 * Lives here, next to the code that sends it, because the alternative — reading
 * a key some other component happens to own — is a contract with nothing
 * holding it together. It is a random opaque string, not an identifier for a
 * person: no email, no IP, no device fingerprint.
 */
const ANON_SESSION_KEY = "anon_session_id";

export const getAnonSessionId = (): string | null => {
  if (typeof window === "undefined") return null;
  try {
    const existing = window.localStorage.getItem(ANON_SESSION_KEY);
    if (existing) return existing;
    const created = `anon_${Math.random().toString(36).substring(2, 15)}_${Date.now()}`;
    window.localStorage.setItem(ANON_SESSION_KEY, created);
    return created;
  } catch {
    return null;
  }
};

// ─── server read (connected users) ───

/**
 * Fetch watch progress from server for logged-in users.
 * Returns server-side history items, mapped to WatchHistoryItem format.
 */
export const getServerWatchHistory = async (): Promise<WatchHistoryItem[]> => {
  try {
    const res = await fetch("/api/watch-time");
    if (!res.ok) return [];
    const data = await res.json();

    if (!data.progress || !Array.isArray(data.progress)) return [];

    // Named and typed before mapping: `data` comes from `res.json()`, so
    // `data.progress` is `any` and every callback below it would be implicitly
    // `any` too — which is how a shape change on the server would have gone
    // unnoticed by the compiler.
    const rows: Record<string, unknown>[] = data.progress;

    return rows
      .map((item: Record<string, unknown>) => {
        const timestamp = toFiniteOrUndefined(item.current_time);
        const duration = toFiniteOrUndefined(item.total_duration);
        return normaliseItem({
          id: String(item.media_id ?? ""),
          type: item.media_type,
          title: item.title || `ID: ${item.media_id}`,
          poster_path: item.poster_path || "",
          // `??` and not `||`, for the same reason as the write path above: a
          // stored season 0 must come back as 0, not as "no season".
          season: item.season ?? undefined,
          episode: item.episode ?? undefined,
          provider: "",
          last_watched: item.last_updated
            ? new Date(item.last_updated as string).getTime()
            : 0,
          ...(timestamp === undefined ? {} : { timestamp }),
          ...(duration === undefined ? {} : { duration }),
        });
      })
      .filter((item): item is WatchHistoryItem => item !== null);
  } catch {
    return [];
  }
};
