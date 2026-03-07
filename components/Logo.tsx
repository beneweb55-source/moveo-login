import React from "react";

interface LogoProps {
  className?: string;
  variant?: "full" | "mov";
}

const Logo: React.FC<LogoProps> = ({ className = "h-8", variant = "full" }) => {
  if (variant === "mov") {
    // Favicon version: MOV
    return (
      <svg
        viewBox="0 0 120 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
      >
        {/* M */}
        <path
          d="M10 35V5L20 15L30 5V35H25V12L20 17L15 12V35H10Z"
          fill="#E50914"
        />
        {/* O (Play Button) */}
        <circle cx="55" cy="20" r="18" fill="#E50914" />
        <path d="M50 12V28L63 20L50 12Z" fill="white" />
        {/* V */}
        <path
          d="M80 5L90 30L100 5H106L93 35H87L74 5H80Z"
          fill="white"
        />
      </svg>
    );
  }

  // Full version: MOVEO
  return (
    <svg
      viewBox="0 0 220 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* M */}
      <path
        d="M10 35V5L20 15L30 5V35H25V12L20 17L15 12V35H10Z"
        fill="#E50914"
      />
      {/* O (Play Button) */}
      <circle cx="55" cy="20" r="18" fill="#E50914" />
      <path d="M50 12V28L63 20L50 12Z" fill="white" />
      
      {/* V */}
      <path
        d="M85 10L95 35L105 10H110L98 40H92L80 10H85Z"
        fill="white"
      />
      {/* E */}
      <path
        d="M120 10V40H140V35H125V28H138V23H125V15H140V10H120Z"
        fill="white"
      />
      {/* O (Text) */}
      <path
        d="M165 10C154 10 145 19 145 25C145 31 154 40 165 40C176 40 185 31 185 25C185 19 176 10 165 10ZM165 35C159 35 150 30 150 25C150 20 159 15 165 15C171 15 180 20 180 25C180 30 171 35 165 35Z"
        fill="white"
      />
    </svg>
  );
};

export default Logo;
