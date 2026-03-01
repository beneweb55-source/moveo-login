"use client";

import { useSelector } from "react-redux";
import { RootState } from "@/store/store";

const Genres = ({ data }: { data: number[] }) => {
  const { genres } = useSelector((state: RootState) => state.home);

  return (
    <div className="flex gap-2 flex-wrap mb-2">
      {data?.map((g) => {
        if (!genres[g]?.name) return null;
        return (
          <div
            key={g}
            className="bg-[#E50914]/20 text-[#E50914] text-xs px-2 py-1 rounded-md font-medium"
          >
            {genres[g]?.name}
          </div>
        );
      })}
    </div>
  );
};

export default Genres;
