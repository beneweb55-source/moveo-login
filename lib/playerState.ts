/**
 * Player state machine + provider-selection reducer.
 *
 * Pure module: no React, no DOM. Tested in tests/playerState.test.ts.
 *
 * WHY THIS EXISTS (audit findings H-01, H-06, H-07, RCT-01/07/10):
 * the previous implementation let four writers race on one piece of state —
 * a server-side health probe, a localStorage preference, a manual click, and a
 * watchdog timeout — with no arbitration. A late probe result could overwrite
 * a choice the user had just made, and a malformed stored value produced a
 * silently blank player.
 *
 * The central invariant, enforced in one place:
 *
 *   A MANUAL USER SELECTION IS NEVER OVERWRITTEN BY AN AUTOMATIC ONE.
 *
 * A second honesty rule drives the phase model: a cross-origin iframe does not
 * expose its internal video state to the parent, so `onLoad` proves only that
 * a document loaded. There is deliberately NO "PLAYING" phase — we cannot
 * observe playback, so we do not claim it.
 */

export type PlayerPhase =
  | "LOADING"
  | "IFRAME_LOADED_PLAYBACK_UNKNOWN"
  | "LOAD_FAILED"
  | "UNAVAILABLE";

/** How the currently selected server came to be selected. */
export type SelectionOrigin = "default" | "auto" | "manual";

export interface PlayerState {
  /** Name of the active server. Always a STORABLE_SERVERS member. */
  server: string;
  selection: SelectionOrigin;
  phase: PlayerPhase;
  /** Increments on every (re)load request; keys the iframe so it remounts. */
  attempt: number;
  /**
   * Set when the iframe loaded but no playback could be observed within the
   * verification window. Renders a NON-BLOCKING notice: the iframe is left
   * mounted, because it may well be playing.
   */
  playbackUnverified: boolean;
}

export type PlayerAction =
  | { type: "SELECT_MANUAL"; server: string }
  | { type: "SELECT_AUTO"; server: string }
  | { type: "IFRAME_LOADED" }
  | { type: "LOAD_TIMEOUT" }
  | { type: "PLAYBACK_UNVERIFIED_TIMEOUT" }
  | { type: "RETRY" }
  | { type: "MARK_UNAVAILABLE" };

export const createInitialPlayerState = (server: string): PlayerState => ({
  server,
  selection: "default",
  phase: "LOADING",
  attempt: 0,
  playbackUnverified: false,
});

export const playerReducer = (state: PlayerState, action: PlayerAction): PlayerState => {
  switch (action.type) {
    case "SELECT_MANUAL": {
      const sameServer = state.server === action.server;
      const alreadyGood =
        sameServer &&
        state.selection === "manual" &&
        state.phase !== "LOAD_FAILED" &&
        state.phase !== "UNAVAILABLE";
      if (alreadyGood) return state;
      return {
        ...state,
        server: action.server,
        selection: "manual",
        phase: "LOADING",
        attempt: state.attempt + 1,
        playbackUnverified: false,
      };
    }

    case "SELECT_AUTO": {
      // The invariant. An automatic selection never displaces a manual one.
      if (state.selection === "manual") return state;
      if (state.server === action.server && state.selection === "auto") return state;
      return {
        ...state,
        server: action.server,
        selection: "auto",
        phase: "LOADING",
        attempt: state.attempt + 1,
        playbackUnverified: false,
      };
    }

    case "IFRAME_LOADED": {
      // Already loaded: re-firing must not churn state (a re-render, or a
      // provider that fires onLoad twice, is not new information).
      if (state.phase === "IFRAME_LOADED_PLAYBACK_UNKNOWN") return state;
      // UNAVAILABLE means no frame exists at all — the source never resolved —
      // so a load event cannot belong to this attempt and must not be allowed to
      // invent a phase for a player that is not mounted.
      if (state.phase === "UNAVAILABLE") return state;

      // ── From LOAD_FAILED, THIS IS A RETRACTION ────────────────────────────
      //
      // LOAD_FAILED is entered by a 20-second timer and by nothing else: it
      // carries no evidence about the network, the provider's health, or
      // anything the user could act on. §15 forbids exactly the verdict it
      // renders — "aucune UI ne doit annoncer 'Lecteur indisponible' simplement
      // parce qu'un provider est lent si celui-ci finit par fonctionner" — and
      // refusing the load event made that verdict permanent: there is no
      // automatic exit from LOAD_FAILED and no re-arm, so a provider that took
      // twenty-one seconds and then loaded normally left the viewer staring at a
      // failure panel over a working player until they pressed Retry.
      //
      // A document that loads late is positive evidence that it DID commit, so
      // the verdict is withdrawn. `playbackUnverified` is cleared with it so the
      // advisory notice does not inherit a decision it never earned: the new
      // phase gets its own full verification window from this moment.
      //
      // The stale-frame hazard the old guard covered is handled where it
      // belongs, and was already: the iframe is re-keyed per attempt, and the
      // `onLoad` handler ignores an event whose `currentTarget` is not the
      // mounted element. So a replaced frame's late load cannot reach this case.
      return {
        ...state,
        phase: "IFRAME_LOADED_PLAYBACK_UNKNOWN",
        playbackUnverified: false,
      };
    }

    case "PLAYBACK_UNVERIFIED_TIMEOUT": {
      if (state.phase !== "IFRAME_LOADED_PLAYBACK_UNKNOWN") return state;
      if (state.playbackUnverified) return state;
      return {...state, playbackUnverified: true};
    }

    case "LOAD_TIMEOUT": {
      // Only meaningful while we are still waiting for the document.
      if (state.phase !== "LOADING") return state;
      return {...state, phase: "LOAD_FAILED"};
    }

    case "RETRY": {
      return {
        ...state,
        phase: "LOADING",
        attempt: state.attempt + 1,
        playbackUnverified: false,
      };
    }

    case "MARK_UNAVAILABLE": {
      // Idempotent: the caller derives "unavailable" from the absence of a
      // resolvable URL, which stays true across renders, so this can be
      // dispatched repeatedly. Returning the same object keeps that from
      // becoming a render loop.
      if (state.phase === "UNAVAILABLE") return state;
      return {...state, phase: "UNAVAILABLE"};
    }

    default:
      return state;
  }
};

export interface StoredProviderResolution {
  server: string;
  /** True when a stored value was present but not a known server. */
  invalid: boolean;
}

/**
 * Validates the persisted provider preference.
 *
 * A stored value that is not in the known list is ignored AND reported as
 * invalid, so the caller can purge it. The audit found the raw stored string
 * being used unchecked, which produced a blank player with no fallback.
 */
export const resolveStoredProvider = (
  stored: string | null | undefined,
  known: readonly string[],
  fallback: string,
): StoredProviderResolution => {
  if (typeof stored !== "string") {
    return {server: fallback, invalid: false};
  }
  // Surrounding whitespace is not a reason to discard a valid preference —
  // but the TRIMMED value must still be a known server, so this cannot be used
  // to smuggle an unknown provider past validation.
  const candidate = stored.trim();
  if (candidate === "") {
    return {server: fallback, invalid: false};
  }
  if (known.includes(candidate)) {
    return {server: candidate, invalid: false};
  }
  return {server: fallback, invalid: true};
};

/** True when the phase should render a hard failure panel with recovery actions. */
export const isHardFailure = (phase: PlayerPhase): boolean =>
  phase === "LOAD_FAILED" || phase === "UNAVAILABLE";
