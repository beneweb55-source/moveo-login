'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function ProfilePage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
        } else {
          router.push('/login');
        }
      } catch (err) {
        console.error(err);
        router.push('/login');
      } finally {
        setLoading(false);
      }
    };
    fetchUser();
  }, [router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0A0A0A]">
        <Loader2 className="w-8 h-8 text-[#E50914] animate-spin" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] pt-24 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Profile</h1>
          <p className="mt-2 text-white/50">Manage your account settings and preferences.</p>
        </div>

        <div className="bg-[#141414] rounded-2xl border border-white/10 overflow-hidden">
          <div className="p-6 sm:p-8 space-y-6">
            <div>
              <h3 className="text-sm font-medium text-white/50 uppercase tracking-wider">Account Information</h3>
              <div className="mt-4 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between py-3 border-b border-white/5">
                  <span className="text-white/70">Name</span>
                  <span className="text-white font-medium mt-1 sm:mt-0">{user.name}</span>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between py-3 border-b border-white/5">
                  <span className="text-white/70">Email</span>
                  <span className="text-white font-medium mt-1 sm:mt-0">{user.email}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
