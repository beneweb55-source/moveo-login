"use client";

import { useSelector } from "react-redux";
import { RootState } from "@/store/store";

const Genres = ({ data }: { data: number[] }) => {
  const { genres } = useSelector((state: RootState) => state.home);

  return (
    <div className="flex gap-2 flex-wrap mb-2">
      {data?.map((g) => {
        const genre = genres[g];
        const name = typeof genre === 'object' ? genre?.name : genre;
        if (!name) return null;
        return (
          <div
            key={g}
            className="bg-white/10 text-white text-xs px-2 py-1 rounded-md font-medium"
          >
            {name}
          </div>
        );
      })}
    </div>
  );
};

export default Genres;
