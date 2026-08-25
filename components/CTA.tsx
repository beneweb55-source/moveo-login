"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Compass, ArrowRight } from "lucide-react";
import { motion } from "motion/react";
import { useLanguage } from "@/context/LanguageContext";

const CTA = () => {
  const router = useRouter();
  const { t } = useLanguage();

  return (
    <section className="relative w-full py-32 px-4 overflow-hidden bg-black">
      {/* Background Elements */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-[#E50914]/20 via-black to-black opacity-40" />
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#E50914]/50 to-transparent" />
      
      <div className="relative z-10 max-w-5xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <div className="inline-flex items-center justify-center px-4 py-1.5 bg-[#E50914]/10 rounded-full mb-8 border border-[#E50914]/20">
            <Compass className="w-4 h-4 text-[#E50914] mr-2" />
            <span className="text-[#E50914] text-xs font-bold tracking-widest uppercase">{t.cta.discover}</span>
          </div>
          
          <h2 className="text-5xl md:text-7xl font-black text-white mb-8 tracking-tighter leading-none">
            {t.cta.title}
          </h2>
          
          <p className="text-lg md:text-xl text-zinc-400 mb-12 max-w-2xl mx-auto leading-relaxed">
            {t.cta.subtitle}
          </p>
          
          <button
            onClick={() => router.push("/explore/movie")}
            className="group relative inline-flex items-center justify-center px-10 py-5 bg-[#E50914] text-white font-bold text-lg rounded-full overflow-hidden transition-all duration-300 hover:bg-[#ff0a1b] hover:shadow-[0_0_40px_-10px_rgba(229,9,20,0.5)]"
          >
            <span className="relative z-10 flex items-center gap-3">
              {t.cta.button}
              <ArrowRight className="w-5 h-5 transition-transform duration-300 group-hover:translate-x-1" />
            </span>
          </button>
        </motion.div>
      </div>
    </section>
  );
};

export default CTA;
