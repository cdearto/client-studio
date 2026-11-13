// Demo home page. Stands in for the business's real website: newsletter signup and a link to Studio.
import Link from 'next/link';
import { config } from '@/lib/config.ts';
import { SignupForm } from './SignupForm.tsx';
import './home.css';

export default function Home() {
  const mail = `mailto:${config.notifyEmail}`;
  return (
    <div className="home">
      <div className="wrap">
        <header>
          <span className="mark">{config.businessName}</span>
          <Link href="/studio">Owner sign-in →</Link>
        </header>
        <main>
          <h1>Private sessions,<br />booked in a tap.</h1>
          <p className="lead">
            This is a placeholder home page for the demo. Your clients get a private link to see their package,
            pay, and book times from your hours. You run everything from <Link href="/studio">Studio</Link>.
          </p>

          <section className="card" id="contact">
            <h2>Book a session</h2>
            <p>Get in touch at <a href={mail}>{config.notifyEmail}</a> and you’ll get a package link by text.</p>
            <a className="btn" href={mail}>Email us</a>
          </section>

          <section className="card" id="signup">
            <h2>Join the newsletter</h2>
            <p>Occasional updates: new hours, open spots, news. Unsubscribe anytime.</p>
            <SignupForm />
          </section>
        </main>
        <footer>© {new Date().getFullYear()} {config.businessName}</footer>
      </div>
    </div>
  );
}
