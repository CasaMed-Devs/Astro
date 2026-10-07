import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { api } from '../api';

/** `wide` gives table-heavy pages (dispute data, activity log) room to breathe. */
export function Layout({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
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
        <h1>Astro108 Admin</h1>
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
          <NavLink to="/access" className={({ isActive }) => (isActive ? 'active' : '')}>
            Access settings
          </NavLink>
          <NavLink to="/activity" className={({ isActive }) => (isActive ? 'active' : '')}>
            Activity log
          </NavLink>
        </nav>
        <button onClick={handleLogout}>Sign out</button>
      </div>
      <div className={wide ? 'container wide' : 'container'}>{children}</div>
    </>
  );
}
