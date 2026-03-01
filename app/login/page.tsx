import LoginForm from '@/components/auth/LoginForm';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Connexion | Moveo',
  description: 'Connectez-vous à votre compte Moveo',
};

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-black p-4">
      <div className="w-full max-w-md">
        <LoginForm />
      </div>
    </div>
  );
}
