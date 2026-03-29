export function filterContent(results: any[]): any[] {
  if (!results || !Array.isArray(results)) return results;

  return results.filter((item: any) => {
    // 1. Remove pornographic content
    if (item.adult === true) return false;

    // 2. Remove old films that nobody watches
    let releaseDate = item.release_date || item.first_air_date;
    if (releaseDate) {
      const releaseYear = new Date(releaseDate).getFullYear();
      const voteCount = item.vote_count || 0;
      const voteAverage = item.vote_average || 0;

      // If it has < 2 votes and it's been released for more than 30 days, it's likely nobody watches it
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      if (new Date(releaseDate) < thirtyDaysAgo && voteCount < 2) {
        return false;
      }

      // If it's older than 2020 and has less than 10 votes, filter it out
      if (releaseYear < 2020 && voteCount < 10) {
        return false;
      }

      // If it's older than 2010 and has less than 50 votes, filter it out
      if (releaseYear < 2010 && voteCount < 50) {
        return false;
      }
      
      // If it's older than 2000 and has less than 200 votes, filter it out
      if (releaseYear < 2000 && voteCount < 200) {
        return false;
      }

      // If it's older than 1990 and has less than 500 votes, filter it out
      if (releaseYear < 1990 && voteCount < 500) {
        return false;
      }

      // If it's older than 1980 and has less than 1000 votes, filter it out
      if (releaseYear < 1980 && voteCount < 1000) {
        return false;
      }
    }

    return true;
  });
}
