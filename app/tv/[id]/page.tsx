"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { fetchDataFromApi } from "@/utils/api";
import ContentWrapper from "@/components/ContentWrapper";
import VideoPlayer from "@/components/VideoPlayer";
import { Star, ArrowLeft, Info, ChevronDown } from "lucide-react";
import Image from "next/image";

export default function TvDetails() {
  const { id } = useParams();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [selectedEpisode, setSelectedEpisode] = useState(1);
  const [episodesCount, setEpisodesCount] = useState(1);

  useEffect(() => {
    const fetchDetails = async () => {
      setLoading(true);
      try {
        const res = await fetchDataFromApi(`/tv/${id}`);
        setData(res);
        
        const firstSeason = res.seasons?.find((s: any) => s.season_number === 1) || res.seasons?.[0];
        if (firstSeason) {
          setSelectedSeason(firstSeason.season_number);
          setEpisodesCount(firstSeason.episode_count);
        }
      } catch (error) {
        console.error("Error fetching details:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchDetails();
  }, [id]);

  useEffect(() => {
    if (!data || selectedSeason === undefined) return;
    
    const fetchSeasonDetails = async () => {
      try {
        const res = await fetchDataFromApi(`/tv/${id}/season/${selectedSeason}`);
        if (res && res.episodes) {
          setEpisodesCount(res.episodes.length);
          setSelectedEpisode(1);
        }
      } catch (error) {
        console.error("Error fetching season details:", error);
        const seasonInfo = data.seasons?.find((s: any) => s.season_number === selectedSeason);
        if (seasonInfo) {
          setEpisodesCount(seasonInfo.episode_count);
          setSelectedEpisode(1);
        }
      }
    };
    
    fetchSeasonDetails();
  }, [selectedSeason, id, data]);

  if (loading) {
    return (
      <div className="w-full h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-[#E50914] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const backdropUrl = data?.backdrop_path 
    ? `https://image.tmdb.org/t/p/original${data.backdrop_path}`
    : "https://picsum.photos/seed/backdrop/1920/1080";
    
  const posterUrl = data?.poster_path
    ? `https://image.tmdb.org/t/p/w500${data.poster_path}`
    : null;

  const releaseDate = data?.first_air_date;
  const year = releaseDate ? new Date(releaseDate).getFullYear() : "";
  const rating = data?.vote_average ? data.vote_average.toFixed(1) : "NR";

  const availableSeasons = data?.seasons?.filter((s: any) => s.season_number > 0) || [];

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white pb-20">
      {/* Back Button */}
      <button 
        onClick={() => router.push("/")}
        className="fixed top-6 left-6 z-50 flex items-center gap-2 bg-black/50 hover:bg-[#E50914] text-white px-4 py-2 rounded-full backdrop-blur-md transition-all duration-300"
      >
        <ArrowLeft className="w-5 h-5" />
        <span className="hidden sm:block font-medium">Retour à l&apos;accueil</span>
      </button>

      {/* Hero Section */}
      <div className="relative w-full h-[60vh] md:h-[70vh] flex items-end pb-12">
        <div className="absolute inset-0 overflow-hidden">
          <Image
            src={backdropUrl}
            alt="Backdrop"
            fill
            className="object-cover opacity-30 blur-xl scale-110"
            referrerPolicy="no-referrer"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0A] via-[#0A0A0A]/80 to-transparent" />
        </div>

        <ContentWrapper>
          <div className="relative z-10 flex flex-col md:flex-row gap-8 items-end md:items-start">
            {/* Poster */}
            <div className="hidden md:block w-[200px] lg:w-[250px] flex-shrink-0 -mb-20 z-20">
              <div className="relative w-full aspect-[2/3] rounded-xl overflow-hidden shadow-2xl border border-white/10 bg-[#1a1a1a]">
                {posterUrl ? (
                  <Image
                    src={posterUrl}
                    alt={data?.name || "Poster"}
                    fill
                    className="object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center p-4 text-center bg-zinc-900">
                    <span className="text-white/50 font-bold text-xl">{data?.name}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Info */}
            <div className="flex-1 flex flex-col">
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tighter mb-4 drop-shadow-lg">
                {data?.name}
              </h1>
              
              <div className="flex flex-wrap items-center gap-4 mb-6 text-sm md:text-base">
                <div className="flex items-center gap-1 bg-white/10 px-3 py-1 rounded-full backdrop-blur-md">
                  <Star className="w-4 h-4 text-yellow-500 fill-current" />
                  <span className="font-bold">{rating}</span>
                </div>
                {year && <span className="text-white/70">{year}</span>}
                {data?.number_of_seasons && (
                  <span className="text-white/70">{data.number_of_seasons} Saison{data.number_of_seasons > 1 ? 's' : ''}</span>
                )}
                <div className="flex gap-2 flex-wrap">
                  {data?.genres?.map((g: any) => (
                    <span key={g.id} className="text-xs bg-zinc-800/80 border border-white/10 px-2 py-1 rounded-md text-white/90">
                      {g.name}
                    </span>
                  ))}
                </div>
              </div>

              <p className="text-lg text-white/80 leading-relaxed max-w-3xl font-light line-clamp-4 md:line-clamp-none">
                {data?.overview}
              </p>
            </div>
          </div>
        </ContentWrapper>
      </div>

      {/* Video Player Section */}
      <ContentWrapper>
        <div className="mt-16 md:mt-24 max-w-5xl mx-auto">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 gap-4">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <span className="text-[#E50914]">Lecture</span> en cours
            </h2>
            
            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
              {/* Season Selector */}
              <div className="relative bg-zinc-900 border border-white/10 rounded-lg flex-1 md:flex-none min-w-[140px]">
                <select 
                  value={selectedSeason}
                  onChange={(e) => setSelectedSeason(Number(e.target.value))}
                  className="w-full appearance-none bg-transparent text-white px-4 py-3 pr-10 outline-none cursor-pointer font-medium"
                >
                  {availableSeasons.map((season: any) => (
                    <option key={season.id} value={season.season_number} className="bg-[#141414] text-white">
                      Saison {season.season_number}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/50 pointer-events-none" />
              </div>

              {/* Episode Selector */}
              <div className="relative bg-zinc-900 border border-white/10 rounded-lg flex-1 md:flex-none min-w-[140px]">
                <select 
                  value={selectedEpisode}
                  onChange={(e) => setSelectedEpisode(Number(e.target.value))}
                  className="w-full appearance-none bg-transparent text-white px-4 py-3 pr-10 outline-none cursor-pointer font-medium"
                >
                  {Array.from({ length: episodesCount }, (_, i) => i + 1).map((ep) => (
                    <option key={ep} value={ep} className="bg-[#141414] text-white">
                      Épisode {ep}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/50 pointer-events-none" />
              </div>
            </div>
          </div>

          <VideoPlayer id={id as string} type="tv" season={selectedSeason} episode={selectedEpisode} />
          
          <div className="mt-6 space-y-3">
            <div className="flex items-start gap-2 text-white/80 text-sm bg-zinc-900/80 border border-white/5 p-4 rounded-lg">
              <Info className="w-5 h-5 flex-shrink-0 mt-0.5 text-[#E50914]" />
              <p className="font-medium">
                💡 Conseil : Si un lecteur ne fonctionne pas, essayez-en un autre dans la liste ci-dessus.
              </p>
            </div>
          </div>
        </div>
      </ContentWrapper>
    </div>
  );
}
