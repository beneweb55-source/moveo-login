"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Search, Menu, X, PlayCircle, Star, Loader2, Globe, User, LogOut, Settings, Heart, Eye, Bookmark, Shield, ArrowLeft, Home, Film, Tv, Sparkles, Languages, Info, Calendar } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence } from "motion/react";
import { Logo } from "@/components/Logo";
import { useLanguage } from "@/context/LanguageContext";
import { useDeviceOS } from "@/hooks/useDeviceOS";
import BottomSheet from "@/components/BottomSheet";

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
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  
  const router = useRouter();
  const pathname = usePathname();
  const searchRef = useRef<HTMLDivElement>(null);
  const { language, t, toggleLanguage } = useLanguage();
  const os = useDeviceOS();

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
    setMobileSearchOpen(false);
    setQuery("");
  }, [pathname]);

  useEffect(() => {
    const controlNavbar = () => {
      if (window.scrollY > 100) {
        if (window.scrollY > lastScrollY && !showSearchDropdown && !showUserDropdown && !mobileSearchOpen) {
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
  }, [lastScrollY, showSearchDropdown, showUserDropdown, mobileSearchOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSearchDropdown(false);
      }
      const userDropdownEl = document.getElementById('user-dropdown-container');
      if (userDropdownEl && !userDropdownEl.contains(event.target as Node)) {
        setShowUserDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
        const words = query.trim().split(/\s+/).length;
        const keywords = ["dans", "in", "about", "sur", "with", "avec", "film", "movie", "serie", "show", "triste", "sad", "funny", "drôle", "peur", "scary", "love", "amour", "space", "espace", "action", "aventure", "adventure", "comedy", "comédie", "drama", "drame", "fantasy", "fantastique", "horror", "horreur", "sci-fi", "science-fiction", "thriller", "western", "war", "guerre", "crime", "music", "musique", "mystery", "mystère", "romance", "romantique", "documentary", "documentaire", "family", "famille", "history", "histoire", "animation", "top", "best", "meilleur", "pire", "worst", "like", "comme", "style", "genre", "vibe", "mood", "ambiance"];
        const hasKeyword = keywords.some(k => query.toLowerCase().includes(k));
        const isSemantic = words >= 3 || hasKeyword;
        const endpoint = isSemantic ? '/api/ai-search' : '/api/tmdb-proxy';

        const res = await fetch(`${endpoint}?q=${encodeURIComponent(query)}&language=${langParam}`);
        const data = await res.json();
        
        if (data.ai_reasoning) setAiReasoning(data.ai_reasoning);
        else setAiReasoning("");

        const filteredResults = (data.results || [])
          .filter((item: any) => {
            if (item.media_type === 'person') return !!item.profile_path;
            if (!item.poster_path) return false;
            const date = item.release_date || item.first_air_date;
            if (!date) return false;
            return true;
          })
          .filter((item: any, index: number, self: any[]) =>
            index === self.findIndex((t: any) => t.id === item.id)
          );
        setResults(filteredResults.slice(0, 5));
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
      setMobileSearchOpen(false);
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

  const isIOS = os === 'ios';
  const isAndroid = os === 'android';

  return (
    <>
      {/* Top Header */}
      <header
        className={`fixed top-0 w-full h-16 md:h-20 z-50 transition-all duration-300 ease-in-out pt-safe ${
          show === "top"
            ? "bg-gradient-to-b from-black/80 to-transparent"
            : show === "show"
            ? isIOS ? "ios-blur bg-black/40" : "bg-[#0A0A0A]/95 shadow-lg border-b border-white/5"
            : "-translate-y-full"
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 md:px-8 h-full flex items-center justify-between gap-4">
          {/* Logo - Left on Mobile, Center/Left on Tablet */}
          <Link href="/" className="flex items-center gap-2 cursor-pointer flex-shrink-0 hover:scale-105 transition-transform duration-300">
            <Logo className="h-6 md:h-8" />
          </Link>

          {/* Desktop Navigation */}
          <ul className="hidden lg:flex items-center gap-6 font-medium text-sm text-white/80">
            <li className="cursor-pointer hover:text-white transition-colors" onClick={() => router.push("/")}>{t.nav.home}</li>
            <li className="cursor-pointer hover:text-white transition-colors" onClick={() => router.push("/explore/movie")}>{t.nav.movies}</li>
            <li className="cursor-pointer hover:text-white transition-colors" onClick={() => router.push("/explore/tv")}>{t.nav.tvShows}</li>
            <li className="cursor-pointer hover:text-white transition-colors" onClick={() => router.push("/animes")}>{t.nav.animes}</li>
            <li className="cursor-pointer hover:text-white transition-colors" onClick={() => router.push("/kdrama")}>{t.nav.kdramas}</li>
          </ul>

          {/* Search Bar - Desktop Only */}
          <div className="hidden lg:flex flex-1 max-w-xl relative" ref={searchRef}>
            <form onSubmit={handleSearchSubmit} className="relative group w-full">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-white/50 group-focus-within:text-white transition-colors" />
              </div>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => query.trim() && setShowSearchDropdown(true)}
                placeholder={t.nav.searchPlaceholder}
                className="w-full bg-white/10 border border-white/10 rounded-full py-2 pl-10 pr-10 text-sm text-white placeholder:text-white/50 focus:outline-none focus:border-white/30 focus:bg-black/80 transition-all duration-300"
              />
            </form>

            {/* Search Dropdown */}
            <AnimatePresence>
              {showSearchDropdown && (query.trim() !== "") && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute top-full left-0 right-0 mt-2 bg-[#141414] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50"
                >
                  {loading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 text-[#E50914] animate-spin" />
                    </div>
                  ) : results.length > 0 ? (
                    <div className="max-h-[70vh] overflow-y-auto py-2">
                      {aiReasoning && (
                        <div className="px-4 py-3 mx-2 mb-2 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-start gap-3">
                          <Sparkles className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                          <p className="text-xs text-blue-200/80 leading-relaxed">{aiReasoning}</p>
                        </div>
                      )}
                      {results.map((item) => (
                        <div
                          key={item.id}
                          onClick={() => {
                            router.push(`/${item.media_type === "person" ? "person" : (item.media_type === "movie" || !item.media_type) ? "movie" : "tv"}/${item.id}`);
                            setShowSearchDropdown(false);
                          }}
                          className="flex items-center gap-4 px-4 py-2 hover:bg-white/5 cursor-pointer transition-colors"
                        >
                          <div className={`relative flex-shrink-0 bg-zinc-800 overflow-hidden ${item.media_type === 'person' ? 'w-10 h-10 rounded-full' : 'w-10 h-14 rounded-md'}`}>
                            <Image 
                              src={item.poster_path || item.profile_path ? `https://image.tmdb.org/t/p/w92${item.poster_path || item.profile_path}` : "https://picsum.photos/seed/poster/92/138"} 
                              alt={item.title || item.name} 
                              fill 
                              className="object-cover" 
                              referrerPolicy="no-referrer" 
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-white text-sm font-medium truncate">{item.title || item.name}</h4>
                            <p className="text-white/50 text-xs mt-0.5">
                              {item.release_date || item.first_air_date ? new Date(item.release_date || item.first_air_date).getFullYear() : item.known_for_department}
                              {" • "}
                              <span className="uppercase">{item.media_type === 'movie' ? t.explore.exploreMovies : item.media_type === 'tv' ? t.explore.exploreTv : 'Personne'}</span>
                            </p>
                          </div>
                        </div>
                      ))}
                      <div 
                        onClick={() => {
                          router.push(`/search/${query}`);
                          setShowSearchDropdown(false);
                        }}
                        className="px-4 py-3 mt-2 border-t border-white/5 text-center text-sm text-[#E50914] hover:bg-white/5 cursor-pointer transition-colors"
                      >
                        Voir tous les résultats pour &quot;{query}&quot;
                      </div>
                    </div>
                  ) : (
                    <div className="py-8 text-center text-white/50 text-sm">
                      Aucun résultat pour &quot;{query}&quot;
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 md:gap-4">
            {/* Mobile/Tablet Search Icon */}
            <button 
              onClick={() => setMobileSearchOpen(true)}
              className="lg:hidden p-2 text-white/80 hover:text-white touch-target"
            >
              <Search className="w-6 h-6" />
            </button>

            {/* Language Switch - Hidden on small mobile */}
            <button
              onClick={toggleLanguage}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 transition-colors text-xs font-medium cursor-pointer"
            >
              <Globe className="w-3.5 h-3.5 text-white/70" />
              <span className="uppercase">{language}</span>
            </button>

            {/* User Profile */}
            {user ? (
              <div className="relative" id="user-dropdown-container">
                <button
                  onClick={() => setShowUserDropdown(!showUserDropdown)}
                  className="flex items-center gap-2 hover:bg-white/5 p-1 rounded-full transition-colors touch-target"
                >
                  <div className={`w-8 h-8 rounded-full overflow-hidden relative border border-white/10 ${!user.avatar_url && 'bg-gradient-to-tr from-[#E50914] to-purple-600 flex items-center justify-center text-white font-bold text-sm'}`}>
                    {user.avatar_url ? (
                      <Image src={user.avatar_url} alt={user.name} fill className="object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      user.name?.charAt(0).toUpperCase() || 'U'
                    )}
                  </div>
                </button>
                
                <AnimatePresence>
                  {showUserDropdown && os === 'desktop' && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className={`absolute top-full right-0 mt-2 w-56 rounded-2xl shadow-2xl overflow-hidden z-50 py-2 border border-white/10 bg-[#141414]`}
                    >
                      <div className="px-4 py-3 border-b border-white/5 mb-2">
                        <p className="text-sm text-white font-medium">{user.name}</p>
                        <p className="text-xs text-white/50 truncate">{user.email}</p>
                      </div>
                      <Link href="/profile" className="flex items-center gap-3 px-4 py-2.5 text-sm text-white/80 hover:text-white hover:bg-white/5">
                        <User className="w-4 h-4" /> {t.nav.profile}
                      </Link>
                      {user.permissions?.includes('access_admin_panel') && (
                        <Link href="/admin" className="flex items-center gap-3 px-4 py-2.5 text-sm font-bold text-red-500 hover:bg-red-500/10">
                          <Shield className="w-4 h-4" /> Panel Admin
                        </Link>
                      )}
                      <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-[#E50914] hover:bg-[#E50914]/10 text-left">
                        <LogOut className="w-4 h-4" /> {t.nav.logout}
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Mobile User Bottom Sheet */}
                <BottomSheet
                  isOpen={showUserDropdown && os !== 'desktop'}
                  onClose={() => setShowUserDropdown(false)}
                  title={user.name}
                >
                  <div className="flex flex-col gap-1 p-2">
                    <div className="px-4 py-3 mb-2 bg-white/5 rounded-xl">
                      <p className="text-sm text-white font-medium">{user.name}</p>
                      <p className="text-xs text-white/50 truncate">{user.email}</p>
                    </div>
                    
                    <Link 
                      href="/profile" 
                      onClick={() => setShowUserDropdown(false)}
                      className="flex items-center gap-4 px-4 py-4 text-base text-white/80 active:bg-white/10 rounded-xl transition-colors"
                    >
                      <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-500">
                        <User className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <p className="font-bold">{t.nav.profile}</p>
                        <p className="text-xs text-white/40">Gérer votre compte et vos listes</p>
                      </div>
                    </Link>

                    {user.permissions?.includes('access_admin_panel') && (
                      <Link 
                        href="/admin" 
                        onClick={() => setShowUserDropdown(false)}
                        className="flex items-center gap-4 px-4 py-4 text-base text-red-500 active:bg-red-500/10 rounded-xl transition-colors"
                      >
                        <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                          <Shield className="w-5 h-5" />
                        </div>
                        <div className="flex-1">
                          <p className="font-bold">Panel Admin</p>
                          <p className="text-xs text-red-500/60">Gestion de la plateforme</p>
                        </div>
                      </Link>
                    )}

                    <button 
                      onClick={() => {
                        handleLogout();
                        setShowUserDropdown(false);
                      }}
                      className="flex items-center gap-4 px-4 py-4 text-base text-[#E50914] active:bg-[#E50914]/10 rounded-xl transition-colors text-left"
                    >
                      <div className="w-10 h-10 rounded-full bg-[#E50914]/20 flex items-center justify-center">
                        <LogOut className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <p className="font-bold">{t.nav.logout}</p>
                        <p className="text-xs text-[#E50914]/60">Se déconnecter de Moveo</p>
                      </div>
                    </button>
                  </div>
                </BottomSheet>
              </div>
            ) : (
              <Link href="/login" className="hidden sm:flex items-center gap-2 px-4 py-2 bg-[#E50914] hover:bg-[#E50914]/80 text-white rounded-full text-sm font-medium transition-colors">
                <User className="w-4 h-4" />
                <span>{t.nav?.signIn || "Connexion"}</span>
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Bottom Navigation - Native App Style */}
      <nav className={`lg:hidden fixed bottom-0 left-0 right-0 h-16 z-50 pb-safe transition-transform duration-300 ${isIOS ? 'ios-blur bg-black/60 border-t border-white/10' : 'android-surface border-t border-white/5'} ${show === "hide" ? 'translate-y-full' : 'translate-y-0'}`}>
        <div className="h-full max-w-md mx-auto flex items-center justify-around px-2">
          <Link href="/" className={`flex flex-col items-center gap-1 p-2 transition-colors w-full ${pathname === '/' ? 'text-[#E50914]' : 'text-white/50'}`}>
            <Home className="w-5 h-5 sm:w-6 sm:h-6" />
            <span className="text-[9px] sm:text-[10px] font-medium uppercase tracking-tight">{t.nav.home}</span>
          </Link>
          <Link href="/explore/movie" className={`flex flex-col items-center gap-1 p-2 transition-colors w-full ${pathname.includes('/movie') ? 'text-[#E50914]' : 'text-white/50'}`}>
            <Film className="w-5 h-5 sm:w-6 sm:h-6" />
            <span className="text-[9px] sm:text-[10px] font-medium uppercase tracking-tight">{t.nav.movies}</span>
          </Link>
          <Link href="/explore/tv" className={`flex flex-col items-center gap-1 p-2 transition-colors w-full ${pathname.includes('/tv') ? 'text-[#E50914]' : 'text-white/50'}`}>
            <Tv className="w-5 h-5 sm:w-6 sm:h-6" />
            <span className="text-[9px] sm:text-[10px] font-medium uppercase tracking-tight">{t.nav.tvShows}</span>
          </Link>
          <Link href="/my-list" className={`flex flex-col items-center gap-1 p-2 transition-colors w-full ${pathname === '/my-list' ? 'text-[#E50914]' : 'text-white/50'}`}>
            <Bookmark className="w-5 h-5 sm:w-6 sm:h-6" />
            <span className="text-[9px] sm:text-[10px] font-medium uppercase tracking-tight">{t.nav.myList}</span>
          </Link>
          <Link href={user ? "/profile" : "/login"} className={`flex flex-col items-center gap-1 p-2 transition-colors w-full ${pathname === '/profile' ? 'text-[#E50914]' : 'text-white/50'}`}>
            <User className="w-5 h-5 sm:w-6 sm:h-6" />
            <span className="text-[9px] sm:text-[10px] font-medium uppercase tracking-tight">{t.nav.profile}</span>
          </Link>
        </div>
      </nav>

      {/* Mobile Search Overlay */}
      <AnimatePresence>
        {mobileSearchOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed inset-0 z-[100] bg-black pt-safe flex flex-col"
          >
            <div className="p-4 flex items-center gap-3 border-b border-white/10">
              <button onClick={() => setMobileSearchOpen(false)} className="p-2 text-white/70 touch-target hover:bg-white/10 rounded-full transition-colors">
                <ArrowLeft className="w-6 h-6" />
              </button>
              <form onSubmit={handleSearchSubmit} className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                <input
                  autoFocus
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t.nav.searchPlaceholder}
                  className="w-full bg-white/10 border-none rounded-full py-2.5 pl-10 pr-10 text-white focus:outline-none focus:ring-2 focus:ring-[#E50914] transition-all"
                />
                {query && (
                  <button type="button" onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-white/50">
                    <X className="w-5 h-5" />
                  </button>
                )}
              </form>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-20">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                  <Loader2 className="w-10 h-10 text-[#E50914] animate-spin" />
                  <span className="text-white/50 text-sm">Recherche en cours...</span>
                </div>
              ) : results.length > 0 ? (
                <div className="space-y-4 pt-4">
                  {results.map((item) => (
                    <div 
                      key={item.id}
                      onClick={() => {
                        router.push(`/${item.media_type === "person" ? "person" : (item.media_type === "movie" || !item.media_type) ? "movie" : "tv"}/${item.id}`);
                        setMobileSearchOpen(false);
                      }}
                      className="flex items-center gap-4 p-2 bg-white/5 rounded-xl active:scale-95 transition-transform"
                    >
                      <div className={`relative flex-shrink-0 bg-zinc-800 overflow-hidden ${item.media_type === 'person' ? 'w-14 h-14 rounded-full' : 'w-14 h-20 rounded-lg'}`}>
                        <Image 
                          src={item.poster_path || item.profile_path ? `https://image.tmdb.org/t/p/w185${item.poster_path || item.profile_path}` : "https://picsum.photos/seed/poster/185/278"} 
                          alt={item.title || item.name} 
                          fill 
                          className="object-cover" 
                          referrerPolicy="no-referrer" 
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-white font-bold truncate">{item.title || item.name}</h4>
                        <p className="text-white/50 text-xs mt-1">
                          {item.release_date || item.first_air_date ? new Date(item.release_date || item.first_air_date).getFullYear() : item.known_for_department}
                          {" • "}
                          <span className="uppercase">{item.media_type === 'movie' ? t.explore.exploreMovies : item.media_type === 'tv' ? t.explore.exploreTv : 'Personne'}</span>
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : query.trim() && (
                <div className="py-20 text-center text-white/50">
                  Aucun résultat pour &quot;{query}&quot;
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default Header;
