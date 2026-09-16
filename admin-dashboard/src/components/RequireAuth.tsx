import { useEffect, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../api';

export function RequireAuth({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<'checking' | 'ok' | 'unauthenticated'>('checking');

  useEffect(() => {
    api
      .session()
      .then(() => setStatus('ok'))
      .catch(() => setStatus('unauthenticated'));
  }, []);

  if (status === 'checking') {
    return <div className="centered-loading">Loading…</div>;
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
