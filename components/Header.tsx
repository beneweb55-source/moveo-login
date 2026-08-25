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
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [aiReasoning, setAiReasoning] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [stats, setStats] = useState({ watchlist: 0, favorites: 0, watched: 0 });
  
  
  const router = useRouter();
  const pathname = usePathname();
  const searchRef = useRef<HTMLDivElement>(null);
  const { language, t, toggleLanguage } = useLanguage();

  const [showMobileSearch, setShowMobileSearch] = useState(false);

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
        if (window.scrollY > lastScrollY && !showSearchDropdown && !showUserDropdown) {
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
  }, [lastScrollY, showSearchDropdown, showUserDropdown]);

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
    if (type === "movie") {
      router.push("/films");
    } else {
      router.push("/series");
    }
  };

  const [placeholder, setPlaceholder] = useState(t.nav.searchPlaceholder);

  return (
    <>
      <header
        className={`fixed top-0 w-full h-16 xl:h-20 z-50 transition-all duration-300 ease-in-out ${
        show === "top"
          ? "bg-gradient-to-b from-black/80 to-transparent backdrop-blur-sm"
          : show === "show"
          ? "bg-black/90 backdrop-blur-md shadow-lg border-b border-white/5"
          : "-translate-y-full"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 xl:px-8 h-full flex items-center justify-between gap-4">
        {/* Left Section: Mobile Menu Toggle & Logo */}
        <div className="flex items-center gap-4">
          {/* Hamburger Menu (Mobile/Tablet) */}
          <button 
            className="xl:hidden p-1.5 -ml-1.5 text-white/80 hover:text-white transition-colors"
            onClick={() => setIsMobileMenuOpen(true)}
          >
            <Menu className="w-6 h-6" />
          </button>

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 cursor-pointer flex-shrink-0 hover:scale-105 transition-transform duration-300">
            <Logo />
          </Link>
        </div>

        {/* Desktop Navigation */}
        <ul className="hidden xl:flex items-center gap-6 font-medium text-sm text-white/80">
          <li className="cursor-pointer hover:text-white transition-colors" onClick={() => router.push("/")}>{t.nav.home}</li>
          <li className="cursor-pointer hover:text-white transition-colors" onClick={() => navigationHandler("movie")}>{t.nav.movies}</li>
          <li className="cursor-pointer hover:text-white transition-colors" onClick={() => navigationHandler("tv")}>{t.nav.tvShows}</li>
          <li className="cursor-pointer hover:text-white transition-colors" onClick={() => router.push("/animes")}>{t.nav.animes}</li>
          <li className="cursor-pointer hover:text-white transition-colors" onClick={() => router.push("/kdrama")}>{t.nav.kdramas}</li>
          {user && (
            <li className="cursor-pointer hover:text-white transition-colors" onClick={() => router.push("/my-list")}>{t.nav.myList}</li>
          )}
        </ul>

        {/* Center/Right Section: Search */}
        <div className="flex-1 flex justify-end xl:justify-center max-w-2xl transition-all duration-500 ease-in-out relative" ref={searchRef}>
          {/* Mobile Search Icon */}
          <button 
            className="xl:hidden p-2 text-white/80 hover:text-white transition-colors"
            onClick={() => setShowMobileSearch(true)}
          >
            <Search className="w-5 h-5" />
          </button>

          {/* Desktop Search Bar */}
          <form onSubmit={handleSearchSubmit} className="hidden xl:block relative group w-full">
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
                className="hidden xl:block absolute top-full left-0 right-0 mt-2 bg-black border border-white/10 rounded-xl shadow-2xl overflow-hidden z-[120] max-h-[70vh] overflow-y-auto"
              >
                {/* ... (Search Results Content) ... */}
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
                          onClick={() => {
                            router.push(`/${isPerson ? "person" : isMovie ? "movie" : "tv"}/${item.id}`);
                            setShowSearchDropdown(false);
                          }}
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
                                {isPerson ? (language === 'fr' ? 'Personne' : 'Person') : (isMovie ? t.nav.movies : t.nav.tvShows)}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div 
                      onClick={handleSearchSubmit}
                      className="p-3 text-center text-sm text-white/70 hover:text-white hover:bg-white/5 cursor-pointer transition-colors truncate"
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

        {/* Right Section: User/Auth & Language (Desktop only) */}
        <div className="hidden xl:flex items-center gap-4">
          {user ? (
            <div className="flex items-center relative" id="user-dropdown-container">
              <button
                onClick={() => setShowUserDropdown(!showUserDropdown)}
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
                <span className="text-sm font-medium text-white/90 mr-1">
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
                    className="absolute top-full right-0 mt-2 w-56 bg-black border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 py-2"
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
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-[#E50914] hover:bg-[#E50914]/10 transition-colors cursor-pointer"
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
                className="px-4 py-1.5 rounded-full bg-[#E50914] hover:bg-[#E50914]/90 transition-colors text-sm font-medium text-white"
              >
                {t.nav.signUp}
              </Link>
            </div>
          )}

          <button
            onClick={toggleLanguage}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 transition-colors text-sm font-medium cursor-pointer"
          >
            <Globe className="w-4 h-4 text-white/70" />
            <span className="uppercase">{language}</span>
          </button>
        </div>
      </div>
    </header>

    {/* Mobile Search Overlay */}
    <AnimatePresence>
      {showMobileSearch && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="xl:hidden fixed inset-0 bg-black z-[100] flex flex-col"
        >
            <div className="flex items-center gap-3 p-4 border-b border-white/10">
              <button 
                onClick={() => { setShowMobileSearch(false); setQuery(""); }}
                className="p-2 text-white/70 hover:text-white"
              >
                <ArrowLeft className="w-6 h-6" />
              </button>
              <form onSubmit={(e) => { handleSearchSubmit(e); setShowMobileSearch(false); }} className="flex-1 relative">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t.nav.searchPlaceholder}
                  autoFocus
                  className="w-full bg-transparent text-white placeholder:text-white/50 focus:outline-none text-lg"
                />
                {query && (
                  <button 
                    type="button" 
                    onClick={() => setQuery("")}
                    className="absolute right-0 top-1/2 -translate-y-1/2 p-2 text-white/50 hover:text-white"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
              </form>
            </div>
            
            {/* Mobile Search Results */}
            <div className="flex-1 overflow-y-auto p-4">
              {loading ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="w-8 h-8 text-[#E50914] animate-spin" />
                </div>
              ) : results.length > 0 ? (
                <div className="flex flex-col gap-4">
                  {results.map((item) => {
                    const isPerson = item.media_type === "person";
                    const isMovie = item.media_type === "movie" || (!item.media_type && !isPerson);
                    const title = item.title || item.name;
                    const year = (item.release_date || item.first_air_date) ? new Date(item.release_date || item.first_air_date).getFullYear() : "N/A";
                    const posterUrl = isPerson
                      ? (item.profile_path ? `https://image.tmdb.org/t/p/w92${item.profile_path}` : "https://picsum.photos/seed/poster/92/138")
                      : (item.poster_path ? `https://image.tmdb.org/t/p/w92${item.poster_path}` : "https://picsum.photos/seed/poster/92/138");

                    return (
                      <div 
                        key={item.id}
                        onClick={() => {
                          router.push(`/${isPerson ? "person" : isMovie ? "movie" : "tv"}/${item.id}`);
                          setShowMobileSearch(false);
                          setQuery("");
                        }}
                        className="flex items-center gap-4"
                      >
                        <div className={`relative flex-shrink-0 bg-[#2a2a2a] overflow-hidden ${isPerson ? 'w-12 h-12 rounded-full' : 'w-12 h-16 rounded'}`}>
                          <Image src={posterUrl} alt={title} fill className="object-cover" referrerPolicy="no-referrer" />
                        </div>
                        <div className="flex flex-col">
                          <h4 className="text-white font-medium">{title}</h4>
                          <span className="text-sm text-white/50">{year} • {isPerson ? 'Person' : (isMovie ? 'Movie' : 'TV')}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : query ? (
                <div className="text-center text-white/50 mt-8">
                  {t.nav.noResults} &quot;{query}&quot;
                </div>
              ) : null}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Menu Drawer */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="xl:hidden fixed inset-0 bg-black/80 backdrop-blur-sm z-[100]"
            />
            
            {/* Drawer */}
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", bounce: 0, duration: 0.4 }}
              className="xl:hidden fixed inset-y-0 left-0 w-[80%] max-w-sm bg-black border-r border-white/10 z-[110] flex flex-col overflow-y-auto"
            >
              <div className="p-4 border-b border-white/10 flex items-center justify-between">
                <Logo />
                <button 
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-2 text-white/70 hover:text-white bg-white/5 rounded-full"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* User Profile Section (Mobile) */}
              <div className="p-6 border-b border-white/10">
                {user ? (
                  <div className="flex items-center gap-4">
                    {user.avatar_url ? (
                      <div className="w-12 h-12 rounded-full overflow-hidden relative border border-white/10">
                        <Image src={user.avatar_url} alt={user.name} fill className="object-cover" referrerPolicy="no-referrer" />
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-[#E50914] to-purple-600 flex items-center justify-center text-white font-bold text-xl">
                        {user.name?.charAt(0).toUpperCase() || 'U'}
                      </div>
                    )}
                    <div className="flex flex-col">
                      <span className="font-bold text-white text-lg">{user.name}</span>
                      <span className="text-sm text-white/50">{user.email}</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <p className="text-sm text-white/70 mb-2">Connectez-vous pour plus de fonctionnalités</p>
                    <div className="flex gap-3">
                      <Link
                        href="/login"
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="flex-1 text-center py-2.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-sm font-medium text-white"
                      >
                        {t.nav.signIn}
                      </Link>
                      <Link
                        href="/register"
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="flex-1 text-center py-2.5 rounded-lg bg-[#E50914] hover:bg-[#E50914]/90 transition-colors text-sm font-medium text-white shadow-lg shadow-red-500/20"
                      >
                        {t.nav.signUp}
                      </Link>
                    </div>
                  </div>
                )}
              </div>

              {/* Navigation Links (Mobile) */}
              <div className="flex-1 py-4 flex flex-col gap-1 px-3">
                <Link href="/" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-white/5 text-white/80 hover:text-white transition-colors">
                  <Home className="w-5 h-5 text-white/50" />
                  <span className="font-medium">{t.nav.home}</span>
                </Link>
                <button onClick={() => { navigationHandler("movie"); setIsMobileMenuOpen(false); }} className="flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-white/5 text-white/80 hover:text-white transition-colors w-full text-left">
                  <Film className="w-5 h-5 text-white/50" />
                  <span className="font-medium">{t.nav.movies}</span>
                </button>
                <button onClick={() => { navigationHandler("tv"); setIsMobileMenuOpen(false); }} className="flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-white/5 text-white/80 hover:text-white transition-colors w-full text-left">
                  <Tv className="w-5 h-5 text-white/50" />
                  <span className="font-medium">{t.nav.tvShows}</span>
                </button>
                <Link href="/animes" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-white/5 text-white/80 hover:text-white transition-colors">
                  <Sparkles className="w-5 h-5 text-white/50" />
                  <span className="font-medium">{t.nav.animes}</span>
                </Link>
                <Link href="/kdrama" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-white/5 text-white/80 hover:text-white transition-colors">
                  <Globe className="w-5 h-5 text-white/50" />
                  <span className="font-medium">{t.nav.kdramas}</span>
                </Link>
                
                {user && (
                  <>
                    <div className="h-px bg-white/10 my-2 mx-4" />
                    <Link href="/my-list" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-white/5 text-white/80 hover:text-white transition-colors">
                      <Bookmark className="w-5 h-5 text-white/50" />
                      <span className="font-medium">{t.nav.myList}</span>
                    </Link>
                    <Link href="/profile" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-white/5 text-white/80 hover:text-white transition-colors">
                      <User className="w-5 h-5 text-white/50" />
                      <span className="font-medium">{t.nav.profile}</span>
                    </Link>
                    {user.permissions?.includes('access_admin_panel') && (
                      <Link href="/admin" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-red-500/10 text-red-500 transition-colors">
                        <Shield className="w-5 h-5" />
                        <span className="font-medium">Panel Admin</span>
                      </Link>
                    )}
                  </>
                )}
              </div>

              {/* Footer Actions (Mobile) */}
              <div className="p-4 border-t border-white/10 flex flex-col gap-2">
                <button
                  onClick={toggleLanguage}
                  className="flex items-center justify-between px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
                >
                  <div className="flex items-center gap-3 text-white/80">
                    <Languages className="w-5 h-5" />
                    <span className="font-medium">Langue</span>
                  </div>
                  <span className="uppercase text-xs font-bold bg-white/10 px-2 py-1 rounded">{language}</span>
                </button>

                {user && (
                  <button
                    onClick={() => { handleLogout(); setIsMobileMenuOpen(false); }}
                    className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors font-medium mt-2"
                  >
                    <LogOut className="w-5 h-5" />
                    {t.nav.logout}
                  </button>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

export default Header;
