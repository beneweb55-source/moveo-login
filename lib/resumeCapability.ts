/**
 * What we can actually restore, per provider — and the refusal to guess.
 *
 * ─── THE FINDING THIS MODULE EXISTS FOR ──────────────────────────────────────
 *
 * The product records a position (32:14), shows it on the card, puts the season
 * and episode in the URL — and then hands the viewer a player that starts at
 * 0:00. The chain breaks at exactly one link, and it breaks for a reason that
 * cannot be fixed by writing more client code: WE HAVE NO WAY TO ASK A PROVIDER
 * TO SEEK.
 *
 * That is not an opinion, and it is not inferred from the providers looking
 * alike. It is three separate measurements:
 *
 *  1. WE NEVER SEND ANYTHING TO AN IFRAME. Across the whole repository the only
 *     outbound `postMessage` is `window.opener.postMessage({type:
 *     'OAUTH_AUTH_SUCCESS'}, '*')` in app/api/auth/google/callback/route.ts.
 *     lib/playerMessages.ts is an INBOUND validator: it is the code that
 *     receives a position, and there is no code anywhere that transmits one.
 *  2. NO PROVIDER'S URL GRAMMAR CARRIES A TIME. All six `buildUrl`
 *     implementations in lib/providers.ts build `{id, season, episode}` and
 *     nothing else — no `?t=`, no `start=`, no `#t=`. The only variables any of
 *     them accepts are the title and the slot.
 *  3. ONLY TWO PROVIDERS HAVE EVER BEEN OBSERVED SPEAKING TO US. Frembed (which
 *     emits `episode_change`, an episode notification that carries no position)
 *     and VidLink (which emits `MEDIA_DATA` carrying a real playback position).
 *     The other four have never been observed emitting anything at all, which is
 *     why their `messageOrigins` in lib/providers.ts is empty.
 *
 * A mechanism may not be invented on top of that. "There is probably a `?start=`
 * parameter" is exactly the guess the brief forbids, and it fails in the way
 * that matters: it would look like it worked. The iframe would load, the page
 * would not error, and the position would still be 0:00 — with a comment in the
 * code asserting it was restored.
 *
 * ─── WHAT WE CAN HONESTLY RESTORE ────────────────────────────────────────────
 *
 * Three different things, which the interface must stop conflating (§19):
 *
 *   CONTENT RESTORED  — we open the right title.      Ours. Works for all six.
 *   EPISODE RESTORED  — we open the right S/E.        Ours. Works for all six,
 *                                                      and is the part §10/§11
 *                                                      is actually about.
 *   POSITION RESTORED — the player starts at 32:14.   NOT OURS. For no provider
 *                                                      today. See below.
 *
 * So the honest resume today is a resume OF THE EPISODE. That is not nothing:
 * it is the difference between "you were on S2E7" and "you are on whatever the
 * player defaults to". It is simply not the same claim as "at 32:14", and the
 * UI must not make the second one while delivering the first.
 *
 * ─── THE ONE PROVIDER WHERE A POSITION CHANNEL PLAUSIBLY EXISTS ──────────────
 *
 * VidLink keeps its own per-episode progress and re-sends it: the measured
 * envelope carries `show_progress.s{season}e{episode}.progress.watched`, keyed
 * by exactly the season and episode our URL already names. So a viewer returning
 * to an episode VidLink remembers MIGHT be resumed by VidLink itself, inside the
 * frame, without us asking. That is a real thing to test and a real reason to
 * test it.
 *
 * It is NOT observed, and this module will not pretend otherwise. The evidence
 * we have shows VidLink REPORTING a position, never acting on an instruction —
 * and for the title measured it carried `watched: 0` on mount, i.e. no resume.
 * Turning "might" into "does" requires one browser observation, which is a
 * measurement to take, not code to write. Until it is taken, the label here is
 * `provider-side-unmeasured` and the promise below is false.
 *
 * ─── HOW THIS MODULE PREVENTS THE GUESS BEING MADE BY ACCIDENT ───────────────
 *
 * `CAPABILITIES` is documentation: it records, per provider, what has been
 * measured. It is NOT what the interface consults for a promise. That is
 * `promisesPositionResume`, which reads `POSITION_RESUME_OBSERVED` — an
 * explicitly empty list, separate from the table, that only grows when a resume
 * has been SEEN.
 *
 * The separation is the point. A future edit that types `position: "observed"`
 * into the table changes nothing the viewer is told, because the table is not
 * the input to that decision. To make the interface promise a position, someone
 * has to add a provider to a list whose comment says what it takes to get there,
 * and `assertCapabilityTableIsHonest` fails the build if the two disagree.
 *
 * Pure module: no React, no DOM, no network. Tested in
 * tests/resumeCapability.test.ts.
 */

/** How a provider's position can be influenced from our domain. */
export type PositionResume =
  /** We have no mechanism at all: no outbound channel, no time parameter. */
  | "no-channel"
  /**
   * The provider keeps its OWN per-episode progress and may act on it. Whether
   * it resumes is UNMEASURED. Distinct from "no-channel" because it is a thing
   * worth testing, and distinct from "observed" because the test has not been
   * run — a distinction the report depends on.
   */
  | "provider-side-unmeasured"
  /** A resume was actually OBSERVED. Nothing may claim this yet. */
  | "observed";

export interface ResumeCapability {
  /** The provider's own name, exactly as lib/providers.ts carries it. */
  readonly provider: string;
  /** We open the right title. */
  readonly content: true;
  /** Our URL names the season and episode, so the slot is restored. */
  readonly episode: true;
  /** What, if anything, we can do about the position. */
  readonly position: PositionResume;
  /**
   * The measurement behind the verdict — the observation that produced it, or
   * an explicit statement that no observation exists. Never empty: a capability
   * with no evidence is a guess with a label on it.
   */
  readonly evidence: string;
}

/**
 * Providers whose position resume has been OBSERVED, by name.
 *
 * EMPTY, AND IT MUST STAY EMPTY UNTIL A RESUME IS SEEN. This is the only input
 * to `promisesPositionResume`, so it is the only thing that can make the
 * interface claim a position will be restored. Adding a name here is a statement
 * that a viewer was watched returning to a partly-played title and the player
 * started where it had stopped. A documented API, a URL parameter someone found
 * in a page's source, or an inference from another provider's behaviour is not
 * that, and does not belong here.
 */
export const POSITION_RESUME_OBSERVED: readonly string[] = [];

/**
 * Per-provider record of what has been measured, as of 2026-09-22.
 *
 * The `position` column is deliberately uniform: no provider is beyond
 * `provider-side-unmeasured`, and every `no-channel` entry says which
 * measurement established the absence rather than asserting it. Absence of
 * evidence is only a finding when someone looked — so each line names what was
 * looked at.
 */
const CAPABILITIES: readonly ResumeCapability[] = [
  {
    provider: "Frembed",
    content: true,
    episode: true,
    position: "no-channel",
    evidence:
      "Observed 2026-09-21 (docs/provider-matrix.md): emits `episode_change` — an " +
      "episode notification, carrying no position — and no `timeupdate` was ever " +
      "received from its origin, in either direction. Its URL grammar, " +
      "`/embed/serie/{id}?id=&sa=&epi=`, accepts no time parameter. Nothing to " +
      "send a position with, and nothing that has ever reported one.",
  },
  {
    provider: "VidSrc.to",
    content: true,
    episode: true,
    position: "no-channel",
    evidence:
      "No message has ever been observed from this origin, which is why its " +
      "`messageOrigins` is empty in lib/providers.ts — the list is populated only " +
      "by OBSERVED emitters. Its grammar, `/embed/tv/{id}/{s}/{e}`, carries no " +
      "time parameter, so there is no channel in either direction.",
  },
  {
    provider: "VidSrc.me",
    content: true,
    episode: true,
    position: "no-channel",
    evidence:
      "No message has ever been observed from this origin (`messageOrigins` " +
      "empty). Its grammar, `/embed/tv?tmdb=&season=&episode=`, carries no time " +
      "parameter.",
  },
  {
    provider: "2Embed",
    content: true,
    episode: true,
    position: "no-channel",
    evidence:
      "No message has ever been observed from this origin (`messageOrigins` " +
      "empty). Its grammar, `/embedtv/{id}&s=&e=`, carries no time parameter.",
  },
  {
    provider: "SmashyStream",
    content: true,
    episode: true,
    position: "no-channel",
    evidence:
      "No message has ever been observed from this origin (`messageOrigins` " +
      "empty). Its grammar, `/embed/tmdb-tv-{id}-{s}-{e}`, carries no time " +
      "parameter.",
  },
  {
    provider: "VidLink",
    content: true,
    episode: true,
    position: "provider-side-unmeasured",
    evidence:
      "Observed 2026-09-21, inbound only: sends `MEDIA_DATA` on mount and every " +
      "~2000 ms carrying `show_progress.s{season}e{episode}.progress.watched` — a " +
      "real playback position, keyed by exactly the slot our URL already names. " +
      "Whether it RESUMES from that map on mount is NOT observed: the measurement " +
      "for movie 969681 carried `watched: 0` with a real `duration: 8678`, i.e. " +
      "the provider reporting a position, not acting on one. One browser " +
      "observation of a returning viewer would settle it. Until then: unmeasured.",
  },
  // Sibnet is NOT in PROVIDERS — it is resolved by our own /api/sibnet scrape —
  // but both of its names are in STORABLE_SERVERS, so a history entry can carry
  // either one and the record has to cover them. Two entries and not one shared
  // record, because they are two distinct stored values: the same shape of
  // mistake as a de-duplication that keys on the id and ignores the type.
  {
    provider: "Sibnet VF",
    content: true,
    episode: true,
    position: "no-channel",
    evidence:
      "No position has ever been observed from Sibnet (measured — see the " +
      "provider list in lib/playbackSignal.ts: Frembed, SmashyStream and Sibnet " +
      "report no position, so they report no watch time either). Its frame URL is " +
      "built by our own scrape, app/api/sibnet/route.ts, as " +
      "`https://video.sibnet.ru/shell.php?videoid=<id>` — ONE parameter, `videoid`. " +
      "There is no time parameter to inject and no inbound message channel. The " +
      "episode is selected by the scrape's search query rather than by the URL, " +
      "which is why the slot still restores while the position cannot.",
  },
  {
    provider: "Sibnet VOSTFR",
    content: true,
    episode: true,
    position: "no-channel",
    evidence:
      "Identical mechanism and identical verdict to Sibnet VF — same scrape, same " +
      "`shell.php?videoid=<id>` frame, same absence of any observed position. " +
      "Separate entry because it is a separate storable value: `provider` is " +
      "stored as the selected SERVER NAME, so the two are not interchangeable here " +
      "even though they resolve through the same route.",
  },
];

/** Fast lookup, built once. */
const BY_NAME: ReadonlyMap<string, ResumeCapability> = new Map(
  CAPABILITIES.map((capability) => [capability.provider, capability]),
);

/**
 * The measured record for one provider, or null when we have none.
 *
 * `null` is the answer for an unknown name, for an empty string, and for the
 * `provider: ""` that entries read back from the server carry — server rows do
 * not record which source was used, so a synced entry genuinely has no provider.
 * Every caller must treat null as "no capability established", which is the safe
 * direction: it is what stops a restored-from-server entry from inheriting a
 * promise it has no evidence for.
 */
export const resumeCapabilityOf = (
  provider: string | null | undefined,
): ResumeCapability | null => {
  if (typeof provider !== "string" || provider === "") return null;
  return BY_NAME.get(provider) ?? null;
};

/**
 * May the interface tell the viewer their position will be restored?
 *
 * Reads `POSITION_RESUME_OBSERVED` and NOT the capability table, deliberately:
 * see the header. False for every provider today, and false for a provider we
 * have never heard of — including the empty string on a server-sourced entry.
 */
export const promisesPositionResume = (
  provider: string | null | undefined,
): boolean =>
  typeof provider === "string" &&
  provider !== "" &&
  POSITION_RESUME_OBSERVED.includes(provider);

/**
 * The §19 separation, as a value: the three restores, kept apart.
 *
 * `position` is the only field that can be false while the others are true, and
 * that combination is the normal one today — content and episode are ours, the
 * position is not. Callers must render these separately rather than collapsing
 * them into one "resumed" badge.
 */
export interface RestoreOutcome {
  /** We open the right title. */
  readonly content: boolean;
  /** We open the right season and episode. False for a film. */
  readonly episode: boolean;
  /** The player will start at the recorded timecode. */
  readonly position: boolean;
}

/**
 * What a given entry or player launch will actually restore.
 *
 * `hasSlot` is passed rather than derived from the item's fields so the two
 * season-0 traps cannot reappear: `season: 0` is TMDB's SPECIALS season and is a
 * real slot, so a caller must decide with `typeof x === "number"` and not with a
 * truthiness test. Taking the answer as an argument makes that decision visible
 * at the call site instead of hiding it in here.
 */
export const describeRestore = (
  provider: string | null | undefined,
  hasSlot: boolean,
): RestoreOutcome => ({
  content: true,
  episode: hasSlot,
  position: promisesPositionResume(provider),
});

/**
 * Fails when the documentation and the promise have drifted apart.
 *
 * Called from the test suite, not at import time: a mistake here must break the
 * build, not the running page. It exists so a table entry claiming an observed
 * resume cannot sit there unbacked — the failure mode this whole module is built
 * to prevent is a claim that reads as measured when nothing was measured.
 */
export const validateCapabilityTable = (
  table: readonly ResumeCapability[],
  observed: readonly string[],
): void => {
  for (const capability of table) {
    if (capability.evidence.trim() === "") {
      throw new Error(
        `${capability.provider}: a capability with no evidence is a guess`,
      );
    }
    if (capability.position === "observed") {
      if (!observed.includes(capability.provider)) {
        throw new Error(
          `${capability.provider} claims an observed position resume but is not in ` +
            `POSITION_RESUME_OBSERVED — the table is documentation, the list is what ` +
            `the interface is allowed to promise`,
        );
      }
      if (!/observed/i.test(capability.evidence)) {
        throw new Error(
          `${capability.provider}: claiming "observed" requires evidence that says ` +
            `what was observed and when`,
        );
      }
    }
  }

  // The other direction: a provider promoted to the promise list must also have
  // a table entry stating it, so there is one place that says why.
  for (const provider of observed) {
    const capability = table.find((entry) => entry.provider === provider);
    if (!capability) {
      throw new Error(
        `${provider} promises a position resume but has no capability entry`,
      );
    }
    if (capability.position !== "observed") {
      throw new Error(
        `${provider} promises a position resume but its own record says ` +
          `"${capability.position}"`,
      );
    }
  }
};

/** The check applied to what we actually ship. See validateCapabilityTable. */
export const assertCapabilityTableIsHonest = (): void =>
  validateCapabilityTable(CAPABILITIES, POSITION_RESUME_OBSERVED);

/** Test seam: the table, for the drift checks. Not for application code. */
export const __capabilityTable = CAPABILITIES;
