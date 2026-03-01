"use client";

import { PlayCircle, Github, Twitter, Instagram } from "lucide-react";
import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";

const Footer = () => {
  const { t } = useLanguage();

  return (
    <footer className="bg-[#0A0A0A] border-t border-white/5 pt-16 pb-8 mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-center text-center">
          <Link href="/" className="flex items-center gap-2 mb-6">
            <PlayCircle className="w-8 h-8 text-[#E50914]" />
            <span className="text-2xl font-black tracking-tighter text-[#E50914]">
              MOVEO
            </span>
          </Link>
          
          <ul className="flex flex-wrap justify-center gap-6 text-sm text-white/60 mb-8">
            <li className="hover:text-[#E50914] transition-colors cursor-pointer">{t.footer.terms}</li>
            <li className="hover:text-[#E50914] transition-colors cursor-pointer">{t.footer.privacy}</li>
            <li className="hover:text-[#E50914] transition-colors cursor-pointer">{t.footer.about}</li>
            <li className="hover:text-[#E50914] transition-colors cursor-pointer">{t.footer.blog}</li>
            <li className="hover:text-[#E50914] transition-colors cursor-pointer">{t.footer.faq}</li>
          </ul>

          <p className="text-xs text-white/40 max-w-2xl mb-8 leading-relaxed">
            {t.footer.description}
          </p>

          <div className="flex items-center gap-6">
            <a href="#" className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-[#E50914] hover:text-white transition-all duration-300">
              <Instagram className="w-5 h-5" />
            </a>
            <a href="#" className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-[#E50914] hover:text-white transition-all duration-300">
              <Twitter className="w-5 h-5" />
            </a>
            <a href="#" className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-[#E50914] hover:text-white transition-all duration-300">
              <Github className="w-5 h-5" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
