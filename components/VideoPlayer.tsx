"use client";

import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  AlertCircle,
  CheckCircle2,
  Database,
  ExternalLink,
  Globe,
  Loader2,
  RefreshCw,
  Server,
  SkipBack,
  SkipForward,
  Zap,
} from "lucide-react";
import Image from "next/image";

import { saveWatchHistory } from "@/utils/historyManager";
import { useLanguage } from "@/context/LanguageContext";
import {
  DEFAULT_PROVIDER_NAME,
  PROVIDERS,
  SBNET_VF_NAME,
  SBNET_VOSTFR_NAME,
  STORABLE_SERVERS,
  buildProviderUrl,
  getMessageOrigins,
  isStorableServer,
} from "@/lib/providers";
import {
  createInitialPlayerState,
  isHardFailure,
  playerReducer,
  resolveStoredProvider,
} from "@/lib/playerState";
import { parsePlaybackProgress } from "@/lib/playerMessages";

interface VideoPlayerProps {
  id: string;
  type: "movie" | "tv";
  season?: number;
  episode?: number;
  title?: string;
  originalTitle?: string;
  year?: string;
  genres?: { id: number; name: string }[];
  posterPath?: string;
  hasNext?: boolean;
  hasPrev?: boolean;
  onNext?: () => void;
  onPrev?: () => void;
}

const PROVIDER_ICONS: Record<string, React.ElementType> = {
  Frembed: Globe,
  SuperEmbed: Server,
  "VidSrc.to": Server,
  "VidSrc.me": Globe,
  "2Embed": Globe,
  SmashyStream: Zap,
  VidLink: Server,
};

/**
 * How long we wait for the iframe document itself before calling it a failure.
 * Generous: several of these providers are slow, and a premature error panel is
 * worse than a spinner.
 */
const IFRAME_LOAD_TIMEOUT_MS = 20000;

/**
 * After the document loaded, how long we wait for evidence of actual playback
 * before showing a NON-BLOCKING notice. The iframe stays mounted while the
 * notice is up: it may well be playing, we simply cannot observe it.
 */
const PLAYBACK_VERIFY_TIMEOUT_MS = 15000;

const WATCH_PROGRESS_THROTTLE_MS = 5000;

/**
 * Upper bound on the Sibnet scrape. Both requests were previously unbounded, and
 * the loading flag they set is the only gate on the "no source at all" branch —
 * so a hanging scrape left the player with no URL, no watchdog (it deliberately
 * skips when there is no URL) and no error panel.
 */
const SBNET_FETCH_TIMEOUT_MS = 8000;

const VideoPlayer: React.FC<VideoPlayerProps> = ({
  id,
  type,
  season,
  episode,
  title,
  originalTitle,
  posterPath,
  year,
  hasNext,
  hasPrev,
  onNext,
  onPrev,
}) => {
  const { t } = useLanguage();

  const [requestStatus, setRequestStatus] = useState<
    "idle" | "loading" | "success" | "already_requested" | "error"
  >("idle");

  const [sibnetVfUrl, setSibnetVfUrl] = useState<string | null>(null);
  const [sibnetVostfrUrl, setSibnetVostfrUrl] = useState<string | null>(null);
  const [isSibnetLoading, setIsSibnetLoading] = useState(false);

  /**
   * Server selection, phase and attempt all live in one reducer, because four
   * writers used to race on them (probe result, stored preference, manual click,
   * watchdog). The reducer is the only place that decides, and it enforces:
   * a manual choice is never overwritten by an automatic one.
   *
   * The initial value is deterministic (DEFAULT_PROVIDER_NAME) so the server and
   * client first render agree; the stored preference is applied in an effect.
   */
  const [player, dispatch] = useReducer(
    playerReducer,
    DEFAULT_PROVIDER_NAME,
    createInitialPlayerState,
  );

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const serverRef = useRef(player.server);
  const lastSaveTime = useRef(0);
  const playbackObservedRef = useRef(false);
  const [playbackObserved, setPlaybackObserved] = useState(false);

  /**
   * The unverified-playback notice is advisory, so it must also be dismissible.
   * No currently selectable provider has a verified message origin, so the
   * notice is expected on every load; without a way to close it, it would stay
   * pinned over the video for the rest of the session, sitting above the
   * provider's own controls.
   */
  const [noticeDismissed, setNoticeDismissed] = useState(false);

  useEffect(() => {
    serverRef.current = player.server;
  }, [player.server]);

  const resetPlaybackObservation = useCallback(() => {
    playbackObservedRef.current = false;
    setPlaybackObserved(false);
    // Dismissing the notice belongs to the attempt it was shown for, so a new
    // attempt (retry, server change, episode change) re-arms it.
    setNoticeDismissed(false);
  }, []);

  // ---------------------------------------------------------------------------
  // 1. Resolve the content source for this title/episode.
  //
  // This never asks a server whether a provider is "healthy". A datacenter fetch
  // of a third-party page is not evidence about a user's browser, and treating it
  // as evidence is what used to strand users on a wrong source. The stored
  // preference (or the default) is rendered immediately and the browser tries it.
  //
  // It also no longer reads /api/catalogue. That lookup existed to find a premium
  // (VOE / Dood) source and to prefer it over every real provider. The tier is
  // gone, and the URLs it returned were measured dead on production (voe.sx
  // answered 404), so the effect was defaulting first-time visitors onto a 404.
  // What remains is a synchronous decision — which is also why there is no longer
  // a "resolving" overlay for playback to wait behind.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    // Reset everything that belongs to the previous title/episode, so nothing
    // leaks across (this includes the Sibnet URLs, which previously survived an
    // episode change and pointed at the previous episode).
    setSibnetVfUrl(null);
    setSibnetVostfrUrl(null);
    setRequestStatus("idle");
    resetPlaybackObservation();
    // The progress throttle is component-lifetime, so without this the first
    // real position of a new title/episode can be swallowed by a save belonging
    // to the previous one.
    lastSaveTime.current = 0;

    // Back to LOADING for the new title/episode. Keeps the user's server, but
    // re-arms the load timeout.
    dispatch({ type: "RETRY" });

    // Validate the stored preference. An unknown value is ignored, removed, and
    // the default is used — the audit found the raw string being trusted, which
    // produced a blank player with no fallback.
    let stored: string | null = null;
    try {
      stored = typeof window !== "undefined" ? window.localStorage.getItem("preferredServer") : null;
    } catch {
      stored = null; // storage can be unavailable (private mode, blocked cookies)
    }
    const hadStored = typeof stored === "string" && stored.trim() !== "";
    const { server: preferred, invalid } = resolveStoredProvider(
      stored,
      STORABLE_SERVERS,
      DEFAULT_PROVIDER_NAME,
    );
    if (invalid && typeof window !== "undefined") {
      try {
        window.localStorage.removeItem("preferredServer");
      } catch {
        /* nothing to do */
      }
    }

    // Deliberately narrow: nothing is dispatched when the user has no stored
    // preference, because there is nothing known to apply and dispatching the
    // default would force the server back on every episode change — the same
    // flash of the wrong provider in the opposite direction. A manual choice
    // therefore survives episode and title navigation.
    if (hadStored) {
      dispatch({ type: "SELECT_AUTO", server: preferred });
    }

  }, [id, type, season, episode, resetPlaybackObservation]);

  // ---------------------------------------------------------------------------
  // 2. Sibnet URLs (a scrape of our own API, not a third-party iframe probe).
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const searchTitle = title || originalTitle;

    // Clear the previous title's URLs as this fetch starts. This previously
    // lived only in effect 1, which does not depend on the title — so a change
    // to title/originalTitle alone left the previous episode's Sibnet source
    // live and selectable while the new one was still in flight.
    setSibnetVfUrl(null);
    setSibnetVostfrUrl(null);

    if (!searchTitle) {
      // Never leave the loading flag armed on an early return. It is the only
      // gate on the "no source at all" branch, and the load watchdog skips when
      // there is no URL, so a stuck flag produced a player box with no spinner,
      // no error and no recovery action.
      setIsSibnetLoading(false);
      return;
    }

    let isMounted = true;
    let settled = false;
    setIsSibnetLoading(true);

    // Bounded, and aborted on cleanup, so a hanging scrape can neither pin the
    // loading flag forever nor settle into an unmounted component.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SBNET_FETCH_TIMEOUT_MS);

    const originalTitleParam =
      originalTitle && originalTitle !== searchTitle
        ? `&originalTitle=${encodeURIComponent(originalTitle)}`
        : "";

    Promise.all([
      fetch(
        `/api/sibnet?title=${encodeURIComponent(searchTitle)}${originalTitleParam}&type=${type}&season=${season || 1}&episode=${episode || 1}&lang=VF`,
        { signal: controller.signal },
      )
        .then((r) => r.json())
        .catch(() => ({ found: false })),
      fetch(
        `/api/sibnet?title=${encodeURIComponent(searchTitle)}${originalTitleParam}&type=${type}&season=${season || 1}&episode=${episode || 1}&lang=VOSTFR`,
        { signal: controller.signal },
      )
        .then((r) => r.json())
        .catch(() => ({ found: false })),
    ])
      .then(([vf, vostfr]) => {
        if (!isMounted) return;
        settled = true;
        if (vf?.found) setSibnetVfUrl(vf.embed_url);
        if (vostfr?.found) setSibnetVostfrUrl(vostfr.embed_url);
        setIsSibnetLoading(false);
      })
      .finally(() => {
        // Settled-but-empty is "resolved", not "still loading": whether the
        // scrape found anything, this attempt is over.
        if (isMounted && !settled) setIsSibnetLoading(false);
        clearTimeout(timeout);
      });

    return () => {
      isMounted = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [id, type, title, originalTitle, season, episode]);

  // ---------------------------------------------------------------------------
  // 3. The resolved iframe URL. Built only from our own provider list.
  // ---------------------------------------------------------------------------
  const videoUrl = useMemo(() => {
    if (player.server === SBNET_VF_NAME) return sibnetVfUrl || "";
    if (player.server === SBNET_VOSTFR_NAME) return sibnetVostfrUrl || "";
    return buildProviderUrl(player.server, { type, id, season, episode }) ?? "";
  }, [player.server, sibnetVfUrl, sibnetVostfrUrl, type, id, season, episode]);

  // ---------------------------------------------------------------------------
  // 4. Timers. Both are armed by the phase and cleaned up by React, so no timer
  //    outlives the state it belongs to.
  // ---------------------------------------------------------------------------

  // Nothing loaded within the window: this is a real, reportable failure.
  useEffect(() => {
    if (player.phase !== "LOADING") return;
    if (!videoUrl) return; // no URL to load; handled as UNAVAILABLE below
    // The clock starts with the frame, which is now mounted on the same render
    // that produces a URL — there is no resolving overlay for it to wait behind.
    const timer = setTimeout(() => dispatch({ type: "LOAD_TIMEOUT" }), IFRAME_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [player.phase, player.attempt, player.server, videoUrl]);

  // The document loaded but nothing observable arrived: advisory only, and the
  // iframe stays mounted.
  useEffect(() => {
    if (player.phase !== "IFRAME_LOADED_PLAYBACK_UNKNOWN") return;
    if (playbackObserved) return;
    const timer = setTimeout(
      () => dispatch({ type: "PLAYBACK_UNVERIFIED_TIMEOUT" }),
      PLAYBACK_VERIFY_TIMEOUT_MS,
    );
    return () => clearTimeout(timer);
  }, [player.phase, player.attempt, player.server, playbackObserved]);

  // There is no source to load at all (Sibnet returned nothing, or the selected
  // server produced no URL). Distinct from a load failure: the iframe never
  // existed.
  useEffect(() => {
    // Idempotence is enforced by the reducer as well, but the guard is stated
    // here so the invariant is visible where the dispatch is made: once
    // UNAVAILABLE, this effect has nothing left to say.
    if (player.phase === "UNAVAILABLE") return;
    if (videoUrl) return;
    if (isSibnetLoading) return;
    dispatch({ type: "MARK_UNAVAILABLE" });
  }, [videoUrl, isSibnetLoading, player.server, player.phase]);

  // 4b. A source became resolvable AFTER we declared UNAVAILABLE: resume.
  //
  // Measured failure this prevents: on an episode change the Sibnet scrape can
  // still be in flight when UNAVAILABLE is declared, and the later arrival of a
  // URL then left the phase terminal while a working URL existed — the dispatch
  // that names the server already selected is a NO-OP (playerState.ts:87). The
  // render branch below tests the phase BEFORE the URL, so the iframe would never
  // be mounted and the user would be told the content was still being encoded.
  //
  // Terminates immediately: RETRY moves the phase off UNAVAILABLE, which is this
  // effect's own guard, so it cannot dispatch twice. It also cannot fight the
  // effect above, which returns early whenever a URL exists.
  useEffect(() => {
    if (player.phase !== "UNAVAILABLE") return;
    if (!videoUrl) return;
    dispatch({ type: "RETRY" });
  }, [player.phase, videoUrl]);

  // ---------------------------------------------------------------------------
  // 5. Watch progress from providers.
  //
  // One listener for the component's lifetime, removed on unmount. Every message
  // is validated (origin allowlist, sender identity, payload shape, finite and
  // consistent numbers) before anything is stored, so a third-party frame cannot
  // write into a user's history. Nothing is stored for a provider that never
  // emits a verifiable position — which is the case for Frembed today, and the
  // UI is honest about that rather than inventing a position.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!title) return;

      const progress = parsePlaybackProgress(event.data, {
        origin: event.origin,
        source: event.source,
        // Captured at event time. The reducer remounts the iframe on server /
        // episode / retry changes, so a stale frame no longer matches.
        expectedSource: iframeRef.current?.contentWindow ?? null,
        allowedOrigins: getMessageOrigins(serverRef.current),
      });

      // Silent rejection: unknown senders get no response of any kind.
      if (!progress) return;

      if (!playbackObservedRef.current) {
        playbackObservedRef.current = true;
        setPlaybackObserved(true);
      }

      const now = Date.now();
      if (now - lastSaveTime.current <= WATCH_PROGRESS_THROTTLE_MS) return;
      lastSaveTime.current = now;

      // saveWatchHistory writes to localStorage unguarded, and this runs inside
      // a window message handler: in a browser with storage blocked, an
      // uncaught throw here would surface as an error in event dispatch. The
      // position is still validated either way — this only covers persistence.
      try {
        saveWatchHistory({
          id,
          type,
          title,
          poster_path: posterPath || "",
          season,
          episode,
          provider: serverRef.current,
          last_watched: now,
          timestamp: progress.currentTime,
          duration: progress.duration,
        });
      } catch (error) {
        console.error("[VideoPlayer] could not persist watch progress", error);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [id, type, title, posterPath, season, episode]);

  // ---------------------------------------------------------------------------
  // 6. User actions.
  // ---------------------------------------------------------------------------

  /** Manual selection. Validated, persisted, and authoritative from now on. */
  const handleServerChange = useCallback(
    (serverName: string) => {
      // Never select or persist a name we cannot resolve to a real source.
      if (!isStorableServer(serverName)) return;
      dispatch({ type: "SELECT_MANUAL", server: serverName });
      setRequestStatus("idle");
      resetPlaybackObservation();
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem("preferredServer", serverName);
        } catch {
          /* storage unavailable; the choice still applies to this session */
        }
      }
    },
    [resetPlaybackObservation],
  );

  const handleRequestFilm = async () => {
    setRequestStatus("loading");
    try {
      const res = await fetch("/api/film-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tmdb_id: id, title, year, type, season, episode }),
      });

      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }

      if (res.ok) {
        const data = await res.json();
        if (data.status === "requested") setRequestStatus("success");
        else if (data.status === "already_requested" || data.status === "already_available") {
          setRequestStatus("already_requested");
        } else setRequestStatus("error");
      } else {
        setRequestStatus("error");
      }
    } catch {
      setRequestStatus("error");
    }
  };

  /** The provider offered when the current one fails. */
  const nextServerName = useMemo(() => {
    const names = PROVIDERS.map((p) => p.name);
    const index = names.indexOf(player.server);
    if (index === -1) return names[0] ?? DEFAULT_PROVIDER_NAME; // Sibnet → first provider
    return names[(index + 1) % names.length];
  }, [player.server]);

  const phaseLabel =
    player.phase === "LOADING"
      ? t.details.searchingServer || "Recherche du meilleur serveur..."
      : player.phase === "IFRAME_LOADED_PLAYBACK_UNKNOWN"
        ? t.details.slowServerDetected || "Serveur lent détecté"
        : "";

  return (
    <div className="w-full max-w-6xl mx-auto mt-8 mb-16 px-4 md:px-0">
      {/* --- MOVEO PLAYER WRAPPER (DARK LUXURY) --- */}
      <div className="relative w-full aspect-video bg-black rounded-2xl overflow-clip shadow-[0_30px_60px_-15px_rgba(0,0,0,0.9)] border border-white/10 ring-1 ring-white/5 mb-6 group">
        {/* Background Poster Blur (Subtle Luxury Effect) */}
        {posterPath && (
          <div className="absolute inset-0 z-0 pointer-events-none opacity-20 mix-blend-luminosity">
            <Image
              src={`https://image.tmdb.org/t/p/original${posterPath}`}
              alt="Background"
              fill
              unoptimized={true}
              className="object-cover blur-[100px] scale-110"
            />
          </div>
        )}

        <AnimatePresence mode="wait">
          {isHardFailure(player.phase) ? (
            player.phase === "UNAVAILABLE" ? (
              <motion.div
                key="source-unavailable"
                role="alert"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/80 backdrop-blur-xl text-white p-6 text-center"
              >
                <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-6">
                  <AlertCircle className="w-6 h-6 text-white/50" />
                </div>
                <h3 className="text-lg font-light tracking-tight text-white mb-2">
                  {t.details.sourceUnavailable || "Source indisponible"}
                </h3>
                <p className="text-sm text-white/40 max-w-md mb-6 leading-relaxed">
                  {t.details.sourceUnavailableDesc ||
                    "Aucun flux n'a pu être résolu pour cette source. Choisis-en une autre ci-dessous."}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <button
                    onClick={() => handleServerChange(nextServerName)}
                    className="px-5 py-2.5 rounded-xl bg-white text-black hover:bg-zinc-200 text-sm font-medium transition-all duration-300"
                  >
                    {t.details.changeServer || "Changer de source"}
                  </button>
                  {/*
                    Relocated from the removed premium panel, where this button
                    was the only way to ask for an encode. That panel was the
                    wrong home for it: it claimed "contenu en cours d'encodage"
                    for any title whose premium URL was missing — an explanation
                    the player itself documented as false — and it only appeared
                    for that one server. Requesting an encode belongs here, where
                    the honest condition is simply "no source resolved".
                    The same request is also offered by the movie page itself.
                  */}
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleRequestFilm}
                    disabled={requestStatus !== "idle"}
                    className={`px-5 py-2.5 rounded-xl flex items-center gap-2 text-sm font-medium transition-all duration-300 ${
                      requestStatus === "success"
                        ? "bg-white/10 text-white border border-white/20"
                        : requestStatus === "already_requested"
                          ? "bg-white/10 text-white/70 border border-white/20"
                          : requestStatus === "error"
                            ? "bg-red-500/10 text-red-400 border border-red-500/20"
                            : "bg-white/5 border border-white/10 text-white/70 hover:text-white hover:bg-white/10"
                    }`}
                  >
                    {requestStatus === "idle" && (
                      <>
                        <Database className="w-4 h-4" />{" "}
                        {t.details.requestEncoding || "Demander l'encodage prioritaire"}
                      </>
                    )}
                    {requestStatus === "loading" && (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />{" "}
                        {t.details.sending || "Envoi en cours..."}
                      </>
                    )}
                    {requestStatus === "success" && (
                      <>
                        <CheckCircle2 className="w-4 h-4" />{" "}
                        {t.details.requestSent || "Demande envoyée avec succès"}
                      </>
                    )}
                    {requestStatus === "already_requested" && (
                      <>
                        <CheckCircle2 className="w-4 h-4" />{" "}
                        {t.details.requestAlready || "Déjà dans la file d'attente"}
                      </>
                    )}
                    {requestStatus === "error" && (
                      <>
                        <AlertCircle className="w-4 h-4" />{" "}
                        {t.details.error || "Une erreur est survenue"}
                      </>
                    )}
                  </motion.button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="load-failed"
                role="alert"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/80 backdrop-blur-xl text-white p-6 text-center"
              >
                <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-6">
                  <AlertCircle className="w-6 h-6 text-white/50" />
                </div>
                <h3 className="text-lg font-light tracking-tight text-white mb-2">
                  {t.details.playerNotResponding || "Le lecteur ne répond pas"}
                </h3>
                <p className="text-sm text-white/40 max-w-md mb-6 leading-relaxed">
                  {t.details.playerNotRespondingDesc ||
                    "Le lecteur n'a pas pu être chargé. Réessaie, ou choisis une autre source."}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <button
                    onClick={() => {
                      resetPlaybackObservation();
                      dispatch({ type: "RETRY" });
                    }}
                    className="px-5 py-2.5 rounded-xl bg-white text-black hover:bg-zinc-200 text-sm font-medium transition-all duration-300 flex items-center gap-2"
                  >
                    <RefreshCw className="w-4 h-4" />
                    {t.details.retry || "Réessayer"}
                  </button>
                  <button
                    onClick={() => handleServerChange(nextServerName)}
                    className="px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/70 hover:text-white hover:bg-white/10 text-sm font-medium transition-all duration-300"
                  >
                    {t.details.changeServer || "Changer de source"}
                  </button>
                  {videoUrl && (
                    <a
                      href={videoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/70 hover:text-white hover:bg-white/10 text-sm font-medium transition-all duration-300 flex items-center gap-2"
                    >
                      {t.details.openInNewTab || "Ouvrir dans un nouvel onglet"}
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </motion.div>
            )
          ) : videoUrl ? (
            <motion.div
              key="player"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6 }}
              className="w-full h-full relative z-10"
            >
              {/*
                The iframe is mounted as soon as a URL exists, so onLoad can fire.
                LOADING is shown as an overlay on top of it rather than instead of
                it — replacing it would mean it never loads at all.

                `allow` is unchanged from the previous implementation and no
                sandbox is applied. The provider's own page requests
                `encrypted-media`; we do NOT delegate it, because the reachable
                player page contains no EME/Widevine/PlayReady usage and no
                MediaSource — so it is not verified as necessary. Delegating a
                permission we have not shown to be needed would widen what the
                frame may do for no reason.

                Note there is no `onLoad`-implies-playing here: a successful
                document load only tells us the frame loaded, never that video is
                playing, and the phase model says exactly that.
              */}
              {player.phase === "LOADING" && (
                <div
                  role="status"
                  aria-live="polite"
                  className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black"
                >
                  <Loader2 className="w-6 h-6 text-white/30 animate-spin mb-4" />
                  <span className="text-[11px] uppercase tracking-widest text-white/30">
                    {phaseLabel}
                  </span>
                </div>
              )}

              {/*
                Advisory only, and deliberately not blocking: the document loaded,
                we simply cannot observe playback inside a cross-origin frame. The
                iframe stays mounted underneath.
              */}
              {player.playbackUnverified && !playbackObserved && !noticeDismissed && (
                <div
                  role="status"
                  aria-live="polite"
                  className="absolute top-3 left-1/2 -translate-x-1/2 z-30 max-w-[92%] flex items-center gap-3 px-4 py-2.5 rounded-xl bg-black/80 backdrop-blur-md border border-white/10 text-white"
                >
                  <AlertCircle className="w-4 h-4 text-white/50 shrink-0" />
                  <div className="text-left">
                    <p className="text-xs font-medium">
                      {t.details.playbackUnverified || "Lecture non confirmée"}
                    </p>
                    <p className="text-[11px] text-white/40">
                      {t.details.playbackUnverifiedDesc ||
                        "Si l'image reste noire, choisis une autre source."}
                    </p>
                  </div>
                  {/*
                    Both recovery actions are offered here, not just "change
                    source". Measured reason: a frame whose request fails at the
                    network level still fires onLoad (it commits an error page),
                    so this unverified state — not the LOAD_FAILED panel — is
                    what a user actually sees when a provider is unreachable.
                    Without Retry here, that user would have no way to re-attempt
                    the same source.
                  */}
                  <div className="shrink-0 flex items-center gap-1.5">
                    <button
                      onClick={() => {
                        resetPlaybackObservation();
                        dispatch({ type: "RETRY" });
                      }}
                      className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-medium transition-all flex items-center gap-1.5"
                    >
                      <RefreshCw className="w-3 h-3" />
                      {t.details.retry || "Réessayer"}
                    </button>
                    <button
                      onClick={() => handleServerChange(nextServerName)}
                      className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-medium transition-all"
                    >
                      {t.details.changeServer || "Changer de source"}
                    </button>
                    {/*
                      Dismissible because the notice is expected on every load:
                      no currently selectable provider has a verified message
                      origin, so playback can never be "observed" here and the
                      notice would otherwise sit over the video indefinitely.
                    */}
                    <button
                      onClick={() => setNoticeDismissed(true)}
                      aria-label="Fermer le message"
                      className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-medium transition-all"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )}

              <iframe
                ref={iframeRef}
                key={`${player.server}-${videoUrl}-${player.attempt}`}
                src={videoUrl}
                className="w-full h-full relative z-20"
                allowFullScreen
                allow="autoplay; fullscreen *; picture-in-picture *"
                title={`Lecteur vidéo — ${title || "Moveo"}`}
                onLoad={(event) => {
                  // Ignore a load from a frame we have already replaced: a retry
                  // re-keys this element, and accepting the old frame's load
                  // would mark the NEW attempt as loaded and suppress its
                  // watchdog.
                  if (event.currentTarget !== iframeRef.current) return;
                  dispatch({ type: "IFRAME_LOADED" });
                }}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {/* --- NAVIGATION DES ÉPISODES (Séries Uniquement) --- */}
      {type === "tv" && (
        <div className="flex items-center justify-between w-full mb-8 bg-black px-3 py-2.5 rounded-xl border border-white/5 shadow-inner">
          <motion.button
            whileHover={hasPrev ? { scale: 1.02, backgroundColor: "rgba(255,255,255,0.05)" } : {}}
            whileTap={hasPrev ? { scale: 0.98 } : {}}
            onClick={hasPrev ? onPrev : undefined}
            disabled={!hasPrev}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${
              hasPrev ? "text-white cursor-pointer" : "text-white/20 cursor-not-allowed"
            }`}
          >
            <SkipBack className="w-4 h-4" />
            <span className="hidden sm:inline">{t.details.prevEpisode || "Épisode Précédent"}</span>
          </motion.button>

          <div className="text-xs sm:text-sm font-semibold text-white/40 tracking-widest uppercase">
            {t.details.season || "Saison"} {season} <span className="mx-2 text-white/20">•</span>{" "}
            {t.details.episode || "Épisode"} {episode}
          </div>

          <motion.button
            whileHover={hasNext ? { scale: 1.02, backgroundColor: "rgba(255,255,255,0.05)" } : {}}
            whileTap={hasNext ? { scale: 0.98 } : {}}
            onClick={hasNext ? onNext : undefined}
            disabled={!hasNext}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${
              hasNext ? "text-white cursor-pointer" : "text-white/20 cursor-not-allowed"
            }`}
          >
            <span className="hidden sm:inline">{t.details.nextEpisode || "Épisode Suivant"}</span>
            <SkipForward className="w-4 h-4" />
          </motion.button>
        </div>
      )}

      {/* --- CONTRÔLES (DARK LUXURY) --- */}
      <div className="w-full flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-white/30 uppercase tracking-widest ml-1">
            Sources Alternatives
          </h3>
          {videoUrl && (
            <a
              href={videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-white/5 text-xs font-medium text-white/40 hover:text-white/80 transition-all group"
            >
              <span>{t.details.openInNewTab || "Ouvrir"}</span>
              <ExternalLink className="w-3 h-3 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </a>
          )}
        </div>

        <div className="bg-black border border-white/5 rounded-xl p-2 flex flex-wrap gap-2">
          {sibnetVfUrl || isSibnetLoading ? (
            <button
              onClick={() => sibnetVfUrl && handleServerChange(SBNET_VF_NAME)}
              disabled={!sibnetVfUrl}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-medium transition-all duration-300 ${
                  player.server === SBNET_VF_NAME
                    ? "bg-white/10 text-white shadow-sm ring-1 ring-white/10"
                    : "bg-transparent text-white/40 hover:bg-white/5 hover:text-white/70"
                } ${!sibnetVfUrl ? "opacity-50 cursor-wait" : ""}`}
            >
              {isSibnetLoading && !sibnetVfUrl ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-white/30" />
              ) : (
                <Globe
                  className={`w-3.5 h-3.5 ${
                      player.server === SBNET_VF_NAME ? "text-white" : "text-white/30"
                    }`}
                />
              )}
              Sibnet VF
            </button>
          ) : (
            <button
              disabled
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-medium bg-transparent text-white/20 opacity-30 cursor-not-allowed"
            >
              <Globe className="w-3.5 h-3.5 text-white/20" />
              Sibnet VF (Indisponible)
            </button>
          )}

          {sibnetVostfrUrl || isSibnetLoading ? (
            <button
              onClick={() => sibnetVostfrUrl && handleServerChange(SBNET_VOSTFR_NAME)}
              disabled={!sibnetVostfrUrl}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-medium transition-all duration-300 ${
                  player.server === SBNET_VOSTFR_NAME
                    ? "bg-white/10 text-white shadow-sm ring-1 ring-white/10"
                    : "bg-transparent text-white/40 hover:bg-white/5 hover:text-white/70"
                } ${!sibnetVostfrUrl ? "opacity-50 cursor-wait" : ""}`}
            >
              {isSibnetLoading && !sibnetVostfrUrl ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-white/30" />
              ) : (
                <Globe
                  className={`w-3.5 h-3.5 ${
                      player.server === SBNET_VOSTFR_NAME ? "text-white" : "text-white/30"
                    }`}
                />
              )}
              Sibnet VOSTFR
            </button>
          ) : (
            <button
              disabled
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-medium bg-transparent text-white/20 opacity-30 cursor-not-allowed"
            >
              <Globe className="w-3.5 h-3.5 text-white/20" />
              Sibnet VOSTFR (Indisponible)
            </button>
          )}

          {PROVIDERS.map((provider) => {
            const isActive = player.server === provider.name;
            const Icon = PROVIDER_ICONS[provider.name] ?? Server;
            return (
              <button
                key={provider.name}
                onClick={() => handleServerChange(provider.name)}
                title={provider.warningKey ? t.details.disableAdblock : undefined}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-medium transition-all duration-300 ${
                    isActive
                      ? "bg-white/10 text-white shadow-sm ring-1 ring-white/10"
                      : "bg-transparent text-white/40 hover:bg-white/5 hover:text-white/70"
                  }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? "text-white" : "text-white/30"}`} />
                {provider.name}
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-white/20 px-2 mt-2 uppercase tracking-wider">
          Les sources alternatives proviennent de serveurs tiers publics.
        </p>
      </div>
    </div>
  );
};

export default VideoPlayer;
