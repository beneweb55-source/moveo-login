import { NextRequest, NextResponse } from "next/server";

const CONSUMET_URL = process.env.CONSUMET_API_URL || "https://api.consumet.org";

export async function POST(req: NextRequest) {
  try {
    const { tmdbId, type, season, episode } = await req.json();

    if (!tmdbId || !type) {
      return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
    }

    // 1. Get Media Info & Episode ID from Consumet (using TMDB Meta provider)
    // We use the 'meta/tmdb' endpoint because it maps TMDB IDs to playable sources.
    const infoUrl = `${CONSUMET_URL}/meta/tmdb/${tmdbId}`;
    const infoRes = await fetch(infoUrl);
    
    if (!infoRes.ok) {
      throw new Error(`Consumet API Error: ${infoRes.statusText}`);
    }

    const infoData = await infoRes.json();
    let episodeId = "";

    if (type === "movie") {
      episodeId = infoData.episodeId || infoData.id; 
      // Sometimes movies have an episodeId in the info response, or we use the ID itself.
      // For meta/tmdb, usually we need to call watch with the episodeId found in the info.
      // For movies, it's often the first 'episode' or the ID itself.
      // Let's check if there's an 'episodes' array even for movies (some providers do this).
      if (infoData.episodes && infoData.episodes.length > 0) {
        episodeId = infoData.episodes[0].id;
      } else {
        // Fallback: try using the TMDB ID directly on the watch endpoint (unlikely to work for all providers but worth a shot if no episodes)
        episodeId = infoData.id; 
      }
    } else if (type === "tv") {
      if (!season || !episode) {
        return NextResponse.json({ error: "Missing season/episode for TV show" }, { status: 400 });
      }

      const seasonData = infoData.seasons?.find((s: any) => s.season === Number(season));
      const episodeData = seasonData?.episodes?.find((e: any) => e.episode === Number(episode));

      if (!episodeData) {
        return NextResponse.json({ error: "Episode not found" }, { status: 404 });
      }

      episodeId = episodeData.id;
    }

    // 2. Get Stream Sources
    const watchUrl = `${CONSUMET_URL}/meta/tmdb/watch/${episodeId}`;
    const watchRes = await fetch(watchUrl);

    if (!watchRes.ok) {
      throw new Error("Failed to fetch stream sources");
    }

    const watchData = await watchRes.json();

    // 3. Select Best Source (Auto-select highest quality or m3u8)
    // Consumet usually returns 'sources' array.
    const sources = watchData.sources || [];
    const subtitles = watchData.subtitles || [];

    if (sources.length === 0) {
      return NextResponse.json({ error: "No sources found" }, { status: 404 });
    }

    // Prefer m3u8 (HLS) and 'auto' quality if available, or the highest quality
    const bestSource = sources.find((s: any) => s.quality === "auto") || sources[0];

    return NextResponse.json({
      source: bestSource,
      allSources: sources,
      subtitles: subtitles,
      intro: watchData.intro,
      outro: watchData.outro,
    });

  } catch (error: any) {
    console.error("Stream API Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
