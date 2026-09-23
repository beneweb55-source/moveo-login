"use client";

import React from "react";
import Link from "next/link";
import { Play, Clock, RotateCcw, Trash2, Film } from "lucide-react";
import Image from "next/image";
import { WatchHistoryItem, isCompleted } from "@/utils/historyManager";
import { promisesPositionResume } from "@/lib/resumeCapability";
import { displayTitleFor } from "@/lib/historyList";
import { formatProgress } from "@/lib/timecode";
import { useLanguage } from "@/context/LanguageContext";

interface HistoryCardProps {
  item: WatchHistoryItem;
  /**
   * Removes this entry. Provided by the section, which owns the store: the card
   * asks, it does not write, so the list and the stored history cannot disagree.
   * When it is absent the delete control is not rendered at all — a button that
   * does nothing is worse than no button.
   */
  onRemove?: (item: WatchHistoryItem) => void;
}

const HistoryCard = ({ item, onRemove }: HistoryCardProps) => {
  const { t } = useLanguage();

  const posterUrl = item.poster_path
    ? (item.poster_path.startsWith('http') ? item.poster_path : `https://image.tmdb.org/t/p/w500${item.poster_path}`)
    : null;

  /**
   * `typeof` and not a truthiness check: season 0 is TMDB's SPECIALS season, and
   * `item.season && item.episode` therefore hid the badge on exactly the
   * episodes §12 asks to be able to navigate to. The types are checked rather
   * than the values for the same reason.
   */
  const hasEpisode =
    item.type === "tv" &&
    typeof item.season === "number" &&
    typeof item.episode === "number";

  const seasonLabel = item.season === 0 ? t.details.specials : `${t.details.season} ${item.season}`;
  const episodeLabel = hasEpisode
    ? `${seasonLabel} · ${t.details.episode} ${item.episode}`
    : "";

  /**
   * What the card can honestly claim — two questions, not one.
   *
   * 1. WHAT WE MEASURED (`hasPosition`):
   *      - no measured position → the entry says only "this is the episode you
   *        were on". §13 forbids inferring playback from a page visit, so such an
   *        entry genuinely exists and must not borrow the authority of one that
   *        carries a number.
   *      - a measured position that is finished → starting over is what will
   *        happen, so the card says so rather than "Reprendre" on something over.
   *      - a measured position, unfinished → the case below.
   *
   * 2. WHAT WE CAN DO ABOUT IT (`promisesPositionResume`). This is the second
   *    question and it is the one the card used to skip entirely. The player has
   *    no way to be told where to start: no provider's URL carries a time, and no
   *    provider's position resume has ever been observed. See
   *    lib/resumeCapability.ts, where the list that could make this true is
   *    deliberately empty.
   *
   * So an unfinished entry with a position on a SERIES reads "Reprendre
   * l'épisode": content and slot ARE restored, which is a real offer, and it is
   * what the link actually delivers via `?s=&e=`. On a FILM it reads "Regarder",
   * because there is no episode to name and a film that restarts at 0:00 has not
   * been continued — calling that "Continuer" would describe something that will
   * not happen.
   *
   * The timecode and the progress bar stay on the card in both cases. They are a
   * statement about the RECORD, which we do have; the label is the promise about
   * PLAYBACK, which is the part that must not be overstated (§2, §19).
   */
  const hasPosition = typeof item.timestamp === "number";
  const finished = item.completed ?? isCompleted(item.timestamp, item.duration);
  const positionResume = promisesPositionResume(item.provider);
  const actionLabel = !hasPosition
    ? t.home.watchNow
    : finished
      ? t.home.replayFromStart
      : positionResume
        ? t.home.continueWatching
        : hasEpisode
          ? t.home.resumeEpisode
          : t.home.watchNow;
  const ActionIcon = finished && hasPosition ? RotateCcw : Play;

  const progressText = formatProgress(item.timestamp, item.duration);

  /**
   * NOT ALWAYS `item.title` — an entry that was stored without a name still has
   * to be identifiable on the card. The rule, and the measurement behind it, live
   * in lib/historyList.ts (`displayTitleFor`) beside the other display decisions,
   * so that the home page's strip and the profile's history tab cannot disagree
   * about what an unnamed entry is called.
   */
  const displayTitle = displayTitleFor(item);

  // Clamped: a stored position past its own runtime is bad data, and a bar
  // wider than its track is a rendering artefact on top of it.
  const progressPercent =
    hasPosition && typeof item.duration === "number" && item.duration > 0
      ? Math.min(100, (item.timestamp! / item.duration) * 100)
      : 0;

  /**
   * The episode goes in the URL, not only in history.
   *
   * §10 requires that reopening a title returns to the right episode. Carrying
   * `?s=&e=` makes the link itself say where it goes, so the destination does
   * not depend on the reader's localStorage still holding the entry.
   */
  const href = hasEpisode
    ? `/${item.type}/${item.id}?s=${item.season}&e=${item.episode}`
    : `/${item.type}/${item.id}`;

  return (
    <div className="relative w-full flex-shrink-0 group/card">
      <Link
        href={href}
        className="relative flex flex-col gap-3 cursor-pointer w-full"
      >
        {/* Poster Container */}
        <div className="relative w-full aspect-[2/3] rounded-xl overflow-hidden shadow-lg bg-[#1a1a1a] transition-all duration-300 ease-in-out group-hover/card:shadow-[0_0_20px_rgba(229,9,20,0.4)] group-hover/card:scale-105 border border-white/5">
          {/*
            NO ARTWORK IS NOT AN INVITATION TO INVENT SOME.

            This slot used to fall back to `https://picsum.photos/seed/poster/…`,
            a RANDOM photograph, in the position where a title's own poster goes.
            It was harmless while only the rare entry lacked a poster. It is not
            harmless now: measured 2026-09-23, 107 of the 108 rows in
            `watch_history` carry no poster_path, and the GET no longer hides
            them, so a fabricated image would be shown as the artwork of a real
            title — §3's prohibition, and a third-party request per card on top.

            A film mark on the card's own background says "no artwork held",
            which is true, and says it without a network call.
          */}
          {posterUrl ? (
            <Image
              src={posterUrl}
              alt={displayTitle}
              fill
              className="object-cover transition-transform duration-300 ease-in-out group-hover/card:scale-105"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div
              className="absolute inset-0 flex items-center justify-center"
              aria-hidden="true"
            >
              <Film className="w-10 h-10 text-zinc-800" />
            </div>
          )}

          {/* Progress Bar — rendered only against a runtime we actually hold. */}
          {progressPercent > 0 && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-800">
              <div className="h-full bg-[#E50914]" style={{ width: `${progressPercent}%` }} />
            </div>
          )}

          {/* Play Button Overlay */}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition-opacity duration-300 bg-black/40 backdrop-blur-[2px]">
            <div className="w-12 h-12 rounded-full bg-[#E50914] flex items-center justify-center transform scale-0 group-hover/card:scale-100 transition-transform duration-300 shadow-lg">
              <ActionIcon className="w-6 h-6 text-white fill-current ml-1" />
            </div>
          </div>

          {/* Season/Episode badge — season 0 renders as the specials season. */}
          {hasEpisode && (
            <div className="absolute top-2 right-2 z-10">
              <span className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white bg-black/60 backdrop-blur-md rounded-md border border-white/10">
                {item.season === 0 ? t.details.specials : `S${item.season}`} · E{item.episode}
              </span>
            </div>
          )}

          {/* Provider Badge */}
          {item.provider && (
            <div className="absolute bottom-3 left-2 z-10">
              <span className="px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-zinc-300 bg-black/80 backdrop-blur-md rounded-md border border-white/5 flex items-center gap-1">
                <Play className="w-2 h-2 fill-current" />
                {item.provider}
              </span>
            </div>
          )}
        </div>

        {/* Info Section */}
        <div className="flex flex-col px-1">
          <h3 className="text-sm font-semibold text-white truncate group-hover/card:text-[#E50914] transition-colors duration-300">
            {displayTitle}
          </h3>

          {/* "Saison 2 · Épisode 7" — the episode line §10 asks for. */}
          {episodeLabel && (
            <p className="text-xs text-zinc-400 truncate mt-0.5">{episodeLabel}</p>
          )}

          <div className="flex items-center justify-between mt-1 opacity-80 group-hover/card:opacity-100 transition-opacity duration-300 gap-2">
            <span className="text-xs text-zinc-400 flex items-center gap-1 min-w-0">
              {finished && hasPosition ? (
                <RotateCcw className="w-3 h-3 flex-shrink-0" />
              ) : (
                <Clock className="w-3 h-3 flex-shrink-0" />
              )}
              <span className="truncate">{actionLabel}</span>
            </span>
            {/* "32:14 / 47:10" — present only when a position was measured. */}
            {progressText && (
              <span className="text-xs text-zinc-500 tabular-nums flex-shrink-0">
                {progressText}
              </span>
            )}
          </div>
        </div>
      </Link>

      {/*
        Outside the Link, not inside it: a button nested in an anchor is invalid
        HTML, and a click on it would otherwise be a navigation. The handlers are
        belt and braces — the button is a sibling, so there is nothing to bubble
        to, but the intent is worth stating.
      */}
      {onRemove && (
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onRemove(item);
          }}
          aria-label={`${t.home.removeFromHistory} — ${displayTitle}`}
          title={t.home.removeFromHistory}
          className="absolute top-2 left-2 z-20 p-1.5 rounded-md bg-black/60 hover:bg-[#E50914] text-white/70 hover:text-white backdrop-blur-md border border-white/10 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E50914]"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};

export default HistoryCard;
