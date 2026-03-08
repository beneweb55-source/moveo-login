import { User, Rat, Popcorn, Coffee, Moon, Tv, Heart, Skull, Crown } from 'lucide-react';

export const RANKS = [
  { name: 'The Newcomer', min: 0, max: 600, color: '#A1A1AA', icon: User }, // 0-10h
  { name: 'Screen Rat', min: 600, max: 3000, color: '#F59E0B', icon: Rat }, // 10-50h
  { name: 'Popcorn Addict', min: 3000, max: 6000, color: '#EF4444', icon: Popcorn }, // 50-100h
  { name: 'The Regular', min: 6000, max: 12000, color: '#3B82F6', icon: Coffee }, // 100-200h
  { name: 'Night Owl', min: 12000, max: 18000, color: '#8B5CF6', icon: Moon }, // 200-300h
  { name: 'Binge Machine', min: 18000, max: 30000, color: '#EC4899', icon: Tv }, // 300-500h
  { name: 'The Obsessed', min: 30000, max: 60000, color: '#10B981', icon: Heart }, // 500-1000h
  { name: 'No Life', min: 60000, max: 120000, color: '#6366F1', icon: Skull }, // 1000-2000h
  { name: 'Moveo Legend', min: 120000, max: Infinity, color: '#EAB308', icon: Crown }, // 2000h+
];

export function getRankFromWatchTime(minutes: number, watchedCount: number) {
  // Use minutes as the primary metric
  return RANKS.find(rank => minutes >= rank.min && minutes < rank.max) || RANKS[0];
}
