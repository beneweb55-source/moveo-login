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
    <div className="relative mb-12 sm:mb-20">
      {title && (
        <h2 className="text-2xl sm:text-3xl font-serif mb-6 sm:mb-8 text-white flex items-center gap-4 tracking-wide px-4 sm:px-0">
          {title}
          <div className="flex-1 h-[1px] bg-white/10 hidden sm:block"></div>
        </h2>
      )}
      <div className="relative group">
        <ChevronLeft
          className="absolute -left-4 sm:-left-8 top-1/2 -translate-y-1/2 w-10 h-10 bg-moveo-surface/80 backdrop-blur-md text-white rounded-full p-2.5 cursor-pointer z-20 opacity-0 sm:group-hover:opacity-100 transition-all duration-300 hidden sm:block hover:bg-white/10 hover:scale-105 shadow-xl border border-white/10"
          onClick={() => navigation("left")}
        />
        <ChevronRight
          className="absolute -right-4 sm:-right-8 top-1/2 -translate-y-1/2 w-10 h-10 bg-moveo-surface/80 backdrop-blur-md text-white rounded-full p-2.5 cursor-pointer z-20 opacity-0 sm:group-hover:opacity-100 transition-all duration-300 hidden sm:block hover:bg-white/10 hover:scale-105 shadow-xl border border-white/10"
          onClick={() => navigation("right")}
        />

        {!loading ? (
          <div
            className="flex gap-4 sm:gap-6 lg:gap-8 overflow-y-visible overflow-x-auto scrollbar-hide scroll-smooth py-4 px-4 sm:px-0"
            ref={carouselContainer}
            style={{ scrollSnapType: "x mandatory" }}
          >
            {data?.map((item) => (
              <div key={item.id} className="w-[calc(40%-16px)] sm:w-[calc(33.33%-16px)] lg:w-[calc(20%-24px)] flex-shrink-0" style={{ scrollSnapAlign: "start" }}>
                {renderItem ? renderItem(item) : <MovieCard data={item} mediaType={endpoint} />}
              </div>
            ))}
            {/* Spacer for right padding on mobile scroll */}
            <div className="w-1 sm:hidden flex-shrink-0" />
          </div>
        ) : (
          <div className="flex gap-4 sm:gap-6 lg:gap-8 overflow-hidden px-4 sm:px-0">
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
