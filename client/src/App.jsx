import React from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import Inbox from './views/Inbox.jsx';
import PODetail from './views/PODetail.jsx';
import Settings from './views/Settings.jsx';

const BASE = import.meta.env.VITE_BASE_PATH || '/orders';

const styles = {
  layout: { display: 'flex', flexDirection: 'column', minHeight: '100vh' },
  header: {
    background: '#1a1a2e',
    color: '#fff',
    padding: '0 1.5rem',
    display: 'flex',
    alignItems: 'center',
    gap: '2rem',
    height: '56px',
    borderBottom: '2px solid #2d6a4f',
  },
  logo: { fontSize: '1.1rem', fontWeight: 700, color: '#fff', textDecoration: 'none', letterSpacing: '0.02em' },
  nav: { display: 'flex', gap: '0.25rem', flex: 1 },
  navLink: {
    padding: '0.4rem 0.9rem',
    borderRadius: '6px',
    color: '#ccc',
    textDecoration: 'none',
    fontSize: '0.9rem',
    transition: 'background 0.15s',
  },
  navLinkActive: { background: '#2d6a4f', color: '#fff' },
  main: { flex: 1 },
};

export default function App() {
  return (
    <BrowserRouter basename={BASE}>
      <div style={styles.layout}>
        <header style={styles.header}>
          <NavLink to="/" style={styles.logo}>Fable Food — PO Inbox</NavLink>
          <nav style={styles.nav}>
            <NavLink
              to="/"
              end
              style={({ isActive }) => ({ ...styles.navLink, ...(isActive ? styles.navLinkActive : {}) })}
            >
              Inbox
            </NavLink>
            <NavLink
              to="/settings"
              style={({ isActive }) => ({ ...styles.navLink, ...(isActive ? styles.navLinkActive : {}) })}
            >
              Settings
            </NavLink>
          </nav>
        </header>
        <main style={styles.main}>
          <Routes>
            <Route path="/" element={<Inbox />} />
            <Route path="/detail/:id" element={<PODetail />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
