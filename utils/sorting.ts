
export const calculateScore = (item: any, userGenres: Set<number>) => {
  let score = 0;

  // 1. Recency & Availability
  const releaseDateStr = item.release_date || item.first_air_date;
  if (releaseDateStr) {
    const releaseDate = new Date(releaseDateStr);
    const now = new Date();
    const diffTime = now.getTime() - releaseDate.getTime();
    const diffDays = diffTime / (1000 * 3600 * 24);

    // Boost very recent releases (last 3 months)
    if (diffDays > 0 && diffDays <= 90) score += 15;
    // Boost recent releases (last year)
    else if (diffDays > 90 && diffDays <= 365) score += 10;
    // Penalize future releases (not yet watchable)
    else if (diffDays < 0) score -= 5;
  }

  // 2. Rating (Quality Focus)
  if (item.vote_average >= 8.0) score += 15;      // Excellent
  else if (item.vote_average >= 7.0) score += 10; // Good
  else if (item.vote_average < 5.0) score -= 10;  // Bad

  // 3. Popularity (Social Proof)
  // Only penalize very unknown content (< 100 votes)
  if (item.vote_count < 100) score -= 20; 
  // Bonus for established hits
  else if (item.vote_count > 5000) score += 5;

  // 4. User Preferences (Personalization)
  if (userGenres.size > 0) {
    const genreIds = item.genre_ids || [];
    // +10 points PER matching genre to heavily weight personal taste
    const matchingGenres = genreIds.filter((id: number) => userGenres.has(id));
    score += (matchingGenres.length * 10);
  }

  // 5. Discovery Factor (Randomness)
  // Add a random value between 0-15 to shuffle items with similar scores
  // This ensures the list feels "fresh" on every reload
  score += Math.random() * 15;

  return score;
};

export const sortItems = (items: any[], userGenres: Set<number>) => {
  if (!items || items.length === 0) return [];
  return [...items].sort((a, b) => {
    const scoreA = calculateScore(a, userGenres);
    const scoreB = calculateScore(b, userGenres);
    return scoreB - scoreA;
  });
};

export const fetchUserGenres = async (): Promise<Set<number>> => {
  let userGenres = new Set<number>();
  try {
    const userListRes = await fetch('/api/user/list');
    if (userListRes.ok) {
      const data = await userListRes.json();
      const userList = data.list || [];
      const watchedOrFavIds = new Set(userList.map((i: any) => i.media_id.toString()));

      // We need to fetch details for these items to get their genres if we don't have them
      // But usually the list endpoint might not return genres. 
      // However, in the previous implementation in page.tsx, we were scanning the *fetched* items 
      // to find genres of items that are ALSO in the user's list.
      // This logic is slightly flawed if the user's list items are NOT in the current fetched batch.
      // A better approach for a global utility is to rely on what we can get.
      // For now, let's replicate the logic: we need the items to scan against.
      
      // Actually, the previous logic in page.tsx was:
      // 1. Fetch user list (ids)
      // 2. Scan *allItems* (the ones we just fetched from TMDB)
      // 3. If an item from *allItems* is in user list, add its genres to userGenres.
      
      // This means we can't fully determine userGenres just from this function without the items.
      // But we can return the set of watched/fav IDs, and then let the caller do the matching?
      // Or we can fetch the user list, and maybe if the user list endpoint returns genres (it might not), we use them.
      
      // Looking at /api/user/list/route.ts, it returns `user_list` table rows.
      // The table has `media_type`, `media_id`, `list_type`, `title`, `poster_path`.
      // It DOES NOT have genres.
      
      // So the previous logic was clever: it used the *current page's* data to infer preferences.
      // "If I've watched this movie that is currently on screen, I probably like its genres."
      // This is a bit weak if the user has watched movies that are NOT on the current screen.
      
      // IMPROVEMENT: We can't easily fetch genres for all user items without spamming TMDB API.
      // So we will stick to the "inference from current data" strategy, or just accept that 
      // we only know genres of items we have loaded.
      
      // Let's return the raw list data so the caller can use it.
      return new Set(); // Placeholder, actual logic needs items.
    }
  } catch (e) {
    // Ignore
  }
  return userGenres;
};

export const getUserWatchedIds = async (): Promise<Set<string>> => {
    try {
        const userListRes = await fetch('/api/user/list');
        if (userListRes.ok) {
            const data = await userListRes.json();
            const userList = data.list || [];
            return new Set(userList.map((i: any) => i.media_id.toString()));
        }
    } catch (e) {
        // ignore
    }
    return new Set();
}

export const extractUserGenresFromItems = (items: any[], watchedIds: Set<string>): Set<number> => {
    const userGenres = new Set<number>();
    items.forEach(item => {
        if (watchedIds.has(item.id.toString())) {
            item.genre_ids?.forEach((id: number) => userGenres.add(id));
        }
    });
    return userGenres;
}
