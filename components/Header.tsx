"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Search, Menu, X, PlayCircle, Star, Loader2, Globe, User, LogOut, Settings, Heart, Eye, Bookmark } from "lucide-react";
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
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [user, setUser] = useState<any>(null);
  
  const router = useRouter();
  const pathname = usePathname();
  const searchRef = useRef<HTMLDivElement>(null);
  const { language, t, toggleLanguage } = useLanguage();

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
        } else {
          setUser(null);
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchUser();
  }, [pathname]);

  useEffect(() => {
    window.scrollTo(0, 0);
    setShowSearchDropdown(false);
    setShowUserDropdown(false);
    setQuery("");
  }, [pathname]);

  useEffect(() => {
    const controlNavbar = () => {
      if (window.scrollY > 100) {
        if (window.scrollY > lastScrollY && !mobileMenu && !showSearchDropdown && !showUserDropdown) {
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
  }, [lastScrollY, mobileMenu, showSearchDropdown, showUserDropdown]);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSearchDropdown(false);
      }
      // Close user dropdown if clicked outside
      const userDropdownEl = document.getElementById('user-dropdown-container');
      if (userDropdownEl && !userDropdownEl.contains(event.target as Node)) {
        setShowUserDropdown(false);
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
        setShowSearchDropdown(false);
        return;
      }

      setLoading(true);
      setShowSearchDropdown(true);
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
      setShowSearchDropdown(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setUser(null);
      router.refresh();
    } catch (err) {
      console.error(err);
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
          {user && (
            <li className="cursor-pointer hover:text-white transition-colors" onClick={() => router.push("/my-list")}>My List</li>
          )}
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
              onFocus={() => query.trim() && setShowSearchDropdown(true)}
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
            {showSearchDropdown && (
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
          {user ? (
            <div className="hidden lg:flex items-center relative" id="user-dropdown-container">
              <button
                onClick={() => setShowUserDropdown(!showUserDropdown)}
                className="flex items-center gap-2 hover:bg-white/5 p-1.5 rounded-full transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#E50914] to-purple-600 flex items-center justify-center text-white font-bold text-sm shadow-lg">
                  {user.name?.charAt(0).toUpperCase() || 'U'}
                </div>
                <span className="text-sm font-medium text-white/90 mr-1">
                  {user.name}
                </span>
              </button>

              {/* User Dropdown */}
              <AnimatePresence>
                {showUserDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                    className="absolute top-full right-0 mt-2 w-56 bg-[#141414] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 py-2"
                  >
                    <div className="px-4 py-3 border-b border-white/10 mb-2">
                      <p className="text-sm text-white font-medium">{user.name}</p>
                      <p className="text-xs text-white/50 truncate">{user.email}</p>
                    </div>
                    
                    <div className="flex flex-col">
                      <Link href="/profile" className="flex items-center gap-3 px-4 py-2.5 text-sm text-white/80 hover:text-white hover:bg-white/5 transition-colors">
                        <User className="w-4 h-4" />
                        Profil
                      </Link>
                      <Link href="/profile?tab=watchlist" className="flex items-center gap-3 px-4 py-2.5 text-sm text-white/80 hover:text-white hover:bg-white/5 transition-colors">
                        <Bookmark className="w-4 h-4" />
                        Watchlist
                      </Link>
                      <Link href="/profile?tab=favorites" className="flex items-center gap-3 px-4 py-2.5 text-sm text-white/80 hover:text-white hover:bg-white/5 transition-colors">
                        <Heart className="w-4 h-4" />
                        Favoris
                      </Link>
                      <Link href="/profile?tab=watched" className="flex items-center gap-3 px-4 py-2.5 text-sm text-white/80 hover:text-white hover:bg-white/5 transition-colors">
                        <Eye className="w-4 h-4" />
                        Déjà vu
                      </Link>
                      <Link href="/profile?tab=settings" className="flex items-center gap-3 px-4 py-2.5 text-sm text-white/80 hover:text-white hover:bg-white/5 transition-colors">
                        <Settings className="w-4 h-4" />
                        Paramètres
                      </Link>
                    </div>
                    
                    <div className="mt-2 pt-2 border-t border-white/10">
                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-[#E50914] hover:bg-[#E50914]/10 transition-colors"
                      >
                        <LogOut className="w-4 h-4" />
                        Déconnexion
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <div className="hidden lg:flex items-center gap-2">
              <Link
                href="/login"
                className="px-4 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 transition-colors text-sm font-medium"
              >
                Sign In
              </Link>
              <Link
                href="/register"
                className="px-4 py-1.5 rounded-full bg-[#E50914] hover:bg-[#E50914]/90 transition-colors text-sm font-medium text-white"
              >
                Sign Up
              </Link>
            </div>
          )}

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
              {user && (
                <li className="cursor-pointer hover:text-[#E50914] transition-colors" onClick={() => { router.push("/my-list"); setMobileMenu(false); }}>My List</li>
              )}
              
              <div className="h-px bg-white/10 my-2" />
              
              {user ? (
                <>
                  <li className="text-white/50 text-sm font-normal">Signed in as {user.name}</li>
                  <li className="cursor-pointer text-red-400 hover:text-red-300 transition-colors flex items-center gap-2" onClick={() => { handleLogout(); setMobileMenu(false); }}>
                    <LogOut className="w-5 h-5" /> Logout
                  </li>
                </>
              ) : (
                <>
                  <li className="cursor-pointer hover:text-[#E50914] transition-colors" onClick={() => { router.push("/login"); setMobileMenu(false); }}>Sign In</li>
                  <li className="cursor-pointer hover:text-[#E50914] transition-colors" onClick={() => { router.push("/register"); setMobileMenu(false); }}>Sign Up</li>
                </>
              )}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};

export default Header;
