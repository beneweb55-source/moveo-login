"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Search, Menu, X, PlayCircle, Star, Loader2, Globe } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence } from "motion/react";
import { useLanguage } from "@/context/LanguageContext";

const Header = () => {
  const [show, setShow] = useState("top");
  const [lastScrollY, setLastScrollY] = useState(0);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  
  const router = useRouter();
  const pathname = usePathname();
  const searchRef = useRef<HTMLDivElement>(null);
  const { language, t, toggleLanguage } = useLanguage();

  useEffect(() => {
    window.scrollTo(0, 0);
    setShowDropdown(false);
    setQuery("");
  }, [pathname]);

  useEffect(() => {
    const controlNavbar = () => {
      if (window.scrollY > 100) {
        if (window.scrollY > lastScrollY && !mobileMenu && !showDropdown) {
          setShow("hide");
        } else {
          setShow("show");
        }
      } else {
        setShow("top");
      }
      setLastScrollY(window.scrollY);
    };

    window.addEventListener("scroll", controlNavbar);
    return () => window.removeEventListener("scroll", controlNavbar);
  }, [lastScrollY, mobileMenu, showDropdown]);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Live search
  useEffect(() => {
    const fetchResults = async () => {
      if (!query.trim()) {
        setResults([]);
        setShowDropdown(false);
        return;
      }

      setLoading(true);
      setShowDropdown(true);
      try {
        const langParam = language === 'fr' ? 'fr-FR' : 'en-US';
        const res = await fetch(`/api/tmdb-proxy?q=${encodeURIComponent(query)}&language=${langParam}`);
        const data = await res.json();
        setResults((data.results || []).slice(0, 5)); // Show top 5 results
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    const debounceTimer = setTimeout(fetchResults, 300);
    return () => clearTimeout(debounceTimer);
  }, [query, language]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/search/${query}`);
      setShowDropdown(false);
    }
  };

  const navigationHandler = (type: string) => {
    router.push(`/explore/${type}`);
    setMobileMenu(false);
  };

  return (
    <header
      className={`fixed top-0 w-full h-20 z-50 transition-all duration-300 ease-in-out ${
        mobileMenu ? "bg-[#0A0A0A]" : ""
      } ${
        show === "top"
          ? "bg-gradient-to-b from-black/80 to-transparent backdrop-blur-sm"
          : show === "show"
          ? "bg-[#0A0A0A]/95 backdrop-blur-md shadow-lg border-b border-white/5"
          : "-translate-y-full"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full flex items-center justify-between gap-4 lg:gap-8">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 cursor-pointer flex-shrink-0">
          <PlayCircle className="w-8 h-8 text-[#E50914]" />
          <span className="text-2xl font-black tracking-tighter text-[#E50914] hidden sm:block">
            MOVEO
          </span>
        </Link>

        {/* Desktop Navigation */}
        <ul className="hidden lg:flex items-center gap-8 font-medium text-sm text-white/80">
          <li className="cursor-pointer hover:text-white transition-colors" onClick={() => router.push("/")}>{t.nav.home}</li>
          <li className="cursor-pointer hover:text-white transition-colors" onClick={() => navigationHandler("movie")}>{t.nav.movies}</li>
          <li className="cursor-pointer hover:text-white transition-colors" onClick={() => navigationHandler("tv")}>{t.nav.tvShows}</li>
        </ul>

        {/* Centered Search Bar */}
        <div className="flex-1 max-w-2xl relative" ref={searchRef}>
          <form onSubmit={handleSearchSubmit} className="relative group">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-white/50 group-focus-within:text-white transition-colors" />
            </div>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => query.trim() && setShowDropdown(true)}
              placeholder={t.nav.searchPlaceholder}
              className="w-full bg-white/10 border border-white/10 rounded-full py-2.5 pl-12 pr-4 text-sm text-white placeholder:text-white/50 focus:outline-none focus:border-white/30 focus:bg-black/80 transition-all duration-300"
            />
            {query && (
              <button 
                type="button" 
                onClick={() => setQuery("")}
                className="absolute inset-y-0 right-0 pr-4 flex items-center"
              >
                <X className="h-4 w-4 text-white/50 hover:text-white transition-colors" />
              </button>
            )}
          </form>

          {/* Live Search Dropdown */}
          <AnimatePresence>
            {showDropdown && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute top-full left-0 right-0 mt-2 bg-[#141414] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50"
              >
                {loading ? (
                  <div className="flex items-center justify-center p-8">
                    <Loader2 className="w-6 h-6 text-[#E50914] animate-spin" />
                  </div>
                ) : results.length > 0 ? (
                  <div className="flex flex-col">
                    {results.map((item) => {
                      const isMovie = item.media_type === "movie" || !item.media_type;
                      const title = item.title || item.name;
                      const date = item.release_date || item.first_air_date;
                      const year = date ? new Date(date).getFullYear() : "N/A";
                      const rating = item.vote_average ? item.vote_average.toFixed(1) : "NR";
                      const posterUrl = item.poster_path 
                        ? `https://image.tmdb.org/t/p/w92${item.poster_path}`
                        : "https://picsum.photos/seed/poster/92/138";

                      return (
                        <div 
                          key={item.id}
                          onClick={() => router.push(`/${isMovie ? "movie" : "tv"}/${item.id}`)}
                          className="flex items-center gap-4 p-3 hover:bg-white/5 cursor-pointer transition-colors border-b border-white/5 last:border-0"
                        >
                          <div className="relative w-12 h-16 rounded overflow-hidden flex-shrink-0 bg-[#2a2a2a]">
                            <Image src={posterUrl} alt={title} fill className="object-cover" referrerPolicy="no-referrer" />
                          </div>
                          <div className="flex flex-col flex-1 min-w-0">
                            <h4 className="text-white font-medium text-sm truncate">{title}</h4>
                            <div className="flex items-center gap-2 text-xs text-white/50 mt-1">
                              <span>{year}</span>
                              <span>•</span>
                              <span className="flex items-center gap-1">
                                <Star className="w-3 h-3 text-yellow-500 fill-current" />
                                {rating}
                              </span>
                              <span>•</span>
                              <span className="uppercase text-[10px] tracking-wider border border-white/20 px-1 rounded">
                                {isMovie ? "Movie" : "TV"}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div 
                      onClick={handleSearchSubmit}
                      className="p-3 text-center text-sm text-white/70 hover:text-white hover:bg-white/5 cursor-pointer transition-colors"
                    >
                      {t.nav.searchResults} &quot;{query}&quot;
                    </div>
                  </div>
                ) : (
                  <div className="p-6 text-center text-white/50 text-sm">
                    {t.nav.noResults} &quot;{query}&quot;
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Language Switch & Mobile Menu Icon */}
        <div className="flex items-center gap-4">
          <button
            onClick={toggleLanguage}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 transition-colors text-sm font-medium"
          >
            <Globe className="w-4 h-4 text-white/70" />
            <span className="uppercase">{language}</span>
          </button>
          
          <div className="lg:hidden flex items-center">
            {mobileMenu ? (
              <X onClick={() => setMobileMenu(false)} className="w-6 h-6 cursor-pointer" />
            ) : (
              <Menu onClick={() => setMobileMenu(true)} className="w-6 h-6 cursor-pointer" />
            )}
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileMenu && (
          <motion.div
            initial={{ opacity: 0, x: "100%" }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: "100%" }}
            transition={{ type: "tween" }}
            className="fixed inset-0 top-20 bg-[#0A0A0A] z-40 flex flex-col p-6"
          >
            <ul className="flex flex-col gap-6 text-xl font-semibold">
              <li className="cursor-pointer hover:text-[#E50914] transition-colors" onClick={() => { router.push("/"); setMobileMenu(false); }}>{t.nav.home}</li>
              <li className="cursor-pointer hover:text-[#E50914] transition-colors" onClick={() => navigationHandler("movie")}>{t.nav.movies}</li>
              <li className="cursor-pointer hover:text-[#E50914] transition-colors" onClick={() => navigationHandler("tv")}>{t.nav.tvShows}</li>
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};

export default Header;
