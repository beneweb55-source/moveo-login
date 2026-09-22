"use client";

/**
 * THE HISTORY TAB OF THE PROFILE (§10).
 *
 * WHAT WAS MISSING. The profile had four tabs — watchlist, favorites, watched,
 * settings — and all three list tabs read `/api/user/list`, i.e. the `user_list`
 * table, which records WHICH TITLES a viewer marked. None of them read
 * `watch_history`, so the profile had no view of what was actually watched, and
 * no view at all of where. A viewer could see that they had bookmarked a series
 * and could not see that they were on season 2, episode 7 of it.
 *
 * It is deliberately NOT a fifth tab over the same table. "Watched" is a mark the
 * viewer made; this is a record the player wrote. Merging them would produce a
 * list whose rows came from two different acts and could not be told apart — the
 * same objection that keeps credited watch time out of an observed total.
 *
 * THE ROWS ARE THE HOME PAGE'S ROWS. Same hook, same merge, same visibility
 * rule, so the two surfaces cannot disagree about which entry is the viewer's or
 * which position is current. The one intended difference is the argument:
 * `includeCompleted: true`. A finished film is dropped from "Reprendre la
 * lecture", where it would be an offer to resume something that is over. Here
 * the subject is the record, so watching a film to the end is precisely what
 * earns it a row.
 *
 * The link on each card carries `?s=<season>&e=<episode>` for a series, so it
 * leads to the season and episode the viewer stopped on, and to the film itself
 * for a film. What the card does NOT promise is a seek: the stored position is
 * displayed as an observation ("vu jusqu'à 32:14"), never as "reprendre à
 * 32:14", because no provider URL in this codebase carries a time (§2). See
 * lib/resumeCapability.ts and components/HistoryCard.tsx.
 */

import Link from "next/link";
import { History, Play } from "lucide-react";
import HistoryCard from "@/components/HistoryCard";
import { useWatchHistory } from "@/lib/useWatchHistory";
import { useLanguage } from "@/context/LanguageContext";

const ProfileHistoryTab = () => {
  const { items, loading, serverUnavailable, remove } = useWatchHistory({
    includeCompleted: true,
  });
  const { t } = useLanguage();

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="aspect-[2/3] rounded-lg bg-zinc-900/60 animate-pulse"
          />
        ))}
      </div>
    );
  }

  return (
    <div>
      {/* Above the grid, not instead of it: the rows below are real, and what is
          missing is the part of them that lives on the account. */}
      {serverUnavailable && (
        <p className="text-amber-500 text-sm mb-6">{t.profile.historyUnavailable}</p>
      )}

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 sm:py-24 text-center px-4">
          <History className="w-12 h-12 sm:w-14 sm:h-14 text-zinc-800 mb-3 sm:mb-4" />
          <p className="text-zinc-400 font-semibold text-base sm:text-lg mb-1">
            {t.profile.historyEmpty}
          </p>
          <p className="text-zinc-600 text-xs sm:text-sm mb-5 sm:mb-6">
            {t.profile.historyHint}
          </p>
          <Link
            href="/"
            className="px-5 py-2.5 bg-[#E50914] rounded-lg font-bold text-sm hover:bg-red-700 transition-colors"
          >
            {t.profile.explore}
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
          {items.map((item) => (
            <HistoryCard key={`${item.type}:${item.id}`} item={item} onRemove={remove} />
          ))}
        </div>
      )}

      {items.length > 0 && (
        <p className="mt-8 text-xs text-zinc-600 flex items-center gap-2">
          <Play className="w-3 h-3 shrink-0" />
          {t.profile.historyHint}
        </p>
      )}
    </div>
  );
};

export default ProfileHistoryTab;
