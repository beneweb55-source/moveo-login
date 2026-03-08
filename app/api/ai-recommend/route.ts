import { NextResponse } from 'next/server';
import { fetchDataFromApi } from '@/utils/api';

export async function POST(req: Request) {
  try {
    const { history } = await req.json();
    console.log('API /api/ai-recommend received history:', history);

    if (!history || history.length < 3) {
      console.log('API /api/ai-recommend: history too short, returning show: false');
      return NextResponse.json({ show: false });
    }

    // 1. Extract frequent genre IDs
    const genreCounts: Record<number, number> = {};
    history.forEach((item: any) => {
      item.genre_ids?.forEach((id: number) => {
        genreCounts[id] = (genreCounts[id] || 0) + 1;
      });
    });

    const sortedGenres = Object.entries(genreCounts)
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .slice(0, 3)
      .map(([id]) => id);

    // 2. Fetch candidates from TMDB
    const candidates = await fetchDataFromApi('/discover/movie', {
      with_genres: sortedGenres.join(','),
      sort_by: 'popularity.desc',
      language: 'fr-FR',
    });

    const historyIds = new Set(history.map((item: any) => item.id));
    const filteredCandidates = (candidates?.results || [])
      .filter((item: any) => !historyIds.has(item.id))
      .slice(0, 20);

    return NextResponse.json({ candidates: filteredCandidates, count: history.length });
  } catch (error) {
    console.error('Error fetching candidates:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
