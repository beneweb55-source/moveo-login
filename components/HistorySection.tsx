"use client";

/**
 * "REPRENDRE LA LECTURE" — the home page's history strip.
 *
 * WHAT IT SHOWS, AND FOR WHOM
 *
 * It renders for a guest and for a signed-in viewer alike, because the history
 * it reads exists for both: a guest's lives entirely in this browser's store,
 * and a signed-in viewer's is that same store merged with their account's copy.
 * There is no "sign in to see your history" branch here, and no empty state
 * pretending otherwise — a visitor who has watched something sees it.
 *
 * Each card leads to the precise place the viewer stopped: a series entry links
 * to `?s=<season>&e=<episode>`, so the destination carries the slot itself and
 * does not depend on this browser's store still holding the row. See
 * HistoryCard, which owns that link and the honest labelling of what it can and
 * cannot promise about the position.
 *
 * The list rule itself — who may see which entry, and what belongs in a
 * "resume" list — is NOT here. It is lib/historyList.ts, shared with the
 * profile's history tab so the two surfaces cannot disagree, and the reads are
 * lib/useWatchHistory.ts.
 *
 * WHY IT CAN NOW SAY IT FAILED
 *
 * `serverUnavailable` is set when a PROVEN account's copy could not be read. The
 * strip still shows this browser's rows — they are real, and they are all a
 * guest has — but it no longer presents them as the whole of the viewer's
 * history when it is not. Before this, a failed read and an empty history were
 * the same event, and the viewer with no rows to fall back on saw nothing at
 * all: a statement about their data made by a request that never returned any.
 */

import Carousel from "@/components/Carousel";
import HistoryCard from "@/components/HistoryCard";
import { useWatchHistory } from "@/lib/useWatchHistory";
import { History } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

const HistorySection = () => {
  const { items, loading, serverUnavailable, remove } = useWatchHistory();
  const { t } = useLanguage();

  // Nothing to show and nothing to explain: the section simply is not there.
  // "You have watched nothing yet" is the absence of a section, not a heading
  // over an empty row.
  if (items.length === 0 && !serverUnavailable) {
    return null;
  }

  return (
    <div className="relative mb-12">
      <h2 className="text-2xl md:text-3xl font-bold mb-8 text-white flex items-center gap-2">
        <span className="w-1 h-8 bg-[#E50914] rounded-full mr-2"></span>
        <History className="w-6 h-6 text-[#E50914]" />
        {t.home.resumeWatching}
      </h2>

      {/* Above the strip, not instead of it: the rows below are real, and what
          is missing is the rest of them. */}
      {serverUnavailable && (
        <p className="text-amber-500 text-sm mb-4">{t.home.historyUnavailable}</p>
      )}

      {items.length > 0 && (
        <Carousel
          data={items}
          loading={loading}
          renderItem={(item) => <HistoryCard item={item} onRemove={remove} />}
        />
      )}
    </div>
  );
};

export default HistorySection;
