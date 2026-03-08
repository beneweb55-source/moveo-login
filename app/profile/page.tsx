'use client';

import { getRankFromWatchTime } from '@/utils/ranks';
import { User, Shield } from 'lucide-react';

// Mock user data since auth is not available
const user = {
  username: "User123",
  role: "admin",
  total_watch_time: 1200,
  watched_count: 50,
  avatar: "https://picsum.photos/seed/user/200/200"
};

const ROLE_COLORS: Record<string, string> = {
  admin: '#ef4444', // red-500
  moderator: '#3b82f6', // blue-500
  user: '#10b981', // emerald-500
};

export default function ProfilePage() {
  const rank = getRankFromWatchTime(user.total_watch_time, user.watched_count);
  const RankIcon = rank.icon;
  const roleColor = ROLE_COLORS[user.role] || ROLE_COLORS.user;

  return (
    <div className="min-h-screen bg-black text-white p-8 flex flex-col items-center">
      <div className="w-full max-w-4xl bg-zinc-900 rounded-2xl p-8 shadow-xl border border-white/10">
        <div className="flex items-center gap-6 mb-8">
          <div className="relative w-24 h-24 rounded-full overflow-hidden border-2 border-white/20">
            <img 
              src={user.avatar} 
              alt={user.username} 
              className="w-full h-full object-cover"
            />
          </div>
          
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-4">
              <h1 className="text-3xl font-bold">{user.username}</h1>
              
              {/* Role Badge */}
              <div 
                className="px-3 py-1 rounded-full border text-xs font-bold uppercase tracking-widest flex items-center gap-2"
                style={{
                  borderColor: roleColor,
                  color: roleColor,
                  backgroundColor: 'transparent'
                }}
              >
                {user.role === 'admin' && <Shield size={12} />}
                {user.role}
              </div>

              {/* Rank Badge */}
              {user.watched_count > 0 && (
                <div 
                  className="px-3 py-1 rounded-full text-xs font-bold uppercase flex items-center gap-2 transition-all duration-300"
                  style={{
                    backgroundColor: `${rank.color}1A`, // 10% opacity (hex 1A is ~10%)
                    color: rank.color,
                    boxShadow: `0 0 8px ${rank.color}66` // 40% opacity (hex 66 is ~40%)
                  }}
                >
                  <RankIcon size={14} />
                  <span>{rank.name}</span>
                </div>
              )}
            </div>
            
            <div className="text-zinc-400 text-sm flex gap-4">
              <span>Watch Time: {Math.floor(user.total_watch_time / 60)}h {user.total_watch_time % 60}m</span>
              <span>•</span>
              <span>Watched: {user.watched_count}</span>
            </div>
          </div>
        </div>

        {/* Placeholder for other profile content */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-zinc-800/50 p-6 rounded-xl border border-white/5">
            <h3 className="text-lg font-semibold mb-2 text-zinc-300">Stats</h3>
            <p className="text-zinc-500">More stats coming soon...</p>
          </div>
          <div className="bg-zinc-800/50 p-6 rounded-xl border border-white/5">
            <h3 className="text-lg font-semibold mb-2 text-zinc-300">Recent Activity</h3>
            <p className="text-zinc-500">No recent activity.</p>
          </div>
          <div className="bg-zinc-800/50 p-6 rounded-xl border border-white/5">
            <h3 className="text-lg font-semibold mb-2 text-zinc-300">Favorites</h3>
            <p className="text-zinc-500">No favorites yet.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
