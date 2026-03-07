import React from 'react';

const SkeletonCard = () => {
  return (
    <div className="flex flex-col gap-3 animate-pulse">
      <div className="aspect-[2/3] w-full bg-zinc-800 rounded-2xl" />
      <div className="h-4 w-3/4 bg-zinc-800 rounded-lg" />
      <div className="h-3 w-1/2 bg-zinc-800 rounded-lg" />
    </div>
  );
};

export default SkeletonCard;
