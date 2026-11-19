'use client';
// Newsletter signup on the demo home page. `website` is a honeypot: hidden from people, filled in by bots.
import { useActionState } from 'react';
import { signUp } from './signup-action.ts';

export function SignupForm() {
  const [state, action, pending] = useActionState(signUp, null);
  if (state?.ok) return <p className="ok" role="status">Thanks — you’re on the list.</p>;
  return (
    <>
      {state && !state.ok && <p className="err" role="alert">{state.error}</p>}
      <form action={action} data-track="signup">
        <input type="email" name="email" placeholder="you@example.com" required aria-label="Email address" autoComplete="email" />
        <input className="hp" type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
        <button type="submit" disabled={pending}>{pending ? 'Subscribing…' : 'Subscribe'}</button>
      </form>
    </>
  );
}
