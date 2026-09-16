import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { api } from '../api';

export function Layout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await api.logout();
    } finally {
      navigate('/login', { replace: true });
    }
  };

  return (
    <>
      <div className="topbar">
        <h1>Astro101 Admin</h1>
        <nav>
          <NavLink to="/astrologers" className={({ isActive }) => (isActive ? 'active' : '')}>
            Astrologers
          </NavLink>
          <NavLink to="/pricing" className={({ isActive }) => (isActive ? 'active' : '')}>
            Paywall pricing
          </NavLink>
          <NavLink to="/users" className={({ isActive }) => (isActive ? 'active' : '')}>
            Users
          </NavLink>
        </nav>
        <button onClick={handleLogout}>Sign out</button>
      </div>
      <div className="container">{children}</div>
    </>
  );
}
