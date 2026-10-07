import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { api, ApiError, type AdminLog } from '../api';
import { formatDate, formatDateTime } from '../format';

const ACTION_LABELS: Record<string, string> = {
  give_subscription: 'Give subscription',
  expire_subscription: 'Expire subscription',
  reset_subscription: 'Reset subscription',
  schedule_expire: 'Schedule expiry',
  schedule_reset: 'Schedule reset',
  grant_expired: 'Given subscription ended',
};

/** One readable sentence out of a log row's details, per action. */
function summarize(log: AdminLog): string {
  if (log.error) return log.error;

  const d = log.details as Record<string, string | number | boolean | undefined>;
  switch (log.action) {
    case 'give_subscription':
      return [
        `Credits ${d.previousCredits} + ${d.addedCredits} = ${d.newCredits}`,
        d.subscriptionApplied
          ? `active until ${formatDate(String(d.validUntil))}`
          : 'already had a paid subscription, credits only',
      ].join(' · ');
    case 'reset_subscription':
      return `Was ${d.previousStatus} with ${d.previousCredits} credits${d.autoDebitCancelled ? ' · auto-debit cancelled' : ''}`;
    case 'expire_subscription':
      if (d.reason) return String(d.reason);
      return d.autoDebitCancelled ? 'Auto-debit cancelled' : 'No auto-debit to cancel';
    case 'schedule_expire':
    case 'schedule_reset':
      return `For ${formatDate(String(d.scheduledFor))}`;
    case 'grant_expired':
      return d.keptPaidSubscription ? 'User stays active on their own paid subscription' : 'Subscription turned off';
    default:
      return '';
  }
}

export function ActivityLogPage() {
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .listLogs()
      .then((data) => setLogs(data.logs))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Layout wide>
      {error ? <div className="error-banner">{error}</div> : null}
      {loading ? (
        <div className="centered-loading">Loading…</div>
      ) : (
        <div className="card">
          <h2>Activity log (latest 200)</h2>
          {logs.length === 0 ? (
            <p className="hint">Nothing has been logged yet.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Admin</th>
                    <th>Action</th>
                    <th>User number</th>
                    <th>Result</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id}>
                      <td>{formatDateTime(log.createdAt)}</td>
                      <td>{log.adminName}</td>
                      <td>{ACTION_LABELS[log.action] ?? log.action}</td>
                      <td>{log.phoneNumber}</td>
                      <td className={log.outcome === 'failed' ? 'failed' : ''}>{log.outcome}</td>
                      <td className="wrap">{summarize(log)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Layout>
  );
}
