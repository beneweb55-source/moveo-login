import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Admin Panel - Moveo',
  description: 'Manage Moveo platform',
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      {children}
    </div>
  );
}
