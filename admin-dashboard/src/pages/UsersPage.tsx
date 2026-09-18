import { useState } from 'react';
import { Layout } from '../components/Layout';
import { api, ApiError, type UserDetail } from '../api';

function Row({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="detail-row">
      <span className="label">{label}</span>
      <span>{value ?? '—'}</span>
    </div>
  );
}

export function UsersPage() {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [user, setUser] = useState<UserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  const handleSearch = async () => {
    setError(null);
    setUser(null);
    if (!phoneNumber.trim()) return;

    setSearching(true);
    try {
      const result = await api.lookupUser(phoneNumber.trim());
      setUser(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setSearching(false);
    }
  };

  return (
    <Layout>
      {error ? <div className="error-banner">{error}</div> : null}
      <div className="card">
        <h2>Look up a user</h2>
        <div className="field-row">
          <label htmlFor="phone">Phone number (E.164, e.g. +919876543210)</label>
          <input
            type="text"
            id="phone"
            placeholder="+919876543210"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
        </div>
        <button className="primary" onClick={handleSearch} disabled={searching}>
          {searching ? 'Searching…' : 'Search'}
        </button>
      </div>

      {user ? (
        <>
          <div className="card">
            <h2>Profile</h2>
            <Row label="UID" value={user.uid} />
            <Row label="Phone number" value={user.phoneNumber} />
            <Row label="Name" value={user.name} />
            <Row label="Gender" value={user.gender} />
            <Row label="Date of birth" value={user.dateOfBirth} />
            <Row label="Time of birth" value={user.timeOfBirth} />
            <Row label="Place of birth" value={user.placeOfBirth} />
            <Row label="Credits" value={user.credits} />
            <Row label="Report status" value={user.report ? user.report.status : 'none'} />
            <Row label="Created" value={user.createdAt} />
          </div>
          <div className="card">
            <h2>Auto-debit mandate</h2>
            <Row label="Status" value={user.mandate.status} />
            <Row label="Method" value={user.mandate.method} />
            <Row label="Trial credits claimed" value={user.mandate.trialCreditsClaimed ? 'yes' : 'no'} />
            <Row label="Next auto-debit at" value={user.mandate.nextAutoDebitAt} />
            <Row label="Next auto-debit amount (Rs.)" value={user.mandate.nextAutoDebitAmount} />
            <Row label="Grace period until" value={user.mandate.graceUntil} />
            <Row label="Last payment failure" value={user.mandate.lastPaymentFailureReason} />
          </div>
        </>
      ) : null}
    </Layout>
  );
}
