import SignupForm from '@/components/auth/SignupForm';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Inscription | Moveo',
  description: 'Créez votre compte Moveo',
};

export default function SignupPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-black p-4">
      <div className="w-full max-w-md">
        <SignupForm />
      </div>
    </div>
  );
}
