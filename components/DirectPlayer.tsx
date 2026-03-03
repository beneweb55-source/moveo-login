"use client";

import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { getDirectStreamUrl } from '@/lib/direct-stream-api';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';

interface DirectPlayerProps {
  tmdbId: string;
  type: 'movie' | 'tv';
  season?: number;
  episode?: number;
  title?: string;
  year?: string;
  onClose?: () => void; // Callback pour revenir au mode standard en cas d'erreur
}

const DirectPlayer: React.FC<DirectPlayerProps> = ({ tmdbId, type, season, episode, title, year, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const fetchStream = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await getDirectStreamUrl(tmdbId, type, season, episode, title, year);
        
        if (!isMounted) return;

        if (result && result.url) {
          setStreamUrl(result.url);
        } else {
          setError("Sources directes indisponibles pour ce contenu.");
        }
      } catch (err) {
        if (isMounted) setError("Erreur lors de la récupération du flux direct.");
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchStream();

    return () => {
      isMounted = false;
    };
  }, [tmdbId, type, season, episode, title, year]);

  useEffect(() => {
    if (!streamUrl || !videoRef.current) return;

    const video = videoRef.current;
    let hls: Hls | null = null;

    if (Hls.isSupported()) {
      hls = new Hls();
      hls.loadSource(streamUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(e => console.error("Auto-play failed:", e));
      });
      
      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.error("HLS Network error", data);
              hls?.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.error("HLS Media error", data);
              hls?.recoverMediaError();
              break;
            default:
              console.error("HLS Fatal error", data);
              hls?.destroy();
              break;
          }
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Fallback pour Safari
      video.src = streamUrl;
      video.addEventListener('loadedmetadata', () => {
        video.play().catch(e => console.error("Auto-play failed:", e));
      });
    }

    return () => {
      if (hls) {
        hls.destroy();
      }
    };
  }, [streamUrl]);

  if (loading) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-black text-white gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-[#E50914]" />
        <p className="text-sm text-zinc-400 animate-pulse">Recherche de sources directes...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-black text-white gap-4 p-6 text-center">
        <AlertCircle className="w-12 h-12 text-red-500" />
        <h3 className="text-lg font-bold">Oups !</h3>
        <p className="text-zinc-400 max-w-md">{error}</p>
        <p className="text-xs text-zinc-500 mt-2">Le serveur direct peut être surchargé ou le lien a expiré.</p>
        <button 
          onClick={onClose}
          className="mt-4 px-6 py-2 bg-[#E50914] hover:bg-red-700 text-white rounded-full font-medium transition-colors flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Utiliser les lecteurs standards
        </button>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-black group">
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        controls
        playsInline
        poster={`https://image.tmdb.org/t/p/original/${tmdbId}`} // Placeholder poster logic, ideally fetched from props
      />
      {/* Overlay controls or custom UI could go here */}
    </div>
  );
};

export default DirectPlayer;
