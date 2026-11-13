'use client';
// Confirm → done → (optionally) back on the list. Works before hydration too: the
// forms post to the Server Action and the page renders the returned state.
import { useActionState } from 'react';
import { unsubscribeStep } from './actions.ts';

export function UnsubscribeFlow({ email, k, businessName, contact }: { email: string; k: string; businessName: string; contact: string }) {
  const [state, action, pending] = useActionState(unsubscribeStep, 'confirm');
  const hidden = <><input type="hidden" name="e" value={email} /><input type="hidden" name="k" value={k} /></>;

  if (state === 'invalid') return <Invalid contact={contact} />;
  if (state === 'done') {
    return (
      <>
        <p className="kicker">Done</p>
        <h1>You’re off the list.</h1>
        <p><strong>{email}</strong> won’t get any more newsletters.</p>
        <form action={action}>{hidden}<input type="hidden" name="do" value="resubscribe" />
          <button className="ghost" type="submit" disabled={pending}>Changed your mind? Stay subscribed</button></form>
      </>
    );
  }
  if (state === 'back') {
    return (
      <>
        <p className="kicker">Welcome back</p>
        <h1>Still with us.</h1>
        <p><strong>{email}</strong> is back on the list.</p>
        <a className="btn" href="/">Back to the site</a>
      </>
    );
  }
  return (
    <>
      <p className="kicker">Mailing list</p>
      <h1>Leaving us?</h1>
      <p>Unsubscribe <strong>{email}</strong> from {businessName} emails.</p>
      <form action={action}>{hidden}<button className="primary" type="submit" disabled={pending}>{pending ? 'Unsubscribing…' : 'Unsubscribe'}</button></form>
    </>
  );
}

export function Invalid({ contact }: { contact: string }) {
  return (
    <>
      <p className="kicker">Link problem</p>
      <h1>That didn’t work.</h1>
      <p>This unsubscribe link is incomplete or out of date. Reply to any of our emails, or write
        to <a href={`mailto:${contact}?subject=Unsubscribe`}>{contact}</a>, and we’ll take you off the list.</p>
    </>
  );
}
