"use client";

import { useState, useEffect } from 'react';
import { LayoutTemplate, Save, Image as ImageIcon, Search, Trash2 } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { AnimatePresence, motion } from 'motion/react';

export default function ContentManager() {
  const { t } = useLanguage();
  const [settings, setSettings] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [heroSearch, setHeroSearch] = useState('');
  const [heroResults, setHeroResults] = useState<any[]>([]);
  const [selectedHero, setSelectedHero] = useState<any>(null);
  const [pinnedSections, setPinnedSections] = useState<any[]>([]);
  const [newSection, setNewSection] = useState({ title: '' });
  const [sectionType, setSectionType] = useState('movie');
  const [sectionCategory, setSectionCategory] = useState('');
  const [sectionGenre, setSectionGenre] = useState('');
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const MOVIE_CATEGORIES = [
    { label: t.admin.popular, value: '/movie/popular' },
    { label: 'Top 10 en France', value: '/movie/popular?region=FR' },
    { label: t.admin.topRated, value: '/movie/top_rated' },
    { label: t.admin.nowPlaying, value: '/movie/now_playing' },
    { label: t.admin.upcoming, value: '/movie/upcoming' },
    { label: t.admin.genre, value: 'genre' },
  ];

  const TV_CATEGORIES = [
    { label: t.admin.popular, value: '/tv/popular' },
    { label: t.admin.topRated, value: '/tv/top_rated' },
    { label: t.admin.onTheAir, value: '/tv/on_the_air' },
    { label: t.admin.genre, value: 'genre' },
  ];

  const GENRES: any = {
    movie: [
      { label: t.admin.genre_action, value: '28' },
      { label: t.admin.genre_comedy, value: '35' },
      { label: t.admin.genre_horror, value: '27' },
      { label: t.admin.genre_scifi, value: '878' },
      { label: t.admin.genre_animation, value: '16' },
      { label: t.admin.genre_romance, value: '10749' },
      { label: t.admin.genre_thriller, value: '53' },
      { label: t.admin.genre_documentary, value: '99' },
    ],
    tv: [
      { label: t.admin.genre_action, value: '10759' },
      { label: t.admin.genre_comedy, value: '35' },
      { label: t.admin.genre_horror, value: '27' },
      { label: t.admin.genre_scifi, value: '10765' },
      { label: t.admin.genre_animation, value: '16' },
      { label: t.admin.genre_romance, value: '10749' },
      { label: t.admin.genre_thriller, value: '53' },
      { label: t.admin.genre_documentary, value: '99' },
      { label: t.admin.genre_kdrama, value: 'kdrama' },
    ]
  };

  const getGeneratedEndpoint = () => {
    if (sectionCategory === 'genre') {
      if (sectionGenre === 'kdrama') {
        return '/discover/tv?with_origin_country=KR';
      }
      return `/discover/${sectionType}?with_genres=${sectionGenre}`;
    }
    return sectionCategory;
  };

  const generatedEndpoint = getGeneratedEndpoint();

  useEffect(() => {
    fetchSettings();
    fetchPinnedSections();
  }, []);

  const fetchPinnedSections = async () => {
    try {
      const res = await fetch('/api/admin/sections');
      if (res.ok) {
        const data = await res.json();
        setPinnedSections(data);
      }
    } catch (error) {
      console.error('Failed to fetch pinned sections', error);
    }
  };

  const handleAddSection = async () => {
    if (!newSection.title || !generatedEndpoint) return;
    try {
      const res = await fetch('/api/admin/sections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          title: newSection.title, 
          endpoint: generatedEndpoint, 
          priority: pinnedSections.length + 1 
        })
      });
      if (res.ok) {
        fetchPinnedSections();
        setNewSection({ title: '' });
        setSectionCategory('');
        setSectionGenre('');
        showToast(t.admin.sectionAdded, 'success');
      } else {
        const data = await res.json();
        showToast(`${t.admin.error} : ${data.error || t.admin.errorAddSection}`, 'error');
      }
    } catch (error) {
      console.error('Failed to add section', error);
      showToast(t.admin.error, 'error');
    }
  };

  const handleDeleteSection = async (id: number) => {
    try {
      const res = await fetch(`/api/admin/sections?id=${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        fetchPinnedSections();
        setDeletingId(null);
        showToast(t.admin.sectionDeleted, 'success');
      } else {
        showToast(t.admin.errorDeleteSection, 'error');
      }
    } catch (error) {
      console.error('Failed to delete section', error);
      showToast(t.admin.errorDeleteSection, 'error');
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/admin/content');
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
        if (data.hero_movie) {
          try {
            setSelectedHero(typeof data.hero_movie === 'string' ? JSON.parse(data.hero_movie) : data.hero_movie);
          } catch (e) {
            console.error('Failed to parse hero_movie', e);
            setSelectedHero(data.hero_movie);
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch settings', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSetting = async (key: string, value: any) => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/content', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value })
      });
      if (res.ok) {
        showToast(t.admin.success, 'success');
      } else {
        const data = await res.json();
        showToast(data.error || t.admin.error, 'error');
      }
    } catch (error) {
      console.error('Failed to save setting', error);
      showToast(t.admin.error, 'error');
    } finally {
      setSaving(false);
    }
  };

  const searchMovies = async (query: string) => {
    if (!query) {
      setHeroResults([]);
      return;
    }
    try {
      const res = await fetch(`/api/tmdb-proxy?q=${encodeURIComponent(query)}&language=fr-FR`);
      if (res.ok) {
        const data = await res.json();
        setHeroResults(data.results.filter((item: any) => item.media_type === 'movie' || item.media_type === 'tv').slice(0, 5));
      }
    } catch (error) {
      console.error('Failed to search movies', error);
    }
  };

  if (loading) return <div className="text-zinc-400">{t.admin.loading}</div>;

  return (
    <div className="space-y-8 relative">
      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className={`fixed top-6 left-1/2 -translate-x-1/2 z-[200] px-6 py-3 rounded-full font-medium shadow-2xl flex items-center gap-2 ${
              toast.type === 'success' ? 'bg-emerald-500/90 text-white' : 'bg-red-500/90 text-white'
            }`}
          >
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>

      <div>
        <h2 className="text-3xl font-bold text-white mb-2">{t.admin.content}</h2>
        <p className="text-zinc-400">{t.admin.contentDescription}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Hero Banner Section */}
        <div className="bg-[#111] border border-white/10 rounded-xl p-6">
          <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <LayoutTemplate className="w-5 h-5 text-red-500" />
            {t.admin.heroBanner}
          </h3>
          
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">{t.admin.searchMedia}</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
                <input 
                  type="text" 
                  placeholder={t.admin.searchPlaceholder}
                  value={heroSearch}
                  onChange={(e) => {
                    setHeroSearch(e.target.value);
                    searchMovies(e.target.value);
                  }}
                  className="w-full pl-10 pr-4 py-3 bg-[#1A1A1A] border border-white/10 rounded-lg text-white focus:outline-none focus:border-red-500"
                />
                
                {heroResults.length > 0 && (
                  <div className="absolute top-full mt-2 left-0 right-0 bg-[#1A1A1A] border border-white/10 rounded-lg overflow-hidden z-50 shadow-2xl">
                    {heroResults.map((item) => (
                      <div 
                        key={item.id}
                        onClick={() => {
                          setSelectedHero(item);
                          setHeroSearch('');
                          setHeroResults([]);
                        }}
                        className="flex items-center gap-3 p-3 hover:bg-white/5 cursor-pointer border-b border-white/5 last:border-0"
                      >
                        {item.poster_path ? (
                          <img src={`https://image.tmdb.org/t/p/w92${item.poster_path}`} alt={item.title || item.name} className="w-10 h-14 object-cover rounded" />
                        ) : (
                          <div className="w-10 h-14 bg-zinc-800 rounded flex items-center justify-center">
                            <ImageIcon className="w-4 h-4 text-zinc-500" />
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-white">{item.title || item.name}</p>
                          <p className="text-xs text-zinc-400 capitalize">{item.media_type} • {item.release_date?.substring(0, 4) || item.first_air_date?.substring(0, 4)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {selectedHero && (
              <div className="relative rounded-xl overflow-hidden h-40 mt-4">
                {/* Image backdrop en fond floutée */}
                <img src={`https://image.tmdb.org/t/p/w780${selectedHero.backdrop_path || selectedHero.poster_path}`}
                     className="absolute inset-0 w-full h-full object-cover blur-sm brightness-40" />
                <div className="relative z-10 flex items-center gap-4 p-4 h-full">
                  <img src={`https://image.tmdb.org/t/p/w154${selectedHero.poster_path}`}
                       className="h-28 rounded-lg shadow-xl" />
                  <div>
                    <h5 className="text-xl font-bold text-white">{selectedHero.title || selectedHero.name}</h5>
                    <p className="text-sm text-zinc-300 line-clamp-2 mt-1">{selectedHero.overview}</p>
                    <div className="flex gap-2 mt-3">
                      <button onClick={() => handleSaveSetting('hero_movie', selectedHero)}
                              disabled={saving}
                              className="flex items-center gap-2 px-4 py-2 bg-[#E50914] rounded-lg
                                         text-sm font-bold hover:bg-red-700 transition-colors disabled:opacity-50">
                        <Save className="w-4 h-4" />
                        {saving ? t.admin.saving : t.admin.setAsHero}
                      </button>
                      <button onClick={() => {
                                handleSaveSetting('hero_movie', null);
                                setSelectedHero(null);
                                showToast(t.admin.heroRemoved, 'success');
                              }}
                              disabled={saving}
                              className="flex items-center gap-2 px-4 py-2 bg-zinc-800 rounded-lg
                                         text-sm font-bold hover:bg-zinc-700 transition-colors disabled:opacity-50 text-white">
                        <Trash2 className="w-4 h-4" />
                        {t.admin.removeHero}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {!selectedHero && (
              <div className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl mt-4">
                <div className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                </div>
                <span className="text-sm font-medium text-emerald-500">{t.admin.heroRandom}</span>
              </div>
            )}
          </div>
        </div>

        {/* Pinned Sections */}
        <div className="bg-[#111] border border-white/10 rounded-xl p-6">
          <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <LayoutTemplate className="w-5 h-5 text-blue-500" />
            {t.admin.pinnedSections}
          </h3>
          
          <div className="space-y-4">
            {/* D'abord : liste des sections existantes */}
            {pinnedSections.length > 0 && (
              <div className="space-y-2 mb-6">
                <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">{t.admin.activeSections}</p>
                {pinnedSections.map((section, i) => (
                  <div key={section.id} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/8 group">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-zinc-600 w-5">#{i+1}</span>
                      <div>
                        <p className="text-sm font-semibold text-white">{section.title}</p>
                        <p className="text-[10px] text-zinc-500 font-mono">{section.endpoint}</p>
                      </div>
                    </div>
                    {/* Bouton delete avec confirmation inline */}
                    {deletingId === section.id ? (
                      <div className="flex items-center gap-1">
                        <button onClick={() => handleDeleteSection(section.id)}
                                className="text-xs px-2 py-1 bg-red-600 rounded text-white font-bold">
                          {t.admin.confirm}
                        </button>
                        <button onClick={() => setDeletingId(null)}
                                className="text-xs px-2 py-1 bg-zinc-700 rounded text-white">
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setDeletingId(section.id)}
                              className="text-zinc-600 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-500/10 rounded-lg">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Séparateur */}
            <div className="border-t border-white/10 pt-4 mb-4">
              <p className="text-xs text-zinc-500 uppercase tracking-wider">{t.admin.addSection}</p>
            </div>

            <div>
              <label className="block text-xs text-zinc-500 mb-1 uppercase tracking-wider">{t.admin.sectionTitle}</label>
              <input 
                type="text" 
                placeholder={t.admin.sectionTitlePlaceholder} 
                value={newSection.title}
                onChange={(e) => setNewSection({ ...newSection, title: e.target.value })}
                className="w-full bg-[#1A1A1A] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-zinc-500 mb-1 uppercase tracking-wider">{t.admin.type}</label>
                <select 
                  value={sectionType}
                  onChange={(e) => {
                    setSectionType(e.target.value);
                    setSectionCategory('');
                    setSectionGenre('');
                  }}
                  className="w-full bg-[#1A1A1A] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="movie">{t.admin.movies}</option>
                  <option value="tv">{t.admin.tvShows}</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-zinc-500 mb-1 uppercase tracking-wider">{t.admin.category}</label>
                <select 
                  value={sectionCategory}
                  onChange={(e) => {
                    setSectionCategory(e.target.value);
                    setSectionGenre('');
                  }}
                  className="w-full bg-[#1A1A1A] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="">{t.admin.choose}</option>
                  {(sectionType === 'movie' ? MOVIE_CATEGORIES : TV_CATEGORIES).map(cat => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {sectionCategory === 'genre' && (
              <div>
                <label className="block text-xs text-zinc-500 mb-1 uppercase tracking-wider">{t.admin.genre}</label>
                <select 
                  value={sectionGenre}
                  onChange={(e) => setSectionGenre(e.target.value)}
                  className="w-full bg-[#1A1A1A] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="">{t.admin.chooseGenre}</option>
                  {GENRES[sectionType].map((genre: any) => (
                    <option key={genre.value} value={genre.value}>{genre.label}</option>
                  ))}
                </select>
              </div>
            )}

            {generatedEndpoint && (
              <div className="flex items-center gap-2 p-2 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <div className="w-2 h-2 rounded-full bg-blue-400" />
                <span className="text-xs text-blue-400 font-mono">{generatedEndpoint}</span>
              </div>
            )}

            <button 
              onClick={handleAddSection}
              disabled={!newSection.title || !generatedEndpoint || (sectionCategory === 'genre' && !sectionGenre)}
              className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t.admin.addSection}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
