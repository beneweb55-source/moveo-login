import { useState, useEffect } from 'react';

// TMDB Genre IDs
const GENRES = {
  ACTION: 28,
  ADVENTURE: 12,
  ANIMATION: 16,
  COMEDY: 35,
  CRIME: 80,
  DOCUMENTARY: 99,
  DRAMA: 18,
  FAMILY: 10751,
  FANTASY: 14,
  HISTORY: 36,
  HORROR: 27,
  MUSIC: 10402,
  MYSTERY: 9648,
  ROMANCE: 10749,
  SCI_FI: 878,
  TV_MOVIE: 10770,
  THRILLER: 53,
  WAR: 10752,
  WESTERN: 37,
};

export interface MoveoProfile {
  id: string;
  headline: string;
  genreIds: number[];
  color: string; // Tailwind class or hex
  accentColor: string;
}

const PROFILES: Record<string, MoveoProfile> = {
  friday_night: {
    id: 'friday_night',
    headline: "The Night Is Yours",
    genreIds: [GENRES.THRILLER, GENRES.HORROR],
    color: '#E50914', // Red
    accentColor: 'from-red-600/20',
  },
  weekend_binge: {
    id: 'weekend_binge',
    headline: "Le Grand Weekend",
    genreIds: [GENRES.ACTION, GENRES.ADVENTURE],
    color: '#F59E0B', // Amber/Gold
    accentColor: 'from-amber-600/20',
  },
  sunday_chill: {
    id: 'sunday_chill',
    headline: "Slow Sunday",
    genreIds: [GENRES.COMEDY, GENRES.ROMANCE],
    color: '#10B981', // Emerald Green
    accentColor: 'from-emerald-600/20',
  },
  late_night: {
    id: 'late_night',
    headline: "After Midnight",
    genreIds: [GENRES.HORROR, GENRES.MYSTERY],
    color: '#8B5CF6', // Violet
    accentColor: 'from-violet-900/40',
  },
  monday_motivation: {
    id: 'monday_motivation',
    headline: "Fuel for the Week",
    genreIds: [GENRES.DRAMA, GENRES.DOCUMENTARY],
    color: '#3B82F6', // Blue
    accentColor: 'from-blue-600/20',
  },
  midweek_escape: {
    id: 'midweek_escape',
    headline: "Pause Mentale",
    genreIds: [GENRES.ANIMATION, GENRES.FANTASY],
    color: '#EC4899', // Pink
    accentColor: 'from-pink-600/20',
  },
  default: {
    id: 'default',
    headline: "Welcome to Moveo",
    genreIds: [GENRES.ACTION, GENRES.DRAMA], // Generic mix
    color: '#E50914',
    accentColor: 'from-red-600/20',
  }
};

export const useMoveoCore = () => {
  const [profile, setProfile] = useState<MoveoProfile>(PROFILES.default);

  useEffect(() => {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay(); // 0 = Sunday, 1 = Monday, ... 6 = Saturday

    let selectedProfile = PROFILES.default;

    // Logic Table
    if (hour >= 0 && hour < 6) {
      selectedProfile = PROFILES.late_night;
    } else if (day === 5 && hour >= 18) {
      // Friday Night (18h+)
      selectedProfile = PROFILES.friday_night;
    } else if (day === 6 && hour >= 12) {
      // Saturday Afternoon/Evening
      selectedProfile = PROFILES.weekend_binge;
    } else if (day === 0 && hour < 12) {
      // Sunday Morning
      selectedProfile = PROFILES.sunday_chill;
    } else if (day === 1) {
      // Monday
      selectedProfile = PROFILES.monday_motivation;
    } else if ((day >= 2 && day <= 4) && hour >= 18) {
      // Tuesday - Thursday Evening
      selectedProfile = PROFILES.midweek_escape;
    } else {
      // Fallback logic for other times (e.g. Wed morning)
      // Could default to standard or reuse one of the above
      // For now, let's use a generic "Daytime" profile or just keep default
      selectedProfile = PROFILES.default;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProfile(selectedProfile);
  }, []);

  return profile;
};
