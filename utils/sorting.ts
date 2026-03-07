
/**
 * Smart Scoring & Filtering for MOVEO Catalog
 * Architecture:
 * 1. Brutal Cleaning (Filter out "virus" or low-quality content)
 * 2. Intelligent Scoring (Quality * log10(Popularity))
 * 3. Personalization (User Genre Weighting)
 */

const MIN_VOTE_COUNT = 150;
const MIN_VOTE_AVERAGE = 5.5;
const MIN_RELEASE_YEAR = 1985;
const EXCLUDED_GENRES = [99, 10770]; // Documentary, TV Movie (often lower production value)

export const filterItems = (items: any[]) => {
  if (!items) return [];
  
  return items.filter(item => {
    // 1. Basic Quality Checks
    if (!item.poster_path) return false;
    if (item.vote_count < MIN_VOTE_COUNT) return false;
    if (item.vote_average < MIN_VOTE_AVERAGE) return false;

    // 2. Date Check
    const dateStr = item.release_date || item.first_air_date;
    if (dateStr) {
      const year = new Date(dateStr).getFullYear();
      if (year < MIN_RELEASE_YEAR) return false;
    } else {
      // If no date at all, it's likely incomplete data
      return false;
    }

    // 3. Genre Check (Filter out "virus" sources)
    const genreIds = item.genre_ids || [];
    if (genreIds.some((id: number) => EXCLUDED_GENRES.includes(id))) return false;

    return true;
  });
};

export const calculateScore = (item: any, userGenres: Set<number>) => {
  // 1. Base Quality Score (Intelligent Formula)
  // score = vote_average * log10(vote_count)
  // This balances high ratings with social proof (popularity)
  const baseScore = item.vote_average * Math.log10(item.vote_count || 1);
  
  let finalScore = baseScore;

  // 2. Recency Boost
  const dateStr = item.release_date || item.first_air_date;
  if (dateStr) {
    const releaseDate = new Date(dateStr);
    const now = new Date();
    const diffDays = (now.getTime() - releaseDate.getTime()) / (1000 * 3600 * 24);

    if (diffDays > 0 && diffDays <= 90) finalScore += 5; // New release bonus
    else if (diffDays < 0) finalScore -= 10; // Future release penalty
  }

  // 3. User Preferences (Personalization)
  if (userGenres.size > 0) {
    const genreIds = item.genre_ids || [];
    const matchingGenres = genreIds.filter((id: number) => userGenres.has(id));
    // Each matching genre adds a significant boost to the base score
    finalScore += (matchingGenres.length * 2);
  }

  // 4. Discovery Factor (Subtle Randomness)
  // Adds a tiny bit of shuffle so the grid isn't static
  finalScore += Math.random() * 2;

  return finalScore;
};

export const sortItems = (items: any[], userGenres: Set<number>) => {
  if (!items || items.length === 0) return [];
  
  // First, apply the "Brutal Cleaning" filter
  const cleanedItems = filterItems(items);
  
  // Then, sort by our intelligent score
  return [...cleanedItems].sort((a, b) => {
    const scoreA = calculateScore(a, userGenres);
    const scoreB = calculateScore(b, userGenres);
    return scoreB - scoreA;
  });
};

/**
 * Mixes "Premium" (High Score) and "Discovery" (Lower Score) items
 * to create a "living" catalog experience.
 */
export const mixCatalog = (sortedItems: any[]) => {
  if (sortedItems.length <= 5) return sortedItems;

  const premium = sortedItems.slice(0, Math.floor(sortedItems.length * 0.7));
  const discovery = sortedItems.slice(Math.floor(sortedItems.length * 0.7));

  const mixed: any[] = [];
  let pIdx = 0;
  let dIdx = 0;

  // Pattern: 3 Premium, 1 Discovery
  while (pIdx < premium.length || dIdx < discovery.length) {
    for (let i = 0; i < 3 && pIdx < premium.length; i++) {
      mixed.push(premium[pIdx++]);
    }
    if (dIdx < discovery.length) {
      mixed.push(discovery[dIdx++]);
    }
  }

  return mixed;
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
