export interface WatchHistoryItem {
  id: string;
  type: "movie" | "tv";
  title: string;
  poster_path: string;
  season?: number;
  episode?: number;
  provider: string;
  last_watched: number; // Date.now()
  timestamp?: number; // Seconds in video (if available)
  duration?: number; // Total duration (if available)
}

const HISTORY_KEY = "watch_history";

// ─── LOCAL STORAGE (used as fallback for anonymous users) ───

export const getWatchHistory = (): WatchHistoryItem[] => {
  if (typeof window === "undefined") return [];
  const history = localStorage.getItem(HISTORY_KEY);
  return history ? JSON.parse(history) : [];
};

export const saveWatchHistory = (item: WatchHistoryItem) => {
  if (typeof window === "undefined") return;
  
  const history = getWatchHistory();
  const filtered = history.filter((i) => i.id !== item.id);
  const newHistory = [item, ...filtered].slice(0, 20);
  
  localStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory));

  // Sync to server for logged-in users (fire-and-forget)
  syncItemToServer(item);
};

export const removeFromHistory = (id: string) => {
  if (typeof window === "undefined") return;
  const history = getWatchHistory();
  const newHistory = history.filter((i) => i.id !== id);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory));
};

// ─── SERVER SYNC (for logged-in users) ───

const syncItemToServer = async (item: WatchHistoryItem) => {
  try {
    const res = await fetch('/api/watch-time', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        media_type: item.type,
        media_id: item.id,
        minutes: 0, // Progression update only, no time increment
        title: item.title,
        poster_path: item.poster_path,
        // `??` and not `||`: 0 is a real value for all four. Season 0 is TMDB's
        // SPECIALS season, and a position of 0 is the start of the video. `||`
        // turned both into null, and the route's COALESCE then kept the stale
        // value instead of storing what was sent.
        current_time: item.timestamp ?? null,
        total_duration: item.duration ?? null,
        season: item.season ?? null,
        episode: item.episode ?? null,
      }),
    });

    if (!res.ok) {
      // A rejected response does not throw, so without this check the catch below
      // never fires and a 400 or 401 looked exactly like a successful sync.
      console.warn(`[watch-history] sync rejected with ${res.status}; progression not saved`);
    }
  } catch (e) {
    // Non-critical: localStorage is still the local source
  }
};

/**
 * Fetch watch progress from server for logged-in users.
 * Returns server-side history items, mapped to WatchHistoryItem format.
 */
export const getServerWatchHistory = async (): Promise<WatchHistoryItem[]> => {
  try {
    const res = await fetch('/api/watch-time');
    if (!res.ok) return [];
    const data = await res.json();
    
    if (!data.progress || !Array.isArray(data.progress)) return [];
    
    return data.progress.map((item: any) => ({
      id: String(item.media_id),
      type: item.media_type as "movie" | "tv",
      title: item.title || `ID: ${item.media_id}`,
      poster_path: item.poster_path || '',
      // `??` and not `||`, for the same reason as the write path above: a stored
      // season 0 must come back as 0, not as "no season".
      season: item.season ?? undefined,
      episode: item.episode ?? undefined,
      provider: '',
      last_watched: new Date(item.last_updated).getTime(),
      timestamp: item.current_time ?? undefined,
      duration: item.total_duration ?? undefined,
    }));
  } catch (e) {
    return [];
  }
};
