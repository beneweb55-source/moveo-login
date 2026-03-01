import React from "react";
import ReactPlayer from "react-player";
import { X } from "lucide-react";

interface VideoPopupProps {
  show: boolean;
  setShow: (show: boolean) => void;
  videoId: string | null;
  setVideoId: (id: string | null) => void;
}

const Player = ReactPlayer as any;

const VideoPopup = ({ show, setShow, videoId, setVideoId }: VideoPopupProps) => {
  const hidePopup = () => {
    setShow(false);
    setVideoId(null);
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div
        className="absolute inset-0 cursor-pointer"
        onClick={hidePopup}
      ></div>
      <div className="relative w-[90%] max-w-[900px] aspect-video bg-[#0A0A0A] rounded-xl overflow-hidden shadow-2xl scale-100 transition-transform duration-300">
        <button
          className="absolute -top-10 right-0 text-white hover:text-[#E50914] transition-colors"
          onClick={hidePopup}
        >
          <X className="w-8 h-8" />
        </button>
        <Player
          url={`https://www.youtube.com/watch?v=${videoId}`}
          controls
          width="100%"
          height="100%"
          playing={true}
        />
      </div>
    </div>
  );
};

export default VideoPopup;
