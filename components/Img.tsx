import Image from "next/image";
import { useState } from "react";

interface ImgProps {
  src: string;
  className?: string;
  alt?: string;
}

const Img = ({ src, className, alt = "" }: ImgProps) => {
  const [isLoading, setIsLoading] = useState(true);

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {isLoading && (
        <div className="absolute inset-0 bg-[#1A1A1A] animate-pulse" />
      )}
      <Image
        src={src}
        alt={alt}
        fill
        className={`object-cover transition-opacity duration-500 ${
          isLoading ? "opacity-0" : "opacity-100"
        }`}
        onLoad={() => setIsLoading(false)}
        referrerPolicy="no-referrer"
      />
    </div>
  );
};

export default Img;
