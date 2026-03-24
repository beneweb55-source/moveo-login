import React, { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import MovieCard from "./MovieCard";

interface CarouselProps {
  data: any[];
  loading: boolean;
  endpoint?: string;
  title?: string;
  renderItem?: (item: any) => React.ReactNode;
}

const Carousel = ({ data, loading, endpoint, title, renderItem }: CarouselProps) => {
  const carouselContainer = useRef<HTMLDivElement>(null);

  const navigation = (dir: string) => {
    const container = carouselContainer.current;
    if (container) {
      const scrollAmount =
        dir === "left"
          ? container.scrollLeft - (container.offsetWidth + 20)
          : container.scrollLeft + (container.offsetWidth + 20);

      container.scrollTo({
        left: scrollAmount,
        behavior: "smooth",
      });
    }
  };

  const skItem = () => {
    return (
      <div className="w-[calc(50%-12px)] sm:w-[calc(33.33%-16px)] lg:w-[calc(20%-16px)] flex-shrink-0 animate-pulse">
        <div className="w-full aspect-[2/3] rounded-xl bg-white/10 mb-3" />
        <div className="flex flex-col gap-2">
          <div className="h-4 bg-white/10 rounded-md w-3/4" />
          <div className="h-3 bg-white/10 rounded-md w-1/2" />
        </div>
      </div>
    );
  };

  return (
    <div className="relative mb-10 sm:mb-16">
      {title && (
        <h2 className="text-2xl sm:text-4xl font-black mb-8 sm:mb-10 text-white flex items-center gap-3 uppercase tracking-tighter px-4 sm:px-0">
          <span className="w-1.5 h-8 sm:h-10 bg-[#E50914] rounded-full"></span>
          {title}
        </h2>
      )}
      <div className="relative group">
        <ChevronLeft
          className="absolute -left-2 sm:-left-6 top-[40%] -translate-y-1/2 w-12 h-12 bg-black/80 text-white rounded-full p-3 cursor-pointer z-20 opacity-0 sm:group-hover:opacity-100 transition-all duration-300 hidden sm:block hover:bg-[#E50914] hover:scale-110 shadow-2xl border border-white/10"
          onClick={() => navigation("left")}
        />
        <ChevronRight
          className="absolute -right-2 sm:-right-6 top-[40%] -translate-y-1/2 w-12 h-12 bg-black/80 text-white rounded-full p-3 cursor-pointer z-20 opacity-0 sm:group-hover:opacity-100 transition-all duration-300 hidden sm:block hover:bg-[#E50914] hover:scale-110 shadow-2xl border border-white/10"
          onClick={() => navigation("right")}
        />

        {!loading ? (
          <div
            className="flex gap-5 sm:gap-8 overflow-y-hidden overflow-x-auto scrollbar-hide scroll-smooth pb-8 px-4 sm:px-0"
            ref={carouselContainer}
            style={{ scrollSnapType: "x mandatory" }}
          >
            {data?.map((item) => (
              <div key={item.id} className="w-[calc(60%-16px)] sm:w-[calc(33.33%-20px)] lg:w-[calc(20%-24px)] flex-shrink-0" style={{ scrollSnapAlign: "start" }}>
                {renderItem ? renderItem(item) : <MovieCard data={item} mediaType={endpoint} />}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex gap-5 sm:gap-8 overflow-hidden px-4 sm:px-0">
            {skItem()}
            {skItem()}
            {skItem()}
            {skItem()}
            {skItem()}
          </div>
        )}
      </div>
    </div>
  );
};

export default Carousel;
