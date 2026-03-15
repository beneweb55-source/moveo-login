"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Search, Menu, X, PlayCircle, Star, Loader2, Globe, User, LogOut, Settings, Heart, Eye, Bookmark, Shield, ArrowLeft, Home, Film, Tv, Sparkles, Languages, Info, Calendar } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence } from "motion/react";
import { Logo } from "@/components/Logo";
import { useLanguage } from "@/context/LanguageContext";

const Header = () => {
  const [show, setShow] = useState("top");
  const [lastScrollY, setLastScrollY] = useState(0);
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [aiReasoning, setAiReasoning] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [stats, setStats] = useState({ watchlist: 0, favorites: 0, watched: 0 });
  
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  
  const router = useRouter();
  const pathname = usePathname();
  const searchRef = useRef<HTMLDivElement>(null);
  const { language, t, toggleLanguage } = useLanguage();

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/profile/stats');
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats);
      }
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  };

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
          fetchStats();
        } else if (res.status === 403) {
          const data = await res.json();
          if (data.banned) {
            await fetch('/api/auth/logout', { method: 'POST' });
            setUser(null);
            router.push(`/banned?reason=${encodeURIComponent(data.ban_reason || 'Violation des règles')}`);
          }
        } else {
          setUser(null);
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchUser();
  }, [pathname, router]);

  useEffect(() => {
    const handleListUpdated = () => {
      if (user) fetchStats();
    };
    const handleProfileUpdated = () => {
      const fetchUser = async () => {
        try {
          const res = await fetch('/api/auth/me');
          if (res.ok) {
            const data = await res.json();
            setUser(data.user);
          }
        } catch (err) {
          console.error(err);
        }
      };
      fetchUser();
    };
    window.addEventListener('list-updated', handleListUpdated);
    window.addEventListener('profile-updated', handleProfileUpdated);
    return () => {
      window.removeEventListener('list-updated', handleListUpdated);
      window.removeEventListener('profile-updated', handleProfileUpdated);
    };
  }, [user]);

  useEffect(() => {
    window.scrollTo(0, 0);
    setShowSearchDropdown(false);
    setShowUserDropdown(false);
    setQuery("");
  }, [pathname]);

  useEffect(() => {
    const controlNavbar = () => {
      if (window.scrollY > 100) {
        if (window.scrollY > lastScrollY && !showMoreMenu && !showSearchDropdown && !showUserDropdown) {
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
  }, [lastScrollY, showMoreMenu, showSearchDropdown, showUserDropdown]);

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
        
        // Detection Layer: > 2 words OR specific keywords = Intent (AI Search), else Title (TMDB Proxy)
        const words = query.trim().split(/\s+/).length;
        const keywords = ["dans", "in", "about", "sur", "with", "avec", "film", "movie", "serie", "show", "triste", "sad", "funny", "drôle", "peur", "scary", "love", "amour", "space", "espace", "action", "aventure", "adventure", "comedy", "comédie", "drama", "drame", "fantasy", "fantastique", "horror", "horreur", "sci-fi", "science-fiction", "thriller", "western", "war", "guerre", "crime", "music", "musique", "mystery", "mystère", "romance", "romantique", "documentary", "documentaire", "family", "famille", "history", "histoire", "animation", "top", "best", "meilleur", "pire", "worst", "like", "comme", "style", "genre", "vibe", "mood", "ambiance"];
        
        const hasKeyword = keywords.some(k => query.toLowerCase().includes(k));
        const isSemantic = words >= 3 || hasKeyword;
        
        const endpoint = isSemantic ? '/api/ai-search' : '/api/tmdb-proxy';

        console.log(`[Search] Routing to ${endpoint} for query: "${query}"`);

        const res = await fetch(`${endpoint}?q=${encodeURIComponent(query)}&language=${langParam}`);
        const data = await res.json();
        
        console.log("[Search] API Response:", data);
        
        if (data.ai_reasoning) {
          setAiReasoning(data.ai_reasoning);
        } else {
          setAiReasoning("");
        }

        const filteredResults = (data.results || [])
          .filter((item: any) => {
            if (item.media_type === 'person') {
              return !!item.profile_path;
            }
            // Filter out items without poster
            if (!item.poster_path) return false;
            // Filter out items without release date
            const date = item.release_date || item.first_air_date;
            if (!date) return false;
            return true;
          })
          // Remove duplicates based on ID
          .filter((item: any, index: number, self: any[]) =>
            index === self.findIndex((t: any) => (
              t.id === item.id
            ))
          );
        setResults(filteredResults.slice(0, 5)); // Show top 5 results
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
  };

  const [placeholder, setPlaceholder] = useState(t.nav.searchPlaceholder);

  return (
    <header
      className={`fixed top-0 w-full h-20 z-50 transition-all duration-300 ease-in-out ${
        show === "top"
          ? "bg-gradient-to-b from-black/80 to-transparent backdrop-blur-sm"
          : show === "show"
          ? "bg-[#0A0A0A]/95 backdrop-blur-md shadow-lg border-b border-white/5"
          : "-translate-y-full"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full flex items-center justify-between gap-2 lg:gap-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 cursor-pointer flex-shrink-0 hover:scale-105 transition-transform duration-300">
          <Logo />
        </Link>

        {/* Desktop Navigation */}
        <ul className="hidden lg:flex items-center gap-6 font-medium text-sm text-white/80">
          <li className="cursor-pointer hover:text-white transition-colors" onClick={() => router.push("/")}>{t.nav.home}</li>
          <li className="cursor-pointer hover:text-white transition-colors" onClick={() => navigationHandler("movie")}>{t.nav.movies}</li>
          <li className="cursor-pointer hover:text-white transition-colors" onClick={() => navigationHandler("tv")}>{t.nav.tvShows}</li>
          <li className="cursor-pointer hover:text-white transition-colors" onClick={() => router.push("/animes")}>{t.nav.animes}</li>
          <li className="cursor-pointer hover:text-white transition-colors" onClick={() => router.push("/kdrama")}>{t.nav.kdramas}</li>
          {user && (
            <li className="cursor-pointer hover:text-white transition-colors" onClick={() => router.push("/my-list")}>{t.nav.myList}</li>
          )}
        </ul>

        {/* Desktop Search Bar (Hidden on mobile) */}
        <div className="hidden md:block flex-1 max-w-2xl transition-all duration-500 ease-in-out relative" ref={searchRef}>
          <form onSubmit={handleSearchSubmit} className="relative group w-full">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-white/50 group-focus-within:text-white transition-colors" />
            </div>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => query.trim() && setShowSearchDropdown(true)}
              placeholder={t.nav.searchPlaceholder}
              className="w-full bg-white/10 border border-white/10 rounded-full py-2.5 pl-12 pr-10 text-sm text-white placeholder:text-white/50 focus:outline-none focus:border-white/30 focus:bg-black/80 transition-all duration-300"
            />
            <div className="absolute inset-y-0 right-0 pr-2 flex items-center gap-1">
              {query && (
                <button 
                  type="button" 
                  onClick={() => setQuery("")}
                  className="p-2 text-white/50 hover:text-white transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </form>

          {/* Desktop Search Dropdown */}
          <AnimatePresence>
            {showSearchDropdown && (
              <motion.div
                key="search-dropdown"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute top-full left-0 right-0 mt-2 bg-[#141414] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-[120] max-h-[70vh] overflow-y-auto"
              >
                {loading ? (
                  <div className="flex flex-col items-center justify-center p-8 gap-3">
                    <Loader2 className="w-6 h-6 text-[#E50914] animate-spin" />
                    {query.split(' ').length >= 3 || ["triste", "peur", "rire", "joyeux", "sombre", "calme", "amour", "action", "film", "serie", "space", "espace"].some(k => query.toLowerCase().includes(k)) ? (
                      <span className="text-xs text-white/50 animate-pulse">
                        Analyse de votre mood...
                      </span>
                    ) : null}
                  </div>
                ) : results.length > 0 ? (
                  <div className="flex flex-col">
                    {aiReasoning && (
                      <div className="px-4 py-2 bg-white/5 border-b border-white/5 flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-[#E50914] animate-pulse" />
                        <span className="text-xs font-medium text-white/80 uppercase tracking-wide">
                          AI: {aiReasoning}
                        </span>
                      </div>
                    )}
                    {results.map((item) => {
                      const isPerson = item.media_type === "person";
                      const isMovie = item.media_type === "movie" || (!item.media_type && !isPerson);
                      const title = item.title || item.name;
                      const date = item.release_date || item.first_air_date;
                      const year = date ? new Date(date).getFullYear() : (isPerson ? item.known_for_department : "N/A");
                      const rating = item.vote_average ? item.vote_average.toFixed(1) : "NR";
                      const posterUrl = isPerson
                        ? (item.profile_path ? `https://image.tmdb.org/t/p/w92${item.profile_path}` : "https://picsum.photos/seed/poster/92/138")
                        : (item.poster_path ? `https://image.tmdb.org/t/p/w92${item.poster_path}` : "https://picsum.photos/seed/poster/92/138");

                      return (
                        <div 
                          key={item.id}
                          onClick={() => router.push(`/${isPerson ? "person" : isMovie ? "movie" : "tv"}/${item.id}`)}
                          className="flex items-center gap-4 p-3 hover:bg-white/5 cursor-pointer transition-colors border-b border-white/5 last:border-0"
                        >
                          <div className={`relative flex-shrink-0 bg-[#2a2a2a] overflow-hidden ${isPerson ? 'w-12 h-12 rounded-full' : 'w-12 h-16 rounded'}`}>
                            <Image src={posterUrl} alt={title} fill className="object-cover" referrerPolicy="no-referrer" />
                          </div>
                          <div className="flex flex-col flex-1 min-w-0">
                            <h4 className="text-white font-medium text-sm truncate">{title}</h4>
                            <div className="flex items-center gap-2 text-xs text-white/50 mt-1">
                              <span>{year}</span>
                              {!isPerson && (
                                <>
                                  <span>•</span>
                                  <span className="flex items-center gap-1">
                                    <Star className="w-3 h-3 text-yellow-500 fill-current" />
                                    {rating}
                                  </span>
                                </>
                              )}
                              <span>•</span>
                              <span className="uppercase text-[10px] tracking-wider border border-white/20 px-1 rounded whitespace-nowrap">
                                {isPerson ? (language === 'fr' ? 'Personne' : 'Person') : (isMovie ? t.explore.exploreMovies : t.explore.exploreTv)}
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

        {/* Language Switch & Mobile Menu Icon (Desktop only for language) */}
        <div className="flex items-center gap-4">
          {user ? (
            <div className="flex items-center relative" id="user-dropdown-container">
              <button
                onClick={() => {
                  if (window.innerWidth < 1024) {
                    router.push("/profile");
                  } else {
                    setShowUserDropdown(!showUserDropdown);
                  }
                }}
                className="flex items-center gap-2 hover:bg-white/5 p-1.5 rounded-full transition-colors"
              >
                {user.avatar_url ? (
                  <div className="w-8 h-8 rounded-full overflow-hidden relative shadow-lg border border-white/10">
                    <Image src={user.avatar_url} alt={user.name} fill className="object-cover" referrerPolicy="no-referrer" />
                  </div>
                ) : (
                  <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#E50914] to-purple-600 flex items-center justify-center text-white font-bold text-sm shadow-lg">
                    {user.name?.charAt(0).toUpperCase() || 'U'}
                  </div>
                )}
                <span className="hidden lg:block text-sm font-medium text-white/90 mr-1">
                  {user.name}
                </span>
              </button>

              {/* Desktop User Dropdown */}
              <AnimatePresence>
                {showUserDropdown && (
                  <motion.div
                    key="user-dropdown"
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                    className="hidden lg:block absolute top-full right-0 mt-2 w-56 bg-[#141414] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 py-2"
                  >
                    <div className="px-4 py-3 border-b border-white/10 mb-2">
                      <p className="text-sm text-white font-medium">{user.name}</p>
                      <p className="text-xs text-white/50 truncate">{user.email}</p>
                    </div>
                    
                    <div className="flex flex-col">
                      <Link href="/profile" className="flex items-center gap-3 px-4 py-2.5 text-sm text-white/80 hover:text-white hover:bg-white/5 transition-colors">
                        <User className="w-4 h-4" />
                        {t.nav.profile}
                      </Link>
                      {user.permissions?.includes('access_admin_panel') && (
                        <Link href="/admin" className="flex items-center gap-3 px-4 py-2.5 text-sm font-bold text-red-500 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                          <Shield className="w-4 h-4" />
                          Panel Admin
                        </Link>
                      )}
                    </div>
                    
                    <div className="mt-2 pt-2 border-t border-white/10">
                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-[#E50914] hover:bg-[#E50914]/10 transition-colors"
                      >
                        <LogOut className="w-4 h-4" />
                        {t.nav.logout}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="px-4 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 transition-colors text-sm font-medium"
              >
                {t.nav.signIn}
              </Link>
              <Link
                href="/register"
                className="hidden sm:block px-4 py-1.5 rounded-full bg-[#E50914] hover:bg-[#E50914]/90 transition-colors text-sm font-medium text-white"
              >
                {t.nav.signUp}
              </Link>
            </div>
          )}

          <button
            onClick={toggleLanguage}
            className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 transition-colors text-sm font-medium"
          >
            <Globe className="w-4 h-4 text-white/70" />
            <span className="uppercase">{language}</span>
          </button>
        </div>
      </div>

      {/* Bottom Navigation Bar (Mobile Only) */}
      <div className="lg:hidden fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-md h-16 bg-[#141414]/80 backdrop-blur-2xl border border-white/10 rounded-3xl z-[100] flex items-center justify-around px-2 shadow-2xl shadow-black">
        <button 
          onClick={() => { router.push("/"); setIsSearchExpanded(false); setShowMoreMenu(false); }}
          className={`flex flex-col items-center gap-1 transition-colors ${pathname === "/" ? "text-[#E50914]" : "text-white/50"}`}
        >
          <Home className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase tracking-tighter">{t.nav.home}</span>
        </button>
        
        <button 
          onClick={() => { navigationHandler("movie"); setIsSearchExpanded(false); setShowMoreMenu(false); }}
          className={`flex flex-col items-center gap-1 transition-colors ${pathname.includes("/explore/movie") ? "text-[#E50914]" : "text-white/50"}`}
        >
          <Film className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase tracking-tighter">Films</span>
        </button>

        <button 
          onClick={() => { setIsSearchExpanded(true); setShowMoreMenu(false); }}
          className={`flex flex-col items-center gap-1 transition-colors ${isSearchExpanded ? "text-[#E50914]" : "text-white/50"}`}
        >
          <Search className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase tracking-tighter">Search</span>
        </button>

        <button 
          onClick={() => { navigationHandler("tv"); setIsSearchExpanded(false); setShowMoreMenu(false); }}
          className={`flex flex-col items-center gap-1 transition-colors ${pathname.includes("/explore/tv") ? "text-[#E50914]" : "text-white/50"}`}
        >
          <Tv className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase tracking-tighter">Séries</span>
        </button>

        <button 
          onClick={() => { setShowMoreMenu(!showMoreMenu); setIsSearchExpanded(false); }}
          className={`flex flex-col items-center gap-1 transition-colors ${showMoreMenu ? "text-[#E50914]" : "text-white/50"}`}
        >
          <Menu className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase tracking-tighter">Plus</span>
        </button>
      </div>

      {/* Mobile "More" Bottom Sheet */}
      <AnimatePresence>
        {showMoreMenu && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowMoreMenu(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[140] lg:hidden"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed bottom-0 left-0 right-0 bg-[#141414] border-t border-white/10 rounded-t-[2.5rem] z-[150] p-8 lg:hidden pb-32"
            >
              <div className="w-12 h-1.5 bg-white/10 rounded-full mx-auto mb-8" />
              
              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => { router.push("/animes"); setShowMoreMenu(false); }}
                  className="flex flex-col items-center gap-3 p-6 bg-white/5 rounded-3xl border border-white/5 hover:bg-white/10 transition-colors"
                >
                  <Sparkles className="w-8 h-8 text-[#E50914]" />
                  <span className="font-bold text-sm uppercase tracking-widest">{t.nav.animes}</span>
                </button>
                
                <button 
                  onClick={() => { router.push("/kdrama"); setShowMoreMenu(false); }}
                  className="flex flex-col items-center gap-3 p-6 bg-white/5 rounded-3xl border border-white/5 hover:bg-white/10 transition-colors"
                >
                  <Languages className="w-8 h-8 text-[#E50914]" />
                  <span className="font-bold text-sm uppercase tracking-widest">{t.nav.kdramas}</span>
                </button>

                {user && (
                  <button 
                    onClick={() => { router.push("/my-list"); setShowMoreMenu(false); }}
                    className="flex flex-col items-center gap-3 p-6 bg-white/5 rounded-3xl border border-white/5 hover:bg-white/10 transition-colors"
                  >
                    <Bookmark className="w-8 h-8 text-[#E50914]" />
                    <span className="font-bold text-sm uppercase tracking-widest">{t.nav.myList}</span>
                  </button>
                )}

                <button 
                  onClick={() => { toggleLanguage(); setShowMoreMenu(false); }}
                  className="flex flex-col items-center gap-3 p-6 bg-white/5 rounded-3xl border border-white/5 hover:bg-white/10 transition-colors"
                >
                  <Globe className="w-8 h-8 text-[#E50914]" />
                  <span className="font-bold text-sm uppercase tracking-widest">{language === 'fr' ? 'English' : 'Français'}</span>
                </button>
              </div>

              <div className="mt-8 pt-8 border-t border-white/5">
                {user ? (
                  <button 
                    onClick={() => { handleLogout(); setShowMoreMenu(false); }}
                    className="w-full flex items-center justify-center gap-3 py-4 text-red-500 font-bold uppercase tracking-widest"
                  >
                    <LogOut className="w-5 h-5" />
                    {t.nav.logout}
                  </button>
                ) : (
                  <div className="flex flex-col gap-3">
                    <button 
                      onClick={() => { router.push("/login"); setShowMoreMenu(false); }}
                      className="w-full py-4 bg-white/5 rounded-2xl font-bold uppercase tracking-widest"
                    >
                      {t.nav.signIn}
                    </button>
                    <button 
                      onClick={() => { router.push("/register"); setShowMoreMenu(false); }}
                      className="w-full py-4 bg-[#E50914] rounded-2xl font-bold uppercase tracking-widest"
                    >
                      {t.nav.signUp}
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Mobile Search Overlay */}
      <AnimatePresence>
        {isSearchExpanded && (
          <motion.div
            key="mobile-search-overlay"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed inset-0 bg-[#0A0A0A] z-[150] flex flex-col"
          >
            <div className="h-20 flex items-center gap-4 px-4 border-b border-white/10">
              <button 
                onClick={() => { setIsSearchExpanded(false); setQuery(""); }}
                className="p-2 text-white/70 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-6 h-6" />
              </button>
              <form onSubmit={handleSearchSubmit} className="flex-1 relative">
                <input
                  autoFocus
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t.nav.searchPlaceholder}
                  className="w-full bg-white/10 border border-white/10 rounded-full py-2.5 px-5 text-sm text-white placeholder:text-white/50 focus:outline-none focus:border-[#E50914] transition-all"
                />
                {query && (
                  <button 
                    type="button" 
                    onClick={() => setQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-white/50 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </form>
            </div>

            <div className="flex-1 overflow-y-auto p-4 md:p-8">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                  <Loader2 className="w-8 h-8 text-[#E50914] animate-spin" />
                  <span className="text-white/50 animate-pulse">{t.nav.loading}...</span>
                </div>
              ) : results.length > 0 ? (
                <div className="max-w-6xl mx-auto w-full">
                  {aiReasoning && (
                    <div className="p-4 md:p-6 bg-white/5 rounded-2xl border border-white/10 mb-6 md:mb-10">
                      <div className="flex items-center gap-2 mb-2">
                        <Sparkles className="w-4 h-4 text-[#E50914]" />
                        <p className="text-xs font-bold text-[#E50914] uppercase tracking-widest">AI Insights</p>
                      </div>
                      <p className="text-sm md:text-base text-white/80 italic leading-relaxed">{aiReasoning}</p>
                    </div>
                  )}
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                    {results.map((item) => {
                      const isMovie = item.media_type === "movie" || !item.media_type;
                      const title = item.title || item.name;
                      const date = item.release_date || item.first_air_date;
                      const year = date ? new Date(date).getFullYear() : "N/A";
                      const rating = item.vote_average ? item.vote_average.toFixed(1) : "NR";
                      const posterUrl = item.poster_path 
                        ? `https://image.tmdb.org/t/p/w342${item.poster_path}`
                        : "https://picsum.photos/seed/poster/342/513";

                      return (
                        <motion.div 
                          key={item.id}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          onClick={() => {
                            router.push(`/${isMovie ? "movie" : "tv"}/${item.id}`);
                            setIsSearchExpanded(false);
                          }}
                          className="flex gap-4 p-3 bg-white/5 hover:bg-white/10 rounded-2xl transition-all cursor-pointer group border border-white/5 hover:border-white/20"
                        >
                          <div className="relative w-24 md:w-28 aspect-[2/3] rounded-xl overflow-hidden flex-shrink-0 bg-zinc-900 shadow-lg">
                            <Image src={posterUrl} alt={title} fill className="object-cover group-hover:scale-110 transition-transform duration-500" referrerPolicy="no-referrer" />
                          </div>
                          <div className="flex flex-col justify-center flex-1 min-w-0">
                            <h4 className="text-white font-bold text-base md:text-lg line-clamp-2 group-hover:text-[#E50914] transition-colors">{title}</h4>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs md:text-sm text-white/50 mt-2">
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {year}
                              </span>
                              <span className="flex items-center gap-1">
                                <Star className="w-3 h-3 text-yellow-500 fill-current" />
                                {rating}
                              </span>
                              <span className="uppercase text-[10px] font-black border border-white/20 px-1.5 py-0.5 rounded bg-white/5">
                                {isMovie ? t.explore.exploreMovies : t.explore.exploreTv}
                              </span>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>

                  <button 
                    onClick={handleSearchSubmit}
                    className="w-full mt-10 py-5 text-center text-sm md:text-base font-black text-white/70 hover:text-white bg-white/5 hover:bg-white/10 rounded-2xl transition-all border border-white/5 uppercase tracking-widest"
                  >
                    {t.nav.searchResults} &quot;{query}&quot;
                  </button>
                </div>
              ) : query.trim() ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-6">
                    <Search className="w-10 h-10 text-white/20" />
                  </div>
                  <p className="text-white/50 text-lg">{t.nav.noResults} &quot;{query}&quot;</p>
                  <p className="text-white/30 text-sm mt-2">Essayez avec d&apos;autres mots-clés ou genres.</p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-center opacity-30">
                  <Search className="w-16 h-16 mb-6" />
                  <p className="text-xl font-medium">{t.nav.searchPlaceholder}...</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </header>
  );
};

export default Header;
