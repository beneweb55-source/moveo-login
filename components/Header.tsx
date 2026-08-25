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
        className={`fixed left-1/2 -translate-x-1/2 z-50 transition-all duration-500 ease-out flex items-center justify-center w-full px-4 sm:px-6 ${
          show === "top"
            ? "top-6 sm:top-8"
            : show === "show"
            ? "top-4 sm:top-6"
            : "-top-24"
        }`}
      >
        <div 
          className={`flex items-center justify-between gap-4 sm:gap-8 px-4 sm:px-6 h-14 sm:h-16 rounded-full bg-moveo-surface/70 backdrop-blur-2xl shadow-2xl border transition-all duration-500 ease-out w-full max-w-5xl ${
            show === "top" ? "border-transparent bg-transparent shadow-none" : "border-white/10"
          }`}
        >
          {/* Mobile Menu Toggle */}
          <button 
            className="xl:hidden p-2 -ml-2 text-moveo-text hover:text-white transition-colors"
            onClick={() => setIsMobileMenuOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Logo */}
          <Link href="/" className="flex items-center flex-shrink-0 hover:opacity-80 transition-opacity">
            <Logo />
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden xl:flex items-center gap-8">
            <ul className="flex items-center gap-6 text-[13px] font-medium tracking-wide uppercase text-white/70">
              <li className="cursor-pointer hover:text-white transition-colors" onClick={() => router.push("/")}>{t.nav.home}</li>
              <li className="cursor-pointer hover:text-white transition-colors" onClick={() => navigationHandler("movie")}>{t.nav.movies}</li>
              <li className="cursor-pointer hover:text-white transition-colors" onClick={() => navigationHandler("tv")}>{t.nav.tvShows}</li>
              <li className="cursor-pointer hover:text-white transition-colors" onClick={() => router.push("/animes")}>{t.nav.animes}</li>
              <li className="cursor-pointer hover:text-white transition-colors" onClick={() => router.push("/kdrama")}>{t.nav.kdramas}</li>
              {user && (
                <li className="cursor-pointer hover:text-white transition-colors" onClick={() => router.push("/my-list")}>{t.nav.myList}</li>
              )}
            </ul>
          </nav>

          {/* Right Section: Search & User */}
          <div className="flex items-center gap-3 sm:gap-5" ref={searchRef}>
            {/* Search */}
            <div className="relative group flex items-center">
              <button 
                className="xl:hidden p-2 text-white/70 hover:text-white transition-colors"
                onClick={() => setShowMobileSearch(true)}
              >
                <Search className="w-5 h-5" />
              </button>

              <form onSubmit={handleSearchSubmit} className="hidden xl:flex items-center relative overflow-hidden rounded-full bg-white/5 border border-white/5 focus-within:border-white/20 focus-within:bg-white/10 transition-all duration-300 w-48 focus-within:w-64">
                <div className="pl-3 pointer-events-none">
                  <Search className="h-4 w-4 text-white/50" />
                </div>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => query.trim() && setShowSearchDropdown(true)}
                  placeholder={t.nav.searchPlaceholder}
                  className="w-full bg-transparent py-2 pl-2 pr-8 text-xs text-white placeholder:text-white/40 focus:outline-none"
                />
                {query && (
                  <button 
                    type="button" 
                    onClick={() => setQuery("")}
                    className="absolute right-2 text-white/40 hover:text-white transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </form>

              {/* Desktop Search Dropdown */}
              <AnimatePresence>
                {showSearchDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.98 }}
                    transition={{ duration: 0.2 }}
                    className="hidden xl:block absolute top-full right-0 mt-4 w-96 bg-moveo-surface border border-moveo-border rounded-2xl shadow-2xl overflow-hidden z-[120] max-h-[60vh] overflow-y-auto"
                  >
                    {loading ? (
                      <div className="flex justify-center p-8">
                        <Loader2 className="w-5 h-5 text-white/50 animate-spin" />
                      </div>
                    ) : results.length > 0 ? (
                      <div className="flex flex-col py-2">
                        {aiReasoning && (
                          <div className="px-4 py-3 bg-white/5 border-b border-white/5 flex items-start gap-2">
                            <Sparkles className="w-4 h-4 text-white/70 shrink-0 mt-0.5" />
                            <span className="text-[11px] leading-relaxed text-white/70">
                              {aiReasoning}
                            </span>
                          </div>
                        )}
                        {results.map((item) => {
                          const isPerson = item.media_type === "person";
                          const isMovie = item.media_type === "movie" || (!item.media_type && !isPerson);
                          const title = item.title || item.name;
                          const year = (item.release_date || item.first_air_date) ? new Date(item.release_date || item.first_air_date).getFullYear() : "";
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
                              className="flex items-center gap-4 px-4 py-3 hover:bg-white/5 cursor-pointer transition-colors"
                            >
                              <div className={`relative flex-shrink-0 bg-white/5 overflow-hidden ${isPerson ? 'w-10 h-10 rounded-full' : 'w-10 h-14 rounded-md'}`}>
                                <Image src={posterUrl} alt={title} fill className="object-cover" referrerPolicy="no-referrer" />
                              </div>
                              <div className="flex flex-col">
                                <h4 className="text-white text-sm font-medium">{title}</h4>
                                <span className="text-xs text-white/40 mt-0.5">
                                  {year} {year && "•"} {isPerson ? (language === 'fr' ? 'Personne' : 'Person') : (isMovie ? t.nav.movies : t.nav.tvShows)}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="p-8 text-center text-white/40 text-xs">
                        {t.nav.noResults} &quot;{query}&quot;
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="w-px h-4 bg-white/10 hidden sm:block" />

            {/* User & Lang */}
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                onClick={toggleLanguage}
                className="hidden sm:flex text-[11px] font-bold text-white/50 hover:text-white transition-colors uppercase tracking-widest"
              >
                {language}
              </button>

              {user ? (
                <div className="relative" id="user-dropdown-container">
                  <button
                    onClick={() => setShowUserDropdown(!showUserDropdown)}
                    className="flex items-center justify-center w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 transition-colors border border-white/10 overflow-hidden"
                  >
                    {user.avatar_url ? (
                      <Image src={user.avatar_url} alt={user.name} fill className="object-cover" />
                    ) : (
                      <span className="text-xs font-bold text-white/80">{user.name?.charAt(0).toUpperCase()}</span>
                    )}
                  </button>

                  <AnimatePresence>
                    {showUserDropdown && (
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        className="absolute top-full right-0 mt-4 w-56 bg-moveo-surface border border-moveo-border rounded-2xl shadow-2xl overflow-hidden z-50 py-2"
                      >
                        <div className="px-4 py-3 border-b border-white/5 mb-2">
                          <p className="text-sm font-medium text-white">{user.name}</p>
                          <p className="text-xs text-white/40 truncate mt-0.5">{user.email}</p>
                        </div>
                        <Link href="/profile" className="flex items-center gap-3 px-4 py-2 text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors">
                          <User className="w-4 h-4" /> {t.nav.profile}
                        </Link>
                        {user.permissions?.includes('access_admin_panel') && (
                          <Link href="/admin" className="flex items-center gap-3 px-4 py-2 text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors">
                            <Shield className="w-4 h-4" /> Admin
                          </Link>
                        )}
                        <button
                          onClick={handleLogout}
                          className="w-full flex items-center gap-3 px-4 py-2 text-sm text-white/50 hover:text-white hover:bg-white/5 transition-colors text-left"
                        >
                          <LogOut className="w-4 h-4" /> {t.nav.logout}
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ) : (
                <Link
                  href="/login"
                  className="text-xs font-medium text-white hover:text-white/70 transition-colors tracking-wide"
                >
                  {t.nav.signIn}
                </Link>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Search Overlay */}
      <AnimatePresence>
        {showMobileSearch && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="xl:hidden fixed inset-0 bg-moveo-bg z-[100] flex flex-col"
          >
            <div className="flex items-center gap-3 p-4 border-b border-moveo-border">
              <button 
                onClick={() => { setShowMobileSearch(false); setQuery(""); }}
                className="p-2 text-white/50 hover:text-white"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <form onSubmit={(e) => { handleSearchSubmit(e); setShowMobileSearch(false); }} className="flex-1">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t.nav.searchPlaceholder}
                  autoFocus
                  className="w-full bg-transparent text-white placeholder:text-white/30 focus:outline-none text-lg font-light"
                />
              </form>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4">
              {loading ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="w-6 h-6 text-white/30 animate-spin" />
                </div>
              ) : results.length > 0 ? (
                <div className="flex flex-col gap-1">
                  {results.map((item) => {
                    const isPerson = item.media_type === "person";
                    const isMovie = item.media_type === "movie" || (!item.media_type && !isPerson);
                    const title = item.title || item.name;
                    const year = (item.release_date || item.first_air_date) ? new Date(item.release_date || item.first_air_date).getFullYear() : "";
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
                        className="flex items-center gap-4 p-3 rounded-xl hover:bg-white/5 active:bg-white/10 transition-colors"
                      >
                        <div className={`relative flex-shrink-0 bg-white/5 overflow-hidden ${isPerson ? 'w-12 h-12 rounded-full' : 'w-12 h-16 rounded-lg'}`}>
                          <Image src={posterUrl} alt={title} fill className="object-cover" referrerPolicy="no-referrer" />
                        </div>
                        <div className="flex flex-col">
                          <h4 className="text-white font-medium">{title}</h4>
                          <span className="text-xs text-white/40">{year} • {isPerson ? 'Person' : (isMovie ? 'Movie' : 'TV')}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : query ? (
                <div className="text-center text-white/30 mt-12 text-sm">
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
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="xl:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
            />
            
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", bounce: 0, duration: 0.5 }}
              className="xl:hidden fixed inset-y-0 left-0 w-[85%] max-w-sm bg-moveo-bg border-r border-moveo-border z-[110] flex flex-col"
            >
              <div className="p-6 border-b border-white/5 flex items-center justify-between">
                <Logo />
                <button 
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-2 text-white/50 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto py-6 px-4 flex flex-col gap-2">
                <Link href="/" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-white/5 text-white/80 hover:text-white transition-colors">
                  <span className="font-medium">{t.nav.home}</span>
                </Link>
                <button onClick={() => { navigationHandler("movie"); setIsMobileMenuOpen(false); }} className="flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-white/5 text-white/80 hover:text-white transition-colors w-full text-left">
                  <span className="font-medium">{t.nav.movies}</span>
                </button>
                <button onClick={() => { navigationHandler("tv"); setIsMobileMenuOpen(false); }} className="flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-white/5 text-white/80 hover:text-white transition-colors w-full text-left">
                  <span className="font-medium">{t.nav.tvShows}</span>
                </button>
                <Link href="/animes" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-white/5 text-white/80 hover:text-white transition-colors">
                  <span className="font-medium">{t.nav.animes}</span>
                </Link>
                <Link href="/kdrama" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-white/5 text-white/80 hover:text-white transition-colors">
                  <span className="font-medium">{t.nav.kdramas}</span>
                </Link>
                
                {user && (
                  <>
                    <div className="h-px bg-white/5 my-4 mx-4" />
                    <Link href="/my-list" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-white/5 text-white/80 hover:text-white transition-colors">
                      <span className="font-medium">{t.nav.myList}</span>
                    </Link>
                    <Link href="/profile" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-white/5 text-white/80 hover:text-white transition-colors">
                      <span className="font-medium">{t.nav.profile}</span>
                    </Link>
                    {user.permissions?.includes('access_admin_panel') && (
                      <Link href="/admin" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-4 px-4 py-3 rounded-xl text-white/50 hover:text-white transition-colors">
                        <span className="font-medium">Admin</span>
                      </Link>
                    )}
                  </>
                )}
              </div>

              <div className="p-6 border-t border-white/5 flex flex-col gap-4">
                <button
                  onClick={toggleLanguage}
                  className="flex items-center justify-between px-4 py-3 rounded-xl border border-white/10 hover:bg-white/5 transition-colors"
                >
                  <span className="text-sm font-medium text-white/70">Language</span>
                  <span className="uppercase text-xs font-bold tracking-widest text-white">{language}</span>
                </button>

                {!user && (
                  <Link
                    href="/login"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="text-center py-3 rounded-xl bg-white text-black font-semibold text-sm transition-opacity hover:opacity-90"
                  >
                    {t.nav.signIn}
                  </Link>
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
