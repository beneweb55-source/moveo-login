
/**
 * Smart Scoring & Filtering for MOVEO Catalog
 * Architecture:
 * 1. Brutal Cleaning (Filter out "virus" or low-quality content)
 * 2. Intelligent Scoring (Quality * log10(Popularity))
 * 3. Personalization (User Genre Weighting)
 */

const MIN_VOTE_COUNT = 50; // Lowered from 150
const MIN_VOTE_AVERAGE = 4.0; // Lowered from 5.5
const MIN_RELEASE_YEAR = 1950; // Lowered from 1985
const EXCLUDED_GENRES = [99]; // Removed TV Movie (10770) from excluded genres

export const filterItems = (items: any[], options?: { minVoteCount?: number, minVoteAverage?: number, excludeGenres?: boolean, minReleaseYear?: number }) => {
  if (!items) return [];
  
  const minVoteCount = options?.minVoteCount ?? MIN_VOTE_COUNT;
  const minVoteAverage = options?.minVoteAverage ?? MIN_VOTE_AVERAGE;
  const shouldExcludeGenres = options?.excludeGenres ?? true;
  const minReleaseYear = options?.minReleaseYear ?? MIN_RELEASE_YEAR;

  return items.filter(item => {
    // 1. Basic Quality Checks
    if (!item.poster_path) return false;
    
    // For very new movies (released in the last 30 days), we are more lenient with vote count
    const dateStr = item.release_date || item.first_air_date;
    let isNewRelease = false;
    if (dateStr) {
      const releaseDate = new Date(dateStr);
      const now = new Date();
      const diffDays = (now.getTime() - releaseDate.getTime()) / (1000 * 3600 * 24);
      if (diffDays >= 0 && diffDays <= 30) isNewRelease = true;
    }

    if (!isNewRelease && item.vote_count < minVoteCount) return false;
    if (item.vote_average < minVoteAverage) return false;

    // 2. Date Check
    if (dateStr) {
      const releaseDate = new Date(dateStr);
      const now = new Date();
      
      // Handle invalid dates
      if (isNaN(releaseDate.getTime())) return false;

      // Exclude future releases (strict check)
      if (releaseDate.getTime() > now.getTime()) return false;

      const year = releaseDate.getFullYear();
      if (year < minReleaseYear) return false;
    } else {
      // If no date at all, it's likely incomplete data
      return false;
    }

    // 3. Genre Check (Filter out "virus" sources)
    if (shouldExcludeGenres) {
      const genreIds = item.genre_ids || [];
      if (genreIds.some((id: number) => EXCLUDED_GENRES.includes(id))) return false;
    }

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

export const sortItems = (items: any[], userGenres: Set<number>, options?: { minVoteCount?: number, minVoteAverage?: number, excludeGenres?: boolean, sortBy?: string, minReleaseYear?: number }) => {
  if (!items || items.length === 0) return [];
  
  const sortBy = options?.sortBy || "popularity.desc";

  // If we are sorting by something else than popularity, we should be less strict with filters
  // especially for release date where new items have 0 votes.
  const filterOptions = { ...options };
  if (sortBy.includes("release_date") || sortBy.includes("first_air_date")) {
    filterOptions.minVoteCount = options?.minVoteCount ?? 0;
    filterOptions.minVoteAverage = options?.minVoteAverage ?? 0;
    filterOptions.minReleaseYear = 0;
  }

  // First, apply the "Brutal Cleaning" filter
  const cleanedItems = filterItems(items, filterOptions);
  
  const sortedItems = [...cleanedItems].sort((a, b) => {
    if (sortBy === "popularity.desc") {
      const scoreA = calculateScore(a, userGenres);
      const scoreB = calculateScore(b, userGenres);
      return scoreB - scoreA;
    }
    
    if (sortBy.includes("vote_average")) {
      return (b.vote_average || 0) - (a.vote_average || 0);
    }
    
    if (sortBy.includes("release_date") || sortBy.includes("first_air_date")) {
      const dateA = new Date(a.release_date || a.first_air_date || 0).getTime();
      const dateB = new Date(b.release_date || b.first_air_date || 0).getTime();
      
      // Handle invalid dates in sort
      const timeA = isNaN(dateA) ? 0 : dateA;
      const timeB = isNaN(dateB) ? 0 : dateB;
      
      return timeB - timeA;
    }
    
    return 0;
  });

  return sortedItems;
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
