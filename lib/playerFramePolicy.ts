/**
 * WHAT A PROVIDER'S FRAME IS ALLOWED TO DO INSIDE A MOVEO PAGE.
 *
 * One decision, in one place, because it is one decision: every provider Moveo
 * frames is a third-party document we do not control, and the measurements
 * recorded in docs/player-validation-2026-09-21.md §4.2 and docs/provider-matrix.md
 * say what that means in practice — the frame opens windows of its own, and the
 * window it opens is an advertisement (a fake Opera download page, an
 * adult-dating tab), not a player.
 *
 * THE ONLY LEVER WE HAVE OVER A FRAME'S OWN BEHAVIOUR IS `sandbox`. `allow`
 * (Permissions Policy) has no directive for "may not open a window"; `frame-src`
 * decides which origins may be framed AT ALL, not what a framed document may then
 * do with itself. Until now no sandbox was set, which is the widest possible
 * reading of the attribute: a cross-origin, ad-monetised document with exactly the
 * escape hatches of a top-level page. That is what this module narrows.
 *
 * ─── THE LINE THE POLICY DRAWS ───────────────────────────────────────────────
 *
 *   The frame KEEPS every capability that acts inside its own box.
 *   It LOSES every capability that lets it act outside that box.
 *
 * Playback is inside the box, which is why nothing that plays was traded away. A
 * provider that plays its video in its own document needs scripts, its own origin,
 * forms, presentation, pointer lock and orientation lock — all kept, and each for
 * a reason stated below rather than by default.
 *
 * ─── WHY `allow-same-origin` IS NOT NEGOTIABLE HERE ──────────────────────────
 *
 * Dropping it would make the frame opaque-origin, and that would silently break a
 * path Moveo depends on: `lib/providers.ts` gates every accepted position message
 * on `messageOrigins`, and an opaque frame posts with `event.origin === "null"`.
 * The provider's real, measured position stream (the VidLink `MEDIA_DATA`
 * snapshots) would be dropped by our own allowlist, and the resume/history paths
 * would stop receiving anything — with no error anywhere. Storage and cookies
 * would go with it. So it stays.
 *
 * The usual objection to `allow-scripts allow-same-origin` together — the frame
 * can reach into its parent and remove its own sandbox attribute — applies to a
 * frame that is SAME-ORIGIN with the page embedding it. Every frame here is
 * cross-origin, so the frame cannot touch our document, and the sandbox attribute
 * can only be removed by us.
 *
 * ─── WHAT IS DELIBERATELY NOT CLAIMED ────────────────────────────────────────
 *
 * This does not remove advertising from a provider's page, does not stop its ad
 * scripts from loading, and does not make any provider "sans pub". What it removes
 * is one specific capability: acting on anything outside the frame. A frame that
 * is denied a popup can still try, and still fails silently — which is the intended
 * outcome, and not a claim that the attempt never happened.
 */

/**
 * The sandbox tokens the player frame is granted.
 *
 * `allow-scripts` — without it the frame's own player never runs. This is the
 *   token that makes every other line here meaningful.
 * `allow-same-origin` — see the header: the provider's position messages are only
 *   accepted when they arrive from its real origin.
 * `allow-forms` — a provider's own "choose a server" list is a form in several of
 *   these players; withholding it removes a control without removing an ad.
 * `allow-presentation` — casting from the provider's own player. A capability
 *   inside the box.
 * `allow-pointer-lock` — used by 360°/mouse-driven players. Inside the box.
 * `allow-orientation-lock` — mobile fullscreen orientation. Inside the box, and a
 *   player control we would otherwise break on a phone.
 *
 * The ORDER is the order of the HTML attribute, and it is asserted as a set by
 * tests/playerFramePolicy.test.ts, not as a string.
 */
export const PLAYER_SANDBOX_TOKENS: readonly string[] = [
  "allow-scripts",
  "allow-same-origin",
  "allow-forms",
  "allow-presentation",
  "allow-pointer-lock",
  "allow-orientation-lock",
];

/**
 * The sandbox attribute for the player iframe.
 *
 * `sandbox` is DEFAULT-DENY: every capability not named above is withheld, and the
 * list in `PLAYER_SANDBOX_WITHHELD` below is the subset we withhold ON PURPOSE and
 * can give a measurement for — not the whole of what is blocked. A token added to
 * the list above is a capability handed back, so the list is exhaustive and the
 * test below enumerates it.
 */
export const PLAYER_IFRAME_SANDBOX = PLAYER_SANDBOX_TOKENS.join(" ");

/**
 * The `allow` attribute for the player iframe — the Permissions Policy delegation,
 * which is a different mechanism from `sandbox` and answers a different question:
 * not "what may this document do", but "which powerful features may it use".
 *
 * Unchanged from the inline value it replaces, and deliberately narrow:
 *
 *   autoplay            — providers that autoplay need it; those that do not
 *                         (VidLink, measured) are unaffected by its presence.
 *   fullscreen          — the player's own fullscreen control.
 *   picture-in-picture  — the same, for PiP.
 *
 * `encrypted-media` is NOT delegated, and that is not an oversight: the reachable
 * player pages were inspected and contain no EME/Widevine/PlayReady usage, so
 * delegating it would widen the frame's power for a capability never exercised.
 */
export const PLAYER_IFRAME_ALLOW = "autoplay; fullscreen *; picture-in-picture *";

export interface WithheldSandboxToken {
  readonly token: string;
  /** Why it is withheld, and what was measured to decide that. */
  readonly reason: string;
}

/**
 * The escape hatches, each with the observation that justifies withholding it.
 *
 * These are not withheld because a sandbox should be tight in the abstract. Each
 * one is either a measured advertising path, or the mechanism that would hand back
 * one of the others. `reason` is part of the data rather than a comment so the test
 * can print it if the token is ever granted back.
 */
export const PLAYER_SANDBOX_WITHHELD: readonly WithheldSandboxToken[] = [
  {
    token: "allow-popups",
    reason:
      "Measured, and attributed: the frame opened a window whose `creative=24147990` " +
      "is the same value as its own in-frame ad request `i.php?t=1&c=24147990`, in a " +
      "session where that provider was the only one mounted " +
      "(docs/player-validation-2026-09-21.md §4.2); a second provider opened three " +
      "popup tabs in a real Moveo journey (docs/player-strategy.md). No confirmed " +
      "playback path is lost with it: the two providers whose playback was confirmed " +
      "INSIDE the frame — one with zero popups across two user-activation clicks, the " +
      "other with interleaved DASH video and audio segments in the same session the " +
      "popup fired — do not play through a popup.",
  },
  {
    token: "allow-popups-to-escape-sandbox",
    reason:
      "It exists to undo the line above: a window opened under it inherits no sandbox " +
      "flags at all, so granting it would reopen the measured path while making the " +
      "sandbox attribute look applied.",
  },
  {
    token: "allow-top-navigation",
    reason:
      "A provider frame must never navigate Moveo's own page away. That is the " +
      "redirect class the product brief names, and its cost is the page the viewer " +
      "was on. No provider plays by navigating its parent.",
  },
  {
    token: "allow-top-navigation-by-user-activation",
    reason:
      "The same act behind a narrower trigger: a click inside a third-party document " +
      "would replace our page with the provider's. Withheld; a viewer who wants the " +
      "provider's own page still has an address bar.",
  },
  {
    token: "allow-modals",
    reason:
      "alert/confirm/prompt draw browser UI over Moveo and block the frame's thread. " +
      "No measured provider needs one to play; several ad scripts use them.",
  },
  {
    token: "allow-downloads",
    reason:
      "A download leaves the box and writes to the viewer's disk. That is a " +
      "monetisation path, not a playback path.",
  },
];
