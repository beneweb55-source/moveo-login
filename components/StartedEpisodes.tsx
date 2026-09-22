"use client";

/**
 * THE OTHER EPISODES OF THIS SERIES THE VIEWER HAS STARTED (§18).
 *
 * WHERE THE DATA COMES FROM, AND WHY IT IS TWO SOURCES
 *
 * `watch_history` has `UNIQUE(user_id, media_type, media_id)`, i.e. one row per
 * TITLE: the parent row can remember "S2E7 at 32:14" and it cannot remember "and
 * S1E4 at 05:00 as well". So the per-slot record is a second store, and it exists
 * twice for the same reason every other history record does — locally for a
 * guest (`watch_history_episodes` in localStorage, written by
 * utils/historyManager.recordEpisodeFor) and on the server for a signed-in
 * viewer (`watch_history_episodes` table, written inside the same transaction as
 * the parent row).
 *
 * The local store is read FIRST and unconditionally, because it is the only copy
 * a guest has; the server is asked only when the resolver proves there is an
 * account. When both answer, the two are merged slot by slot — never
 * concatenated, which would show the same episode twice.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *
 *  - No seek, and no promise of one. Each row's timecode is the position that was
 *    last OBSERVED for that episode, and the label says so ("vu jusqu'à 3:12")
 *    rather than "reprendre à 3:12". §2 is exact about this: no provider
 *    `buildUrl` in lib/providers.ts carries a time parameter, so nothing here can
 *    make the player open at that second. A row's job is to take the viewer back
 *    to the right episode — which is real, and is what the link does.
 *  - No empty state, and no invented row. With nothing started it returns null:
 *    "you have started no other episode" is the absence of a section, not a card
 *    that says "0".
 *  - No owner filter of its own. Visibility is `visibleEntriesFor`, the same rule
 *    the Continue Watching list uses, so an episode A watched cannot appear here
 *    for B on a shared browser (§5/§23).
 *  - It cannot read another viewer's rows: `GET /api/watch-time/episodes` filters
 *    on the `auth_token` cookie and accepts no `user_id` parameter.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Play } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { visibleEntriesFor } from "@/lib/historyOwnership";
import { resolveHistoryOwner } from "@/lib/historyViewer";
import { getEpisodeHistory, HISTORY_UPDATED_EVENT } from "@/utils/historyManager";

/** One row of the strip: a slot, the last position seen in it, and when. */
interface StartedEpisode {
  season: number;
  episode: number;
  /** Seconds, or null when no position was ever measured for this episode. */
  position: number | null;
  /** Epoch ms of the observation; 0 when the record carries no usable time. */
  observedAt: number;
}

const slotKey = (season: number, episode: number): string => `${season}:${episode}`;

const numberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** `pg` may hand back a NUMERIC as a string, so every number goes through here. */
const integerOrNull = (value: unknown): number | null => {
  const parsed = numberOrNull(value);
  return parsed !== null && Number.isInteger(parsed) ? parsed : null;
};

/**
 * Newest observation wins, EXCEPT that a newer row which measured nothing does
 * not replace an older one that did.
 *
 * That is the display-side reading of the same asymmetry the write path applies
 * (`resolveProgression` refuses to let an unmeasured observation displace a
 * measured one). Showing "S1E4" with no timecode because a page was opened and
 * closed would throw away the one fact worth keeping.
 */
const mergeBySlot = (
  a: StartedEpisode | undefined,
  b: StartedEpisode,
): StartedEpisode => {
  if (!a) return b;
  if (a.position === null) return { ...b, position: b.position ?? null };
  if (b.position === null) {
    return { ...a, observedAt: Math.max(a.observedAt, b.observedAt) };
  }
  return b.observedAt >= a.observedAt ? b : a;
};

/** Enough to answer "where else was I" without becoming a second episode list. */
const MAX_ROWS = 6;

const formatPosition = (seconds: number): string => {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
};

interface StartedEpisodesProps {
  id: string;
  /** The slot the page is currently pointed at; excluded from the strip. */
  season?: number | null;
  episode?: number | null;
}

const StartedEpisodes = ({ id, season, episode }: StartedEpisodesProps) => {
  const [rows, setRows] = useState<StartedEpisode[]>([]);
  const { t } = useLanguage();

  const load = useCallback(async () => {
    try {
      const viewer = await resolveHistoryOwner();

      // Local first: it is the only copy a guest has, and it is free.
      const bySlot = new Map<string, StartedEpisode>();
      for (const entry of visibleEntriesFor(getEpisodeHistory(), viewer)) {
        const slot: StartedEpisode = {
          season: entry.season,
          episode: entry.episode,
          position: numberOrNull(entry.timestamp),
          observedAt: numberOrNull(entry.last_watched) ?? 0,
        };
        const key = slotKey(slot.season, slot.episode);
        bySlot.set(key, mergeBySlot(bySlot.get(key), slot));
      }

      // The server copy exists only for a proven account. A guest's request
      // answers `available: false` with no rows, which is not an error — there
      // is simply nothing on the server to read, and the local rows above are
      // the answer.
      if (viewer.status === "ready" && viewer.owner?.kind === "user") {
        try {
          const res = await fetch(
            `/api/watch-time/episodes?media_type=tv&media_id=${encodeURIComponent(id)}`,
          );
          const data = await res.json();
          const serverRows: unknown[] = Array.isArray(data?.episodes) ? data.episodes : [];

          for (const raw of serverRows) {
            const row = raw as Record<string, unknown>;
            const rowSeason = integerOrNull(row?.season);
            const rowEpisode = integerOrNull(row?.episode);
            if (rowSeason === null || rowEpisode === null) continue;

            const observed = row?.last_updated;
            const parsed =
              typeof observed === "string" || observed instanceof Date
                ? new Date(observed as string).getTime()
                : Number.NaN;
            const slot: StartedEpisode = {
              season: rowSeason,
              episode: rowEpisode,
              position: numberOrNull(row?.current_time),
              observedAt: Number.isFinite(parsed) ? parsed : 0,
            };
            const key = slotKey(rowSeason, rowEpisode);
            bySlot.set(key, mergeBySlot(bySlot.get(key), slot));
          }
        } catch {
          // Offline, or the endpoint refused. The local rows are still true.
        }
      }

      // The current episode is excluded: showing it here AND as the player's
      // own episode would read as the same episode listed twice, which is a bug
      // in the interface and not a nuance.
      const others = [...bySlot.values()]
        .filter((row) => !(row.season === season && row.episode === episode))
        .sort((a, b) => b.observedAt - a.observedAt)
        .slice(0, MAX_ROWS);

      setRows(others);
    } catch {
      // Nothing on screen is the honest outcome when we could not read.
      setRows([]);
    }
  }, [id, season, episode]);

  useEffect(() => {
    void load();
  }, [load]);

  // Re-read when the history changes by a direct action. Playback does not fire
  // this (§14), so this cannot become a re-fetch loop driven by the player's own
  // save interval.
  useEffect(() => {
    const onChanged = () => { void load(); };
    window.addEventListener(HISTORY_UPDATED_EVENT, onChanged);
    return () => window.removeEventListener(HISTORY_UPDATED_EVENT, onChanged);
  }, [load]);

  if (rows.length === 0) return null;

  return (
    <div className="mt-6">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-white/50 mb-3">
        {t.home.startedEpisodes}
      </h3>
      <div className="flex flex-wrap gap-3">
        {rows.map((row) => (
          <Link
            key={slotKey(row.season, row.episode)}
            href={`/tv/${id}?s=${row.season}&e=${row.episode}`}
            className="group flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 transition-colors hover:border-[#E50914]/50 hover:bg-[#E50914]/10"
          >
            <Play className="w-4 h-4 text-[#E50914] shrink-0" />
            <span className="flex flex-col leading-tight">
              <span className="text-sm font-semibold text-white">
                S{row.season} · {t.details.episode} {row.episode}
              </span>
              {row.position !== null && (
                // "vu jusqu'à", not "reprendre à": the number is a stored
                // observation, and no provider here is handed a time to seek to.
                <span className="text-xs text-white/50">
                  {t.home.watchedUpTo} {formatPosition(row.position)}
                </span>
              )}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default StartedEpisodes;
