import React from 'react';
import Image from 'next/image';

export const Logo = ({ className = "" }: { className?: string }) => {
  return (
    <div className={`relative w-80 h-24 ${className}`}>
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
