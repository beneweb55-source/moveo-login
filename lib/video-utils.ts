
export type SourceType = 'tmdb' | 'imdb';
export interface VideoSource {
  id: string;
  name: string;
  type: 'tmdb' | 'imdb';
  badge: string;
  desc: string;
  url: (id: string, s?: number, e?: number) => string;
}

export const SERVER_SOURCES: VideoSource[] = [
  {
    id: "vidsrc_me",
    name: "VidSrc.me",
    type: "tmdb",
    badge: "🟢 Officiel",
    desc: "Serveur principal",
    url: (id, s, e) => s && e
      ? `https://vidsrc.me/embed/tv?tmdb=${id}&season=${s}&episode=${e}`
      : `https://vidsrc.me/embed/movie?tmdb=${id}`
  }
];

export const getVideoUrl = (source: VideoSource, tmdbId: string, imdbId: string | null, season?: number, episode?: number, lang: string = 'fr'): string => {
  return source.url(tmdbId, season, episode);
};
