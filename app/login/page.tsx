import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/login-form';
import { currentSession } from '@/lib/auth';

export default async function LoginPage() {
  if (await currentSession()) redirect('/');
  return <LoginForm />;
}
