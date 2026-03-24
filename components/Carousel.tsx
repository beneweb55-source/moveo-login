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
      <div className="w-[160px] md:w-[calc(25%-15px)] lg:w-[calc(20%-16px)] flex-shrink-0 animate-pulse">
        <div className="w-full aspect-[2/3] rounded-xl bg-white/10 mb-3" />
        <div className="flex flex-col gap-2">
          <div className="h-4 bg-white/10 rounded-md w-3/4" />
          <div className="h-3 bg-white/10 rounded-md w-1/2" />
        </div>
      </div>
    );
  };

  return (
    <div className="relative mb-12">
      {title && (
        <h2 className="text-xl md:text-3xl font-bold mb-6 md:mb-8 text-white flex items-center gap-2 uppercase tracking-tight">
          <span className="w-1 h-6 md:h-8 bg-[#E50914] rounded-full mr-2"></span>
          {title}
        </h2>
      )}
      <div className="relative group">
        <ChevronLeft
          className="absolute -left-5 top-[40%] -translate-y-1/2 w-12 h-12 bg-black/80 text-white rounded-full p-2 cursor-pointer z-20 opacity-0 group-hover:opacity-100 transition-all duration-300 hidden md:block hover:bg-[#E50914] hover:scale-110 shadow-xl"
          onClick={() => navigation("left")}
        />
        <ChevronRight
          className="absolute -right-5 top-[40%] -translate-y-1/2 w-12 h-12 bg-black/80 text-white rounded-full p-2 cursor-pointer z-20 opacity-0 group-hover:opacity-100 transition-all duration-300 hidden md:block hover:bg-[#E50914] hover:scale-110 shadow-xl"
          onClick={() => navigation("right")}
        />

        {!loading ? (
          <div
            className="flex gap-4 md:gap-6 overflow-y-hidden overflow-x-auto scrollbar-hide scroll-smooth pb-4 px-1"
            ref={carouselContainer}
            style={{ scrollSnapType: "x mandatory" }}
          >
            {data?.map((item) => (
              <div key={item.id} className="w-[160px] md:w-[calc(25%-18px)] lg:w-[calc(20%-19px)] flex-shrink-0" style={{ scrollSnapAlign: "start" }}>
                {renderItem ? renderItem(item) : <MovieCard data={item} mediaType={endpoint} />}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex gap-4 md:gap-6 overflow-hidden px-1">
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
