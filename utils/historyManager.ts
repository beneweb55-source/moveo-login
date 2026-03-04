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

export const getWatchHistory = (): WatchHistoryItem[] => {
  if (typeof window === "undefined") return [];
  const history = localStorage.getItem(HISTORY_KEY);
  return history ? JSON.parse(history) : [];
};

export const saveWatchHistory = (item: WatchHistoryItem) => {
  if (typeof window === "undefined") return;
  
  const history = getWatchHistory();
  // Remove existing item with same ID to update it and move to top
  const filtered = history.filter((i) => i.id !== item.id);
  
  // Add new item at the beginning
  const newHistory = [item, ...filtered].slice(0, 20); // Keep last 20 items
  
  localStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory));
};

export const removeFromHistory = (id: string) => {
  if (typeof window === "undefined") return;
  const history = getWatchHistory();
  const newHistory = history.filter((i) => i.id !== id);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory));
};
