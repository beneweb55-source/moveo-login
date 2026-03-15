"use client";

import { useState } from "react";

interface SwitchTabsProps {
  data: string[];
  onTabChange: (tab: string, index: number) => void;
}

const SwitchTabs = ({ data, onTabChange }: SwitchTabsProps) => {
  const [selectedTab, setSelectedTab] = useState(0);
  const [left, setLeft] = useState(0);

  const activeTab = (tab: string, index: number) => {
    setLeft(index * 100);
    setTimeout(() => {
      setSelectedTab(index);
    }, 300);
    onTabChange(tab, index);
  };

  return (
    <div className="h-9 bg-white/10 rounded-full p-1">
      <div className="flex items-center relative h-full">
        {data.map((tab, index) => (
          <span
            key={index}
            className={`h-full flex items-center justify-center w-[100px] text-sm font-medium cursor-pointer z-10 transition-colors duration-300 ${
              selectedTab === index ? "text-white" : "text-white/60"
            }`}
            onClick={() => activeTab(tab, index)}
          >
            {tab}
          </span>
        ))}
        <span
          className="h-full w-[100px] rounded-full bg-[#E50914] absolute left-0 transition-all duration-300 ease-in-out"
          style={{ left }}
        />
      </div>
    </div>
  );
};

export default SwitchTabs;
