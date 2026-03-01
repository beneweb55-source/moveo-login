"use client";

import { CircularProgressbar, buildStyles } from "react-circular-progressbar";
import "react-circular-progressbar/dist/styles.css";

const CircularProgressBar = ({ rating }: { rating: number }) => {
  return (
    <div className="w-12 h-12 bg-[#0A0A0A] rounded-full p-1 flex items-center justify-center border border-white/10 shadow-lg">
      <CircularProgressbar
        value={rating}
        maxValue={10}
        text={rating.toFixed(1)}
        styles={buildStyles({
          pathColor:
            rating < 5 ? "red" : rating < 7 ? "orange" : "green",
          textColor: "white",
          trailColor: "transparent",
          textSize: "34px",
          pathTransitionDuration: 0.5,
        })}
      />
    </div>
  );
};

export default CircularProgressBar;
