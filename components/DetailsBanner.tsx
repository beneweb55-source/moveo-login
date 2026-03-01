"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { fetchDataFromApi } from "@/utils/api";
import ContentWrapper from "@/components/ContentWrapper";
import CircularProgressBar from "@/components/CircularProgressBar";
import VideoPopup from "@/components/VideoPopup";
import { format } from "date-fns";
import { Play, Star, Clock, Calendar, Plus, Check, Loader2, Heart, Bookmark, Eye } from "lucide-react";
import Image from "next/image";

const DetailsBanner = ({ video, crew }: { video: any; crew: any }) => {
  const [show, setShow] = useState(false);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  const [user, setUser] = useState<any>(null);
  const [lists, setLists] = useState<string[]>([]);
  const [listLoading, setListLoading] = useState<string | null>(null);
  
  const { mediaType, id } = useParams();

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchUser();
  }, []);

  useEffect(() => {
    const fetchDetails = async () => {
      setLoading(true);
      const res = await fetchDataFromApi(`/${mediaType}/${id}`);
      setData(res);
      setLoading(false);
    };
    fetchDetails();
  }, [mediaType, id]);

  useEffect(() => {
    const checkListStatus = async () => {
      if (!user) return;
      try {
        const res = await fetch(`/api/user/status?media_type=${mediaType}&media_id=${id}`);
        if (res.ok) {
          const data = await res.json();
          setLists(data.lists || []);
        }
      } catch (error) {
        console.error('Error checking list status:', error);
      }
    };
    checkListStatus();
  }, [mediaType, id, user]);

  const toggleList = async (listType: string) => {
    if (!user) {
      alert('Veuillez vous connecter pour utiliser cette fonctionnalité.');
      return;
    }
    
    setListLoading(listType);
    const inList = lists.includes(listType);
    
    try {
      if (inList) {
        const res = await fetch(`/api/user/list?media_type=${mediaType}&media_id=${id}&list_type=${listType}`, {
          method: 'DELETE',
        });
        if (res.ok) setLists(lists.filter(l => l !== listType));
      } else {
        const res = await fetch('/api/user/list', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            media_type: mediaType,
            media_id: id,
            list_type: listType,
            title: data?.name || data?.title,
            poster_path: data?.poster_path,
          }),
        });
        if (res.ok) setLists([...lists, listType]);
      }
    } catch (error) {
      console.error('Error toggling list:', error);
    } finally {
      setListLoading(null);
    }
  };

  const director = crew?.filter((f: any) => f.job === "Director");
  const writer = crew?.filter(
    (f: any) =>
      f.job === "Screenplay" || f.job === "Story" || f.job === "Writer"
  );

  const toHoursAndMinutes = (totalMinutes: number) => {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}h ${minutes > 0 ? `${minutes}m` : ""}`;
  };

  if (loading) {
    return (
      <div className="w-full h-[70vh] bg-[#0A0A0A] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-[#E50914] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const backdropUrl = data?.backdrop_path 
    ? `https://image.tmdb.org/t/p/original${data.backdrop_path}`
    : "https://picsum.photos/seed/backdrop/1920/1080";
    
  const posterUrl = data?.poster_path
    ? `https://image.tmdb.org/t/p/w500${data.poster_path}`
    : "https://picsum.photos/seed/poster/500/750";

  const releaseDate = data?.release_date || data?.first_air_date;
  const year = releaseDate ? new Date(releaseDate).getFullYear() : "";

  return (
    <div className="relative w-full min-h-[85vh] bg-[#0A0A0A] flex items-center pt-20 pb-12">
      {/* Backdrop Image */}
      <div className="absolute inset-0 overflow-hidden">
        <Image
          src={backdropUrl}
          alt="Backdrop"
          fill
          className="object-cover opacity-30"
          referrerPolicy="no-referrer"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0A] via-[#0A0A0A]/80 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0A0A0A] via-[#0A0A0A]/50 to-transparent" />
      </div>

      <ContentWrapper>
        <div className="relative z-10 flex flex-col md:flex-row gap-10 lg:gap-16 items-center md:items-start">
          {/* Poster */}
          <div className="w-[250px] sm:w-[300px] md:w-[350px] flex-shrink-0">
            <div className="relative w-full aspect-[2/3] rounded-2xl overflow-hidden shadow-[0_0_40px_rgba(0,0,0,0.8)] border border-white/10">
              <Image
                src={posterUrl}
                alt={data?.name || data?.title || "Poster"}
                fill
                className="object-cover"
                referrerPolicy="no-referrer"
                priority
              />
            </div>
          </div>

          {/* Details */}
          <div className="flex-1 text-white flex flex-col pt-4 md:pt-10">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tighter mb-2 drop-shadow-lg">
              {data?.name || data?.title} <span className="text-white/50 font-light">({year})</span>
            </h1>
            
            {data?.tagline && (
              <div className="text-lg md:text-xl text-white/60 italic mb-6 font-light">
                &quot;{data.tagline}&quot;
              </div>
            )}

            {/* Meta Info */}
            <div className="flex flex-wrap items-center gap-6 mb-8 text-sm md:text-base">
              <div className="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-full backdrop-blur-md border border-white/5">
                <Star className="w-5 h-5 text-yellow-500 fill-current" />
                <span className="font-bold">{data?.vote_average?.toFixed(1)}</span>
                <span className="text-white/50">/ 10</span>
              </div>
              
              {data?.runtime > 0 && (
                <div className="flex items-center gap-2 text-white/80">
                  <Clock className="w-5 h-5" />
                  <span>{toHoursAndMinutes(data.runtime)}</span>
                </div>
              )}
              
              {releaseDate && (
                <div className="flex items-center gap-2 text-white/80">
                  <Calendar className="w-5 h-5" />
                  <span>{format(new Date(releaseDate), "MMM d, yyyy")}</span>
                </div>
              )}
            </div>

            {/* Play Trailer Button and Lists */}
            <div className="flex flex-wrap items-center gap-4 mb-10">
              {video && (
                <button
                  onClick={() => {
                    setShow(true);
                    setVideoId(video.key);
                  }}
                  className="flex items-center gap-4 bg-[#E50914] hover:bg-red-700 text-white px-8 py-4 rounded-full font-bold text-lg transition-all duration-300 shadow-[0_0_20px_rgba(229,9,20,0.4)] hover:shadow-[0_0_30px_rgba(229,9,20,0.6)] hover:scale-105"
                >
                  <Play className="w-6 h-6 fill-current" />
                  Watch Trailer
                </button>
              )}
              
              {user && (
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => toggleList('watchlist')}
                    disabled={listLoading === 'watchlist'}
                    title="Ajouter à la Watchlist"
                    className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 border-2 ${
                      lists.includes('watchlist')
                        ? 'bg-white/10 border-white/20 text-white hover:bg-white/20' 
                        : 'bg-transparent border-white/50 text-white hover:border-white hover:bg-white/5'
                    }`}
                  >
                    {listLoading === 'watchlist' ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Bookmark className={`w-5 h-5 ${lists.includes('watchlist') ? 'fill-current' : ''}`} />
                    )}
                  </button>

                  <button
                    onClick={() => toggleList('favorites')}
                    disabled={listLoading === 'favorites'}
                    title="Ajouter en Favoris"
                    className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 border-2 ${
                      lists.includes('favorites')
                        ? 'bg-pink-500/20 border-pink-500/50 text-pink-500 hover:bg-pink-500/30' 
                        : 'bg-transparent border-white/50 text-white hover:border-white hover:bg-white/5'
                    }`}
                  >
                    {listLoading === 'favorites' ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Heart className={`w-5 h-5 ${lists.includes('favorites') ? 'fill-current' : ''}`} />
                    )}
                  </button>

                  <button
                    onClick={() => toggleList('watched')}
                    disabled={listLoading === 'watched'}
                    title="Marquer comme vu"
                    className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 border-2 ${
                      lists.includes('watched')
                        ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-500 hover:bg-emerald-500/30' 
                        : 'bg-transparent border-white/50 text-white hover:border-white hover:bg-white/5'
                    }`}
                  >
                    {listLoading === 'watched' ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Eye className={`w-5 h-5 ${lists.includes('watched') ? 'fill-current' : ''}`} />
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Overview */}
            <div className="mb-8 max-w-3xl">
              <h3 className="text-2xl font-bold mb-3">Overview</h3>
              <p className="text-lg text-white/70 leading-relaxed font-light">
                {data?.overview}
              </p>
            </div>

            {/* Crew Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 border-t border-white/10 pt-6 max-w-3xl">
              {data?.status && (
                <div>
                  <span className="text-white/50 block mb-1 text-sm">Status</span>
                  <span className="font-medium">{data.status}</span>
                </div>
              )}
              
              {director?.length > 0 && (
                <div>
                  <span className="text-white/50 block mb-1 text-sm">Director</span>
                  <span className="font-medium">
                    {director.map((d: any) => d.name).join(", ")}
                  </span>
                </div>
              )}

              {writer?.length > 0 && (
                <div className="sm:col-span-2">
                  <span className="text-white/50 block mb-1 text-sm">Writer</span>
                  <span className="font-medium">
                    {writer.map((d: any) => d.name).join(", ")}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </ContentWrapper>
      
      <VideoPopup
        show={show}
        setShow={setShow}
        videoId={videoId}
        setVideoId={setVideoId}
      />
    </div>
  );
};

export default DetailsBanner;
