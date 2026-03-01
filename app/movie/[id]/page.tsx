"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { fetchDataFromApi } from "@/utils/api";
import ContentWrapper from "@/components/ContentWrapper";
import VideoPlayer from "@/components/VideoPlayer";
import ActionButtons from "@/components/ActionButtons";
import { Star, ArrowLeft, Clock, Calendar, Film, Play, Info } from "lucide-react";
import Image from "next/image";
import { motion, useScroll, useTransform } from "motion/react";

export default function MovieDetails() {
  const { id } = useParams();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const playerRef = useRef<HTMLDivElement>(null);
  
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 500], [0, 200]);
  const opacity = useTransform(scrollY, [0, 300], [1, 0]);

  useEffect(() => {
    const fetchDetails = async () => {
      setLoading(true);
      try {
        const res = await fetchDataFromApi(`/movie/${id}`);
        setData(res);
      } catch (error) {
        console.error("Error fetching details:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchDetails();
  }, [id]);

  const scrollToPlayer = () => {
    playerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

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

  const releaseDate = data?.release_date;
  const year = releaseDate ? new Date(releaseDate).getFullYear() : "";
  const rating = data?.vote_average ? data.vote_average.toFixed(1) : "NR";
  
  // Format runtime
  const hours = Math.floor(data?.runtime / 60);
  const minutes = data?.runtime % 60;
  const runtime = `${hours}h ${minutes}m`;

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white font-sans selection:bg-[#E50914] selection:text-white">
      {/* Navigation */}
      <motion.button 
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        onClick={() => router.push("/")}
        className="fixed top-6 left-6 z-50 flex items-center gap-2 bg-black/40 hover:bg-[#E50914] text-white px-5 py-2.5 rounded-full backdrop-blur-xl border border-white/10 transition-all duration-300 group"
      >
        <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
        <span className="font-medium hidden sm:inline">Retour</span>
      </motion.button>

      {/* Immersive Hero Section */}
      <div className="relative w-full h-[85vh] overflow-hidden">
        <motion.div style={{ y }} className="absolute inset-0">
          <Image
            src={backdropUrl}
            alt="Backdrop"
            fill
            className="object-cover"
            priority
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-[#0A0A0A]" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0A0A0A]/80 via-[#0A0A0A]/20 to-transparent" />
        </motion.div>

        <ContentWrapper>
          <div className="relative h-full flex flex-col justify-end pb-20 z-10">
            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="max-w-4xl"
            >
              {/* Badges */}
              <div className="flex flex-wrap items-center gap-3 mb-4">
                {data?.status && (
                  <span className="px-3 py-1 text-xs font-bold uppercase tracking-wider bg-[#E50914] text-white rounded-md shadow-[0_0_15px_rgba(229,9,20,0.4)]">
                    {data.status}
                  </span>
                )}
                {data?.genres?.slice(0, 3).map((g: any) => (
                  <span key={g.id} className="px-3 py-1 text-xs font-medium uppercase tracking-wider bg-white/10 backdrop-blur-md border border-white/10 rounded-md">
                    {g.name}
                  </span>
                ))}
              </div>

              {/* Title */}
              <h1 className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tighter mb-6 leading-[0.9] text-transparent bg-clip-text bg-gradient-to-b from-white to-white/60 drop-shadow-2xl">
                {data?.title}
              </h1>

              {/* Meta Info */}
              <div className="flex items-center gap-6 text-sm md:text-base font-medium text-white/80">
                <div className="flex items-center gap-2">
                  <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />
                  <span className="text-white text-lg">{rating}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-[#E50914]" />
                  <span>{year}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-[#E50914]" />
                  <span>{runtime}</span>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="flex flex-wrap items-center gap-4 mt-8">
                <button 
                  onClick={scrollToPlayer}
                  className="flex items-center gap-3 bg-white text-black px-8 py-4 rounded-xl font-bold hover:bg-[#E50914] hover:text-white transition-all duration-300 shadow-[0_0_20px_rgba(255,255,255,0.2)] hover:shadow-[0_0_30px_rgba(229,9,20,0.4)] group"
                >
                  <div className="w-8 h-8 rounded-full bg-black text-white group-hover:bg-white group-hover:text-[#E50914] flex items-center justify-center transition-colors">
                    <Play className="w-4 h-4 fill-current ml-0.5" />
                  </div>
                  <span>Bande-annonce</span>
                </button>
                
                <div className="scale-110 origin-left">
                  <ActionButtons 
                    id={id as string} 
                    type="movie" 
                    title={data?.title} 
                    posterPath={data?.poster_path} 
                  />
                </div>
              </div>
            </motion.div>
          </div>
        </ContentWrapper>
      </div>

      {/* Content Section */}
      <div className="relative z-20 -mt-10 pb-20">
        <ContentWrapper>
          <div className="grid grid-cols-1 lg:grid-cols-[350px_1fr] gap-12 lg:gap-20">
            {/* Left Column: Poster & Details */}
            <div className="hidden lg:block">
              <motion.div 
                initial={{ opacity: 0, y: 50 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.4 }}
                className="sticky top-24"
              >
                <div className="relative aspect-[2/3] rounded-2xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/10 group">
                  {posterUrl ? (
                    <Image
                      src={posterUrl}
                      alt={data?.title}
                      fill
                      className="object-cover transition-transform duration-700 group-hover:scale-105"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-full h-full bg-zinc-900 flex items-center justify-center">
                      <Film className="w-16 h-16 text-white/20" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                </div>

                {/* Additional Info Grid */}
                <div className="mt-8 grid grid-cols-1 gap-4">
                  {data?.tagline && (
                    <div className="p-4 bg-white/5 rounded-xl border border-white/5 backdrop-blur-sm">
                      <h3 className="text-[#E50914] text-xs font-bold uppercase tracking-widest mb-2">Tagline</h3>
                      <p className="text-white/90 italic font-serif text-lg leading-relaxed">&ldquo;{data.tagline}&rdquo;</p>
                    </div>
                  )}
                  
                  <div className="p-4 bg-white/5 rounded-xl border border-white/5 backdrop-blur-sm">
                    <h3 className="text-[#E50914] text-xs font-bold uppercase tracking-widest mb-2">Informations</h3>
                    <div className="space-y-3 text-sm">
                      <div className="flex justify-between border-b border-white/5 pb-2">
                        <span className="text-white/50">Statut</span>
                        <span className="text-white font-medium">{data?.status}</span>
                      </div>
                      <div className="flex justify-between border-b border-white/5 pb-2">
                        <span className="text-white/50">Budget</span>
                        <span className="text-white font-medium">
                          {data?.budget > 0 ? `$${(data.budget / 1000000).toFixed(1)}M` : 'N/A'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/50">Revenus</span>
                        <span className="text-white font-medium">
                          {data?.revenue > 0 ? `$${(data.revenue / 1000000).toFixed(1)}M` : 'N/A'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Right Column: Synopsis & Player */}
            <div className="flex flex-col gap-12 pt-10 lg:pt-0">
              {/* Mobile Poster (Visible only on small screens) */}
              <div className="lg:hidden flex gap-6">
                <div className="w-32 sm:w-40 flex-shrink-0 rounded-xl overflow-hidden shadow-2xl border border-white/10">
                  {posterUrl && (
                    <Image
                      src={posterUrl}
                      alt={data?.title}
                      width={160}
                      height={240}
                      className="object-cover w-full h-full"
                      referrerPolicy="no-referrer"
                    />
                  )}
                </div>
                <div className="flex flex-col justify-center">
                  <h2 className="text-2xl font-bold mb-2">Synopsis</h2>
                  <div className="h-1 w-12 bg-[#E50914] rounded-full mb-4" />
                </div>
              </div>

              {/* Synopsis */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.5 }}
              >
                <h2 className="hidden lg:block text-3xl font-bold mb-6 flex items-center gap-3">
                  Synopsis
                  <div className="h-1 w-12 bg-[#E50914] rounded-full mt-1" />
                </h2>
                <p className="text-lg md:text-xl text-white/80 leading-relaxed font-light">
                  {data?.overview || "Aucun synopsis disponible pour ce film."}
                </p>
              </motion.div>

              {/* Video Player */}
              <motion.div 
                ref={playerRef}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8 }}
                className="mt-8"
              >
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
                    <span className="text-[#E50914]">Espace</span> Cinéma
                  </h2>
                  <div className="flex items-center gap-2 text-xs font-medium px-3 py-1 bg-white/5 rounded-full border border-white/10 text-white/50">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    Lecteur Prêt
                  </div>
                </div>

                <div className="relative rounded-2xl overflow-hidden bg-black shadow-[0_0_50px_rgba(229,9,20,0.15)] border border-white/10">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#E50914] to-transparent opacity-50" />
                  <VideoPlayer id={id as string} type="movie" />
                </div>

                <div className="mt-6 flex items-start gap-3 p-4 bg-[#141414] rounded-xl border border-white/5">
                  <Info className="w-5 h-5 text-[#E50914] flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-white/60">
                    Si le lecteur ne démarre pas automatiquement, essayez de changer de serveur ou de désactiver votre bloqueur de publicités. La qualité de streaming dépend de votre connexion internet.
                  </p>
                </div>
              </motion.div>
            </div>
          </div>
        </ContentWrapper>
      </div>
    </div>
  );
}
