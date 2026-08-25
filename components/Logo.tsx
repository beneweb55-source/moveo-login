import React from 'react';
import Image from 'next/image';

export const Logo = ({ className = "" }: { className?: string }) => {
  return (
    <div className={`relative w-48 h-14 md:w-56 md:h-16 ${className}`}>
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
