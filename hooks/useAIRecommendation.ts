'use client';

import { useState, useCallback } from 'react';

/**
 * Client for the recommendations section.
 *
 * WHAT CHANGED AND WHY
 *
 * This hook used to run the scoring itself, in the browser:
 *
 *   const ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY! });
 *
 * A `NEXT_PUBLIC_` variable is inlined into the client bundle by Next.js, so
 * importing this hook was all it would have taken to publish the Gemini API key
 * to every visitor of the site — the key would have been readable in the
 * JavaScript, scraped, and spent. Nothing imports the hook today, so webpack
 * drops it and nothing was published: measured against production on 2026-09-22,
 * no chunk served by www.moveo.blog contains a Google key prefix or even that
 * variable's name. The trap was armed rather than fired.
 *
 * The scoring now happens in `app/api/ai-recommend`, on the server, where the
 * key belongs, and this hook is a thin client of it. The shape it returns is
 * unchanged, so whatever wires this up later needs no adjustment — and, more to
 * the point, wiring it up can no longer leak a credential.
 *
 * It also stops logging the history. `console.log('...history:', history)` put a
 * viewer's viewing history into the browser console and the server log for no
 * operational reason (§7).
 *
 * It is deliberately NOT wired into any page yet. The scoring path cannot be
 * exercised from here (no Gemini key is configured in this checkout), and §26 is
 * explicit: a function whose reliability has not been demonstrated does not get
 * activated. Making it safe to activate was the point of this change; activating
 * it is a separate, testable step.
 */
export const useAIRecommendation = () => {
  const [loading, setLoading] = useState(false);
  const [recommendations, setRecommendations] = useState<any[]>([]);

  const getRecommendations = useCallback(async (history: any[]) => {
    // Guarded here as well as on the server: an obviously-too-short history does
    // not need a round trip to be answered, and the server makes the same
    // decision for callers that are not this hook.
    if (!Array.isArray(history) || history.length < 3) {
      return { show: false };
    }

    setLoading(true);
    try {
      const response = await fetch('/api/ai-recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history }),
      });

      // A refusal or a failure answers with the same shape the section already
      // understands, so there is no separate error path to render here. The
      // `catch` below covers the transport case.
      const data = await response.json().catch(() => ({ show: false }));

      if (!data?.show || !Array.isArray(data.films)) {
        return { show: false };
      }

      setRecommendations(data.films);
      return { show: true, titreSection: data.titreSection, films: data.films };
    } catch (error) {
      console.error('AI Recommendation error:', error);
      return { show: false };
    } finally {
      setLoading(false);
    }
  }, []);

  return { getRecommendations, loading, recommendations };
};
