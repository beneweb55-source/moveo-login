"use client";

import { useState, useEffect } from 'react';
import { LayoutTemplate, Save, Image as ImageIcon, Search } from 'lucide-react';

export default function ContentManager() {
  const [settings, setSettings] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [heroSearch, setHeroSearch] = useState('');
  const [heroResults, setHeroResults] = useState<any[]>([]);
  const [selectedHero, setSelectedHero] = useState<any>(null);
  const [pinnedSections, setPinnedSections] = useState<any[]>([]);

  useEffect(() => {
    fetchSettings();
    fetchPinnedSections();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/admin/content');
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
        if (data.hero_movie) {
          setSelectedHero(typeof data.hero_movie === 'string' ? JSON.parse(data.hero_movie) : data.hero_movie);
        }
      }
    } catch (error) {
      console.error('Failed to fetch settings', error);
    } finally {
      setLoading(false);
    }
  };

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

  const handleSavePinnedSections = async (newSections: any[]) => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/sections', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sections: newSections })
      });
      if (res.ok) {
        setPinnedSections(newSections);
        alert('Sections épinglées mises à jour');
      }
    } catch (error) {
      console.error('Failed to save pinned sections', error);
    } finally {
      setSaving(false);
    }
  };

  const togglePin = (sectionKey: string) => {
    const updated = pinnedSections.map(s => 
      s.section_key === sectionKey ? { ...s, is_pinned: !s.is_pinned } : s
    );
    handleSavePinnedSections(updated);
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
        alert('Paramètre enregistré avec succès');
      } else {
        const data = await res.json();
        alert(data.error);
      }
    } catch (error) {
      console.error('Failed to save setting', error);
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

  if (loading) return <div className="text-zinc-400">Chargement du contenu...</div>;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold text-white mb-2">Gestion du Contenu</h2>
        <p className="text-zinc-400">Personnalisez l&apos;apparence et le contenu mis en avant sur la page d&apos;accueil.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Hero Banner Section */}
        <div className="bg-[#111] border border-white/10 rounded-xl p-6">
          <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <LayoutTemplate className="w-5 h-5 text-red-500" />
            Hero Banner (Accueil)
          </h3>
          
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">Rechercher un film ou une série</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
                <input 
                  type="text" 
                  placeholder="Ex: Inception, Breaking Bad..." 
                  value={heroSearch}
                  onChange={(e) => {
                    setHeroSearch(e.target.value);
                    searchMovies(e.target.value);
                  }}
                  className="w-full pl-10 pr-4 py-3 bg-[#1A1A1A] border border-white/10 rounded-lg text-white focus:outline-none focus:border-red-500"
                />
              </div>
              
              {heroResults.length > 0 && (
                <div className="mt-2 bg-[#1A1A1A] border border-white/10 rounded-lg overflow-hidden absolute z-10 w-full max-w-md">
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

            {selectedHero && (
              <div className="bg-[#1A1A1A] border border-white/10 rounded-lg p-4">
                <h4 className="text-sm font-medium text-zinc-400 mb-4">Média sélectionné</h4>
                <div className="flex gap-4">
                  {selectedHero.poster_path ? (
                    <img src={`https://image.tmdb.org/t/p/w154${selectedHero.poster_path}`} alt={selectedHero.title || selectedHero.name} className="w-24 rounded-lg shadow-lg" />
                  ) : (
                    <div className="w-24 h-36 bg-zinc-800 rounded-lg flex items-center justify-center">
                      <ImageIcon className="w-8 h-8 text-zinc-500" />
                    </div>
                  )}
                  <div className="flex-1">
                    <h5 className="text-xl font-bold text-white mb-2">{selectedHero.title || selectedHero.name}</h5>
                    <p className="text-sm text-zinc-400 line-clamp-3 mb-4">{selectedHero.overview}</p>
                    <button 
                      onClick={() => handleSaveSetting('hero_movie', selectedHero)}
                      disabled={saving}
                      className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition-colors disabled:opacity-50"
                    >
                      <Save className="w-4 h-4" />
                      {saving ? 'Enregistrement...' : 'Définir comme Hero'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Other Settings */}
        <div className="bg-[#111] border border-white/10 rounded-xl p-6">
          <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <LayoutTemplate className="w-5 h-5 text-blue-500" />
            Sections Épinglées
          </h3>
          <div className="space-y-2">
            {pinnedSections.map((section) => (
              <div key={section.section_key} className="flex items-center justify-between p-3 bg-[#1A1A1A] rounded-lg border border-white/5">
                <span className="text-white capitalize">{section.section_key.replace('_', ' ')}</span>
                <button 
                  onClick={() => togglePin(section.section_key)}
                  className={`px-3 py-1 rounded text-sm font-medium ${section.is_pinned ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400'}`}
                >
                  {section.is_pinned ? 'Épinglé' : 'Épingler'}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
