import { redirect } from 'next/navigation';
import { config } from '@/lib/config.ts';
import { isSignedIn } from '@/lib/session.ts';
import { LoginForm } from './LoginForm.tsx';

export const metadata = { title: 'Sign in' };

export default async function LoginPage() {
  if (await isSignedIn()) redirect('/studio');
  return (
    <div className="wrap login">
      <div className="box">
        <h1>{config.businessName}</h1>
        <p>Plan sessions, send packages, get paid.</p>
        {!config.passwordHash && <p className="setup">No password set yet. In the project folder run <code>npm run setup</code>, then restart.</p>}
        <LoginForm />
      </div>
    </div>
  );
}
