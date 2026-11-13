'use client';
import { useActionState } from 'react';
import { signIn } from '../actions.ts';

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, null);
  return (
    <form action={action}>
      {state?.error && <p className="err" role="alert">{state.error}</p>}
      <input type="text" name="username" placeholder="Username" autoComplete="username" autoCapitalize="none" required autoFocus={!state?.username} defaultValue={state?.username} key={state?.username} />
      <input name="password" type="password" placeholder="Password" autoComplete="current-password" required autoFocus={!!state?.username} />
      <button className="btn block" type="submit" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</button>
    </form>
  );
}
