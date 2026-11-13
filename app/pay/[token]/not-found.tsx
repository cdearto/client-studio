// /pay/TOKEN with a token that matches nothing (served with a 404).
import { config } from '@/lib/config.ts';
import '../pay.css';

export default function PayNotFound() {
  return (
    <div className="pay"><main>
      <span className="wordmark">{config.businessName}</span>
      <p className="kicker">Link not found</p>
      <h1>Nothing Here.</h1>
      <div className="card">
        <p style={{ margin: 0 }}>
          This link doesn’t match any sessions. Double-check the link you were sent,
          or reach out at <a href={`mailto:${config.notifyEmail}`}>{config.notifyEmail}</a>.
        </p>
      </div>
    </main></div>
  );
}
