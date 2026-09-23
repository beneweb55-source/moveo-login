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

import {
  adoptEntries,
  currentWriteOwnerKey,
  getDeviceId,
  isAdoptable,
  ownerKeyOf,
  readOwnerKey,
  type HistoryOwner,
} from "@/lib/historyOwnership";

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
  /**
   * WHO this entry belongs to, stamped from lib/historyOwnership.ts on every
   * write: `guest:<device id>` or `user:<user id>`.
   *
   * It exists so that a merge can refuse to carry one account's history into
   * another (§6/§8). Absent on entries written before the scheme existed, and
   * absent means adoptable — which is why nothing may ever be stamped with a
   * GUESSED user id: a wrong `user:<id>` silently withholds the genuine
   * owner's own progression, whereas a wrong `guest:` only ever costs an extra
   * adoption. See the module header for the full argument.
   */
  owner?: string;
}

/** Kept for continuity: existing visitors already have entries under this key. */
const HISTORY_KEY = "watch_history";

/** How many entries we keep. Enough to cover a realistic back catalogue. */
const MAX_ITEMS = 20;

/**
 * Fired when the history changes because of a DIRECT action: an entry deleted,
 * or the whole list cleared on sign-out.
 *
 * It is deliberately NOT fired by `saveWatchHistory`'s ordinary path. The player
 * persists a position every `WATCH_PROGRESS_THROTTLE_MS` while a video plays, so
 * an event from there would have every mounted list re-fetching on that same
 * beat — one request per five seconds per open view, which is exactly the shape
 * §14 forbids. A list that needs to notice new progress is re-read on the next
 * mount instead, where the cost is paid once.
 *
 * ─── THE ONE EXCEPTION, AND WHY IT IS NOT THE SAME THING ─────────────────────
 *
 * `saveWatchHistory(item, {announce: true})` does fire it, and exactly one kind
 * of caller asks for that: the detail pages, on the viewer pressing the button
 * that starts a title. That write happens once per visit, not once per five
 * seconds, so the reason for the rule above does not apply to it — and the rule
 * itself is what left a hole.
 *
 * The hole, measured 2026-09-23. `lib/useWatchHistory.ts` re-reads on mount and
 * on this event, and on nothing else. So a watched title could be recorded in
 * the store while the list on screen was never told: `HistorySection` and
 * `components/StartedEpisodes.tsx` both keep rendering the set they read before,
 * and the entry appears only once something else remounts them. The viewer's
 * report was that shape — "j'ai tenté d'aller regarder un film … résultat NON" —
 * and a store is not the thing they are looking at.
 *
 * The distinction is DELIBERATE versus PERIODIC, not large versus small: the
 * player's periodic write still announces nothing, which is what keeps §14
 * satisfied.
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
  progressionFieldsFrom,
  resolveProgression,
} from "@/lib/progressionGuard";

/**
 * The per-episode model (§7–§12). `lib/episodeHistory.ts` owns the shape, the
 * slot rule and the merge; this file owns the storage and the owner stamp, so
 * that both copies are written by ONE function and cannot drift apart.
 */
import {
  asEpisodeEntry,
  episodesOfTitle,
  episodeKeyOf,
  episodeSlotKey,
  episodeSlotOf,
  MAX_EPISODE_ENTRIES,
  otherStartedEpisodes,
  upsertEpisodeEntry,
  type EpisodeEntry,
} from "@/lib/episodeHistory";

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
    // CARRIED THROUGH VERBATIM, and the cast is the point rather than an
    // oversight. Only the ownership module may decide what a stamp means, and it
    // decides by READING the raw value: absent means "adoptable", a recognised
    // key means "governed by the rule", anything else means "refused". Dropping
    // a value that merely looked wrong — a number, an empty string, `"user:12 "`
    // — would turn it into absent, i.e. into adoptable, which is the fail-OPEN
    // direction. So every present value survives normalisation, including the
    // ones isAdoptable will refuse.
    ...(item.owner === undefined || item.owner === null
      ? {}
      : { owner: item.owner as string }),
  };
};

// ─── merge (also the guest → account rule, §9) ───

/**
 * THE MAPPING IS NOT HERE. It is `progressionFieldsFrom` in
 * lib/progressionGuard.ts, because the per-episode store needs the identical
 * mapping — `timestamp` is the POSITION and `last_watched` is when it was
 * observed, the names being the opposite way round from what they suggest — and
 * two copies of that fact is how the browser and the child store would come to
 * disagree about which field holds the position.
 */

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
  // winner is identified — calling `progressionFieldsFrom(incoming)` a second
  // time would build a different object, the comparison would be false for every
  // merge, and the stored position would freeze forever. The guard's own
  // contract test pins this, which is how the mistake below was caught.
  const existingFields = progressionFieldsFrom(existing);
  const incomingFields = progressionFieldsFrom(incoming);
  const winner = resolveProgression(existingFields, incomingFields);
  if (winner === incomingFields) return incoming;

  // ─── THE POSITION IS NOT THE WHOLE ENTRY ─────────────────────────────────
  //
  // `existing` won the PROGRESSION. That says which stored position is current,
  // and it must not be read as saying anything about the title or the poster:
  // those are IDENTITY, decided by what is known, not by which observation is
  // newer. The guard's fields do not include them, so the winner carries them
  // whatever they happen to be — and for a row read back from the server that is
  // frequently `title: null`/`""`, because 107 of the 108 rows in the live table
  // were written by a mount site that passed no title (see the note at the GET
  // in app/api/watch-time/route.ts).
  //
  // Without this, that NULL wins: the server's position beats this device's older
  // one, `existing` is returned whole, and the card loses a name this browser has
  // held in `watch_history` all along — the history gets LESS informative the
  // more it syncs. That is the same class of mistake as taking the server list
  // wholesale (see lib/historyList.ts), one field down.
  //
  // So the winner's progression is kept and its identity is FILLED from the side
  // that has one. `||` is right here and not `??`: the values are strings whose
  // "unknown" spelling is the empty string, which `normaliseItem` produces from
  // anything that is not a string, so `""` and absent mean the same thing.
  const title = existing.title || incoming.title;
  const poster_path = existing.poster_path || incoming.poster_path;

  // Returned by reference when there is nothing to fill, so the common path does
  // not allocate and `existing`'s identity is preserved for any caller that
  // compares it.
  if (title === existing.title && poster_path === existing.poster_path) {
    return existing;
  }
  return { ...existing, title, poster_path };
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
const stampWriteOwner = (item: WatchHistoryItem): WatchHistoryItem => {
  const key = currentWriteOwnerKey();
  return key === null ? item : { ...item, owner: key };
};

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

  // ── ownership: the entry belongs to whoever is writing it now ──
  //
  // Stamped AFTER the merge, not before, and that order is deliberate. The merge
  // can return the PREVIOUS entry unchanged (its position is the newer one, or
  // the incoming one carried no position at all), and that previous entry may be
  // stamped with a different identity — A's `user:A` on a browser B is now using.
  // Carrying that stamp forward would leave B's own observation recorded as A's,
  // and the next merge would then refuse to sync B's genuine progress to B's own
  // account: a silent loss, in the direction the brief forbids. The owner is the
  // identity that made the LATEST observation of this title, which is exactly
  // what the merge just produced.
  //
  // When no owner can be established — no storage to read a device id from — the
  // entry is left as it was rather than stamped with a guess. See
  // lib/historyOwnership.ts: every mis-stamp must fall toward guest, never
  // toward an account.
  const owned = stampWriteOwner(merged);

  const rest = index === -1 ? history : history.filter((_, i) => i !== index);
  const next = [owned, ...rest]
    .sort((a, b) => b.last_watched - a.last_watched)
    .slice(0, MAX_ITEMS);

  writeRaw(JSON.stringify(next));

  // ── and the per-episode copy, from the SAME merge result and the same owner ──
  //
  // Written HERE, inside the single write point, rather than at each caller. The
  // player, the episode selector and the guest merge all reach the store through
  // this function, so all three get per-episode records without having to
  // remember to, and the owner stamp is applied once by the same code — a new
  // caller cannot forget the child write, because it never performs it.
  recordEpisodeFor(owned);

  return owned;
};

// ─── the per-episode store (the child model, on the client) ───

/**
 * The per-episode copy, beside the pointer list.
 *
 * WHY A SECOND KEY RATHER THAN A RICHER ENTRY. `watch_history` is capped at
 * MAX_ITEMS entries and each entry is ONE title. If a series' episodes were kept
 * inside that entry, the cap would become a cap on titles and the Continue
 * Watching shape would have to change; worse, the parent entry can hold exactly
 * one slot by construction, so "keep the other episodes" is not expressible
 * there at all. A separate key keeps the pointer list exactly as it is — the
 * thing Continue Watching reads — and gives the per-slot records their own room,
 * which is the same split the database now makes between `watch_history` and
 * `watch_history_episodes`.
 *
 * Entries carry the same owner stamp as the pointer list, applied by the same
 * function, because the rule that decides who may be SHOWN or RELAYED an entry
 * must not have two implementations (§17).
 *
 * This store is bounded twice (per title and overall) by
 * `upsertEpisodeEntry`; see lib/episodeHistory.ts for why the trim order is
 * "least recently observed".
 */
const EPISODE_HISTORY_KEY = "watch_history_episodes";

/**
 * How many per-episode records a first sign-in relays to the account.
 *
 * Bounded deliberately: the relay is sequential (§9 — one writer, one table) and
 * a device with a long back catalogue must not turn a sign-in into a request
 * storm (§14). Records beyond the bound stay in the local store, and the next
 * observation for that title relays its own slot through the ordinary write.
 */
const EPISODE_RELAY_LIMIT = 20;

const readEpisodeRaw = (): string | null => {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(EPISODE_HISTORY_KEY);
  } catch {
    return null;
  }
};

const writeEpisodeRaw = (value: string): boolean => {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(EPISODE_HISTORY_KEY, value);
    return true;
  } catch {
    return false;
  }
};

/**
 * Every stored episode record, most recently observed first.
 *
 * Normalised on read through the same `normaliseItem` the pointer list uses, and
 * then narrowed by `asEpisodeEntry`. An entry that does not describe a slot is
 * DROPPED here rather than repaired: this store's whole contract is that every
 * record is keyed by a season and an episode, so a record without one is not a
 * damaged member of this store — it is not a member.
 */
export const getEpisodeHistory = (): EpisodeEntry[] => {
  const raw = readEpisodeRaw();
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        const normalised = normaliseItem(item);
        return normalised === null ? null : asEpisodeEntry(normalised);
      })
      .filter((entry): entry is EpisodeEntry => entry !== null)
      .sort((a, b) => b.last_watched - a.last_watched);
  } catch {
    return [];
  }
};

const writeEpisodeHistory = (entries: readonly EpisodeEntry[]): void => {
  writeEpisodeRaw(JSON.stringify(entries.slice(0, MAX_EPISODE_ENTRIES)));
};

/** The started episodes of one title, most recently watched first. */
export const getEpisodesForTitle = (
  type: "movie" | "tv",
  id: string | number,
): EpisodeEntry[] => episodesOfTitle(getEpisodeHistory(), type, id);

/** The started episodes of a title, excluding the one currently pointed at. */
export const otherStartedEpisodesFor = (
  type: "movie" | "tv",
  id: string | number,
  season?: number | null,
  episode?: number | null,
): EpisodeEntry[] =>
  otherStartedEpisodes(getEpisodeHistory(), { type, id, season, episode });

/**
 * Records one observation in the per-episode store, merged and owner-stamped.
 *
 * Returns the entry that ended up stored, or **null when the observation
 * describes no slot** — a film, or a series entry with no episode number. Null
 * is the ordinary answer for a film and is what keeps §8's promise that films
 * produce no per-episode rows: the caller does not have to know the rule, and a
 * movie write simply passes through.
 *
 * The merge is `mergeEpisodeEntries` → `resolveProgression`, i.e. the same
 * no-regression rule the pointer list and the server apply. It is applied
 * against the stored record FOR THIS SLOT and never against the parent row: a
 * write for S1E4 must not be judged against S2E7's position, because the two are
 * separate facts and the guard would read a lower episode number as a rewind.
 */
export const recordEpisodeFor = (item: WatchHistoryItem): EpisodeEntry | null => {
  if (typeof window === "undefined") return null;

  const incoming = asEpisodeEntry(item);
  if (!incoming) return null;

  const owned = stampWriteOwner(incoming) as EpisodeEntry;
  const next = upsertEpisodeEntry(getEpisodeHistory(), owned);
  writeEpisodeHistory(next);

  const key = episodeKeyOf(owned);
  return next.find((entry) => episodeKeyOf(entry) === key) ?? null;
};

/**
 * Records an observation and mirrors it to the server.
 *
 * `announce` is the deliberate/periodic distinction `HISTORY_UPDATED_EVENT`
 * documents above. The player omits it — it writes every few seconds and an
 * event from there would have every mounted list re-fetching on that beat (§14).
 * The detail pages pass `true`, because a viewer pressing "Regarder" must see the
 * entry they just created without waiting for something to remount the list.
 *
 * The announce happens AFTER the local write and regardless of what the server
 * answers: the viewer's own list is built from the local store, so gating the
 * event on the network would make the screen depend on a round trip §9 does not
 * promise.
 */
export const saveWatchHistory = (
  item: WatchHistoryItem,
  options?: { readonly announce?: boolean },
): void => {
  const merged = writeLocalHistory(item);
  if (!merged) return;
  // Fire-and-forget: the player calls this every few seconds while a video plays
  // and has nothing to do with the answer. See syncItemToServer.
  void syncItemToServer(merged);
  if (options?.announce === true) announceHistoryChanged();
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
 * Empties BOTH local stores, unconditionally.
 *
 * This is NOT the sign-out path any more, and §5 is why. A blind wipe on logout
 * also deletes the current GUEST's own entries, and nothing can restore them —
 * a guest has no server copy to read them back from. The brief is explicit:
 * "NE PAS supprimer aveuglément toute l'histoire locale si elle peut appartenir
 * au guest courant." Sign-out calls `removeEntriesOwnedBy`, which removes
 * exactly the departing account's records.
 *
 * Kept because "forget everything on this device" is a real request a viewer can
 * make, and this is the honest name for what it does.
 */
export const clearWatchHistory = (): void => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(HISTORY_KEY);
    window.localStorage.removeItem(EPISODE_HISTORY_KEY);
  } catch {
    // Nothing to do: if the store is unreadable it is already empty to us.
  }
  announceHistoryChanged();
};

/**
 * Removes exactly the entries stamped for ONE owner, from BOTH stores.
 *
 * THE SIGN-OUT RULE (§5): "Après logout : clear account ownership ; nouveau guest
 * = nouveau contexte ; aucun historique privé du compte précédent visible. NE PAS
 * supprimer aveuglément toute l'histoire locale si elle peut appartenir au guest
 * courant. Le comportement doit être déterministe."
 *
 * So it is a SCOPED removal, not a wipe: entries stamped
 * `user:<the account that just signed out>` go, and everything else stays —
 * the device's own guest entries, and any other account's entries, which are not
 * this session's to delete. What protects the next viewer from THOSE is the
 * display rule (`isVisibleTo`), which never paints an account-stamped entry for a
 * viewer who is not that account. This function is the other half: the records of
 * the viewer who just left are also removed from the shared machine.
 *
 * Deleting an account's local records loses no progress. An account's history
 * lives on the server, and the next sign-in reads it back through
 * `getServerWatchHistory`.
 *
 * `null` removes NOTHING, and that is a decision rather than an oversight: there
 * is no account to identify, and "we could not tell whose these are" must never
 * resolve to "delete them anyway". That direction loses a guest's history, and
 * the display rule already covers the visibility half.
 *
 * Deterministic: the same store and the same owner always produce the same
 * result, and the count comes back so a caller can state what happened.
 */
export const removeEntriesOwnedBy = (
  owner: HistoryOwner | null,
): { removed: number; kept: number } => {
  const pointers = getWatchHistory();
  if (owner === null) return { removed: 0, kept: pointers.length };

  const key = ownerKeyOf(owner);
  const episodes = getEpisodeHistory();
  const isMine = (entry: WatchHistoryItem | EpisodeEntry): boolean =>
    readOwnerKey(entry) === key;

  const keptPointers = pointers.filter((entry) => !isMine(entry));
  const keptEpisodes = episodes.filter((entry) => !isMine(entry));
  const removed =
    pointers.length - keptPointers.length + (episodes.length - keptEpisodes.length);

  if (removed === 0) return { removed: 0, kept: keptPointers.length };

  writeRaw(JSON.stringify(keptPointers));
  writeEpisodeHistory(keptEpisodes);
  announceHistoryChanged();
  return { removed, kept: keptPointers.length };
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
export const pushLocalHistoryToAccount = async (
  userId?: string | number | null,
): Promise<{
  total: number;
  relayed: number;
  withheld: number;
  /**
   * How many PER-EPISODE records were relayed alongside the pointers.
   *
   * A separate count because it is a separate question: a title's pointer can be
   * carried while an episode's record is not, and the caller that decides
   * whether to write the "merged for this account" marker needs to know that
   * both stores landed. Folding it into `relayed` would make a merge that
   * carried every title and no episode look complete.
   */
  episodes: number;
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

  // ── WHO MAY BE CARRIED INTO THIS ACCOUNT (§6/§8) ──
  //
  // The filter, before anything is sent. The merge used to replay the whole local
  // list into whoever was signed in; that is right for its intended case (one
  // person, one device, a new account) and wrong for the case the brief names,
  // because a local entry had no owner. Entries stamped for a DIFFERENT account —
  // and entries whose stamp cannot be read — are left exactly where they are.
  // They stay in localStorage; nothing is deleted.
  //
  // `userId` is optional and its absence is not permissive: without a known
  // account, an entry stamped `user:<any>` is refused, because there is nothing
  // to match it against. See lib/historyOwnership.ts.
  const target = userId === undefined || userId === null ? null : userId;
  const adoptable = items.filter((item) => isAdoptable(item, target));
  const withheld = items.length - adoptable.length;

  let allSynced = true;
  // SEQUENTIALLY, not `Promise.all`. These are writes to one table for one user,
  // and the route reads the current row before it writes it; firing twenty of
  // them at once invites those read-modify-write pairs to interleave, including
  // with a player that is writing the same title in this very tab. One at a time
  // costs a few hundred milliseconds on a first sign-in and cannot race.
  for (const item of adoptable) {
    const synced = await writeLocalAndSync(item);
    if (!synced) allSynced = false;
  }

  // ── the OTHER started episodes of those same titles ──
  //
  // The loop above carries ONE slot per title — the last one, which is all the
  // parent row holds. §7's whole point is that a guest who watched S1E4 and then
  // S2E7 on this device keeps BOTH when they sign in, so the per-episode records
  // the pointer loop did not already cover are relayed as well, most recently
  // observed first.
  //
  // Bounded by EPISODE_RELAY_LIMIT and filtered by the same `isAdoptable` rule as
  // the pointer list — one adoption rule, two stores. The slot each pointer
  // already sent is skipped rather than re-sent: the parent write carries its own
  // slot, and sending it twice would be two decisions over one fact.
  const alreadySent = new Set(
    adoptable
      .map((item) => {
        const slot = episodeSlotOf(item);
        return slot === null
          ? null
          : episodeSlotKey(item.type, item.id, slot.season, slot.episode);
      })
      .filter((key): key is string => key !== null),
  );

  const episodeRelay = getEpisodeHistory()
    .filter((entry) => isAdoptable(entry, target))
    .filter((entry) => !alreadySent.has(episodeKeyOf(entry)))
    .slice(0, EPISODE_RELAY_LIMIT);

  for (const episode of episodeRelay) {
    const synced = await syncItemToServer(episode);
    if (!synced) allSynced = false;
  }

  // ── adoption: the device's history is now this account's ──
  //
  // After the relay, so an entry that failed to sync is still owned correctly
  // when the next navigation retries it. This closes the window the model would
  // otherwise leave open: an entry written while signed in, but before the
  // session probe had answered, is stamped `guest:<device>` — and a guest stamp
  // is adoptable by ANY account, so without this step a later viewer on the same
  // browser would inherit it. Adoption is what makes §8's "B ne doit jamais
  // récupérer l'historique A" hold on the expiry path, where no sign-out code of
  // ours ever runs.
  //
  // Only when the account is known: there is nothing to adopt INTO otherwise.
  if (target !== null) {
    const owner: HistoryOwner = { kind: "user", userId: target };
    const adopted = adoptEntries(getWatchHistory(), owner);
    if (adopted.changed) {
      writeRaw(JSON.stringify(adopted.entries));
    }

    // The per-episode store is adopted by the same call, for the same reason and
    // with the same owner. Skipping it would leave the child records stamped
    // `guest:<device>` after the merge, i.e. adoptable by whoever signs in on
    // this browser next — which is the leak the adoption step exists to close,
    // and it would be open on the store the brief is about.
    const adoptedEpisodes = adoptEntries(getEpisodeHistory(), owner);
    if (adoptedEpisodes.changed) {
      writeEpisodeHistory(adoptedEpisodes.entries);
    }
  }

  return {
    total: items.length,
    relayed: adoptable.length,
    withheld,
    episodes: episodeRelay.length,
    allSynced,
  };
};

// ─── anonymous session id ───

/**
 * The guest's storage handle.
 *
 * Now a thin alias: the value, the key it lives under and the rule for creating
 * it all belong to lib/historyOwnership.ts, which needs the same string to stamp
 * an entry with `guest:<device id>`. Two copies of that literal would be a
 * contract with nothing holding it together — renaming it on one side would look
 * like a working build while splitting the identity in two, and an entry stamped
 * with a key no session can be matched to is an entry that silently stops being
 * adoptable.
 *
 * It is a random opaque string, not an identifier for a person: no email, no IP,
 * no device fingerprint (§6).
 */
export const getAnonSessionId = (): string | null => getDeviceId();

// ─── server read (connected users) ───

/**
 * Reads the account's copy of the history, mapped to WatchHistoryItem format.
 *
 * IT THROWS WHEN IT COULD NOT READ, and that is the whole point of the
 * signature. This used to answer `[]` for a refused request, for a network
 * failure and for a genuinely empty history alike, so "we could not read your
 * history" and "you have no history" arrived on screen as the same thing:
 * nothing. A signed-in viewer whose server read failed saw an empty list and
 * concluded their history was gone, with nothing to tell them otherwise — the
 * false-success shape, where a failure is displayed as a fact about the data
 * (§8: a displayed absence is not evidence of absence).
 *
 * A 200 carrying an empty `progress` array IS a real answer and returns `[]`:
 * that is what a guest gets (no session, so no rows) and what an account with
 * nothing recorded gets. A non-2xx, or a request that did not complete, is not
 * an answer, and the caller is told so rather than handed an empty list.
 *
 * The route's half of this contract matters as much as this one: as long as
 * `GET /api/watch-time` answered `200 {progress: []}` out of its own `catch`,
 * no client could have distinguished the two cases however carefully it read
 * the response.
 */
export const getServerWatchHistory = async (): Promise<WatchHistoryItem[]> => {
  const res = await fetch("/api/watch-time");
  if (!res.ok) {
    throw new Error(`watch history unavailable: HTTP ${res.status}`);
  }
  const data = await res.json();

  // Unparseable or shape-changed bodies are "no answer" as well, and they fall
  // through to the empty list below only when the field is genuinely absent —
  // `res.json()` throwing on a malformed body is allowed to propagate.
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
};
