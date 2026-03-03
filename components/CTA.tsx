"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Compass, ArrowRight } from "lucide-react";
import { motion } from "motion/react";

const CTA = () => {
  const router = useRouter();

  return (
    <section className="relative w-full py-24 px-4 overflow-hidden">
      {/* Background with Noise & Gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0A0A0A] via-[#1a0b2e] to-black z-0" />
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none z-0" 
           style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }} 
      />
      
      <div className="relative z-10 max-w-4xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
        >
          <div className="inline-flex items-center justify-center p-3 bg-white/5 rounded-full mb-6 border border-white/10 backdrop-blur-sm">
            <Compass className="w-6 h-6 text-[#E50914] mr-2" />
            <span className="text-zinc-300 text-sm font-medium tracking-wide uppercase">Discover More</span>
          </div>
          
          <h2 className="text-4xl md:text-6xl font-black text-white mb-6 tracking-tight leading-tight">
            Ready to explore the <br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#E50914] to-purple-600">
              Cinematic Universe?
            </span>
          </h2>
          
          <p className="text-lg md:text-xl text-zinc-400 mb-10 max-w-2xl mx-auto">
            Dive into thousands of movies and TV shows. Curated lists, personalized recommendations, and much more await you.
          </p>
          
          <button
            onClick={() => router.push("/explore/movie")}
            className="group relative inline-flex items-center justify-center px-8 py-4 bg-white text-black font-bold text-lg rounded-full overflow-hidden transition-all duration-300 hover:scale-105 hover:shadow-[0_0_40px_-10px_rgba(255,255,255,0.3)]"
          >
            <span className="relative z-10 flex items-center gap-2">
              Start Exploring
              <ArrowRight className="w-5 h-5 transition-transform duration-300 group-hover:translate-x-1" />
            </span>
            <div className="absolute inset-0 bg-gradient-to-r from-zinc-100 to-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          </button>
        </motion.div>
      </div>
    </section>
  );
};

export default CTA;
