/**
 * WHICH SEASON AND EPISODE A TITLE PAGE OPENS ON — decided once, and testable.
 *
 * WHY THIS IS A MODULE AND NOT AN EFFECT. The history card's link carries
 * `?s=<season>&e=<episode>` precisely so that reopening a series lands on the
 * episode the viewer stopped at, and the two decisions behind that — reading the
 * slot out of the address bar, and accepting it only if the title really has that
 * season — lived inline inside `app/tv/[id]/page.tsx`. Inline, they could not be
 * tested, and this is the one promise in the feature that a wrong answer makes
 * silently: the page would open on season 1 episode 1, look completely normal,
 * and quietly throw away where the viewer was.
 *
 * So the two decisions are extracted here as pure functions over plain values.
 * They are a faithful transcription of the branches they replace, not a rewrite:
 * every fallback, every clamp and the specials season all behave as before. The
 * component now only wires them to state.
 *
 * The behaviour each one is responsible for:
 *
 *   1. `parseSlotQuery` — what the address bar ASKS FOR. `?s=2&e=7` means the
 *      viewer wants season 2 episode 7. Anything malformed means the viewer
 *      asked for nothing, and the caller falls back to wherever this device
 *      stopped, which is a real answer rather than a guess.
 *
 *   2. `chooseSlot` — what the title can actually GIVE. A slot is honoured only
 *      if that season exists in the season list the details endpoint returned.
 *      A stale link must not select a season that was removed, and a season that
 *      is no longer listed must not leave the page with no season selected at
 *      all.
 *
 * SEASON 0 IS A REAL VALUE. It is TMDB's SPECIALS season, which is why both
 * functions test `Number.isInteger` / `>= 1` on the values rather than their
 * truthiness. `if (season)` would drop every special.
 */

/** A season and episode number, as asked for or as chosen. */
export interface Slot {
  readonly season: number;
  readonly episode: number;
}

/** A season as the title-details endpoint describes it. */
export interface SeasonInfo {
  readonly season_number: number;
  /** Absent for a season TMDB has not counted; treated as "unknown", not as 0. */
  readonly episode_count?: number;
}

/** A slot the page will actually open, and the season's declared episode count. */
export interface ChosenSlot extends Slot {
  /**
   * The season's declared `episode_count`, passed through unchanged — including
   * when it is absent. It is an estimate the real episode list later corrects,
   * and collapsing "unknown" to 0 here would make the page claim a season has no
   * episodes.
   */
  readonly episodeCount?: number;
  /**
   * Whether this came from a REQUEST — the address bar or this device's stored
   * slot — rather than from the season-1 default.
   *
   * The caller needs the distinction because the two do different things to the
   * episode. A request moves the viewer; the default only chooses a season. The
   * details effect re-runs on a language change, and the default writing its
   * episode would pull a viewer who had navigated to a later episode back to the
   * first one. Reported from here so the rule is one testable decision instead
   * of a convention the component has to remember.
   */
  readonly fromRequest: boolean;
}

/**
 * The slot named by a query string, or null when it names none.
 *
 * Strict digit matching, and deliberately not `Number.parseInt`. `parseInt`
 * stops at the first character it cannot use, so `?s=2abc&e=7` would silently be
 * read as season 2 — a value nobody wrote. A malformed link must ask for
 * nothing, so that the caller falls back to this device's stored slot; reading
 * half of it would override a true answer with a fabricated one.
 *
 * Accepts both `"s=2&e=7"` and `"?s=2&e=7"`: `URLSearchParams` ignores a leading
 * `?`, and the caller passes `window.location.search` which includes it.
 */
export const parseSlotQuery = (search: string): Slot | null => {
  const params = new URLSearchParams(search);
  const rawSeason = params.get("s");
  const rawEpisode = params.get("e");

  if (rawSeason === null || rawEpisode === null) return null;
  if (!/^\d+$/.test(rawSeason) || !/^\d+$/.test(rawEpisode)) return null;

  // `Number` and not `parseInt`: the regex has already proved these are digits,
  // so this cannot read a prefix, and it cannot return NaN.
  return { season: Number(rawSeason), episode: Number(rawEpisode) };
};

/**
 * The slot to open on, given what was requested and what the title has.
 *
 * The requested slot wins over the season-1 default — but only if the season
 * list contains that season. Precedence, in order:
 *
 *   1. the requested season, when it exists. Its requested episode is kept if it
 *      is at least 1 AND the season's count does not rule it out. When the count
 *      is unknown (absent, or not a number) the episode is KEPT provisionally,
 *      because the real episode list fetched afterwards is authoritative and
 *      corrects it; dropping it here would turn "we do not know yet" into
 *      "start at 1".
 *   2. otherwise season 1, or the first season the title has when there is no
 *      season 1. Which of the two branches was taken is reported as
 *      `fromRequest`, because the caller does less to the episode on the
 *      fallback than on a request.
 *   3. otherwise null: the title has no seasons to open on, and the caller must
 *      leave the selection alone rather than invent one.
 *
 * The default is season 1 and NOT `seasons[0]`. The difference only shows on a
 * title that has specials, which TMDB lists as season 0 ahead of season 1: a
 * viewer arriving without a slot would otherwise be dropped into the specials.
 */
export const chooseSlot = (
  requested: Slot | null,
  seasons: readonly SeasonInfo[],
): ChosenSlot | null => {
  const requestedSeason = requested
    ? seasons.find((season) => season.season_number === requested.season)
    : undefined;

  if (requested && requestedSeason) {
    const count =
      typeof requestedSeason.episode_count === "number" ? requestedSeason.episode_count : 0;
    const episode =
      requested.episode >= 1 && (count === 0 || requested.episode <= count)
        ? requested.episode
        : 1;

    return {
      season: requested.season,
      episode,
      episodeCount: requestedSeason.episode_count,
      fromRequest: true,
    };
  }

  const firstSeason =
    seasons.find((season) => season.season_number === 1) ?? seasons[0];
  if (!firstSeason) return null;

  return {
    season: firstSeason.season_number,
    episode: 1,
    episodeCount: firstSeason.episode_count,
    fromRequest: false,
  };
};
