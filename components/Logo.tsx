import React from 'react';
import Image from 'next/image';

export const Logo = ({ className = "" }: { className?: string }) => {
  return (
    <div className={`relative w-24 h-7 sm:w-28 sm:h-8 ${className}`}>
      <Image 
        src="/logo.png" 
        alt="MOVEO" 
        fill 
        className="object-contain"
        priority
      />
    </div>
  );
};
