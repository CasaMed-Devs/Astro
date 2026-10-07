import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';

export function LoginPage() {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (name.trim().length < 2) {
      setError('Please enter your name.');
      return;
    }
    setSubmitting(true);
    try {
      await api.login(name.trim(), password);
      navigate('/astrologers', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-wrap">
      <h1>Astro108 Admin</h1>
      {error ? <div className="error-banner">{error}</div> : null}
      <form className="card" onSubmit={handleSubmit}>
        <div className="field-row">
          <label htmlFor="name">Your name (saved with every change you make)</label>
          <input type="text" id="name" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field-row">
          <label htmlFor="password">Admin password</label>
          <input
            type="password"
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button className="primary" type="submit" style={{ width: '100%' }} disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
