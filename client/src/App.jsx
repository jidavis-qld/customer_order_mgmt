import React from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { C, T } from './design.js';
import Inbox from './views/Inbox.jsx';
import PODetail from './views/PODetail.jsx';
import Settings from './views/Settings.jsx';

const BASE = import.meta.env.VITE_BASE_PATH || '/orders';

const styles = {
  layout: {
    display:       'flex',
    flexDirection: 'column',
    minHeight:     '100vh',
    background:    C.body,
    fontFamily:    T.fontFamily,
  },

  header: {
    background:   C.olive,
    borderBottom: '1px solid #1e2e0e',
    padding:      '0 1.5rem',
    display:      'flex',
    alignItems:   'center',
    gap:          '2rem',
    height:       '52px',
    flexShrink:   0,
  },

  brand: {
    fontSize:       T.md,
    fontWeight:     T.bold,
    color:          C.lime,
    textDecoration: 'none',
    letterSpacing:  '0.01em',
    whiteSpace:     'nowrap',
  },

  nav: { display: 'flex', gap: '0.15rem', flex: 1 },

  navLink: {
    padding:        '0.35rem 0.85rem',
    borderRadius:   '5px',
    color:          C.sageMid,
    textDecoration: 'none',
    fontSize:       T.base,
    fontFamily:     T.fontFamily,
    transition:     'color 0.15s',
  },

  navLinkActive: {
    color:      C.lime,
    background: 'rgba(207, 255, 142, 0.12)',
  },

  main: { flex: 1 },
};

export default function App() {
  return (
    <BrowserRouter basename={BASE}>
      <div style={styles.layout}>
        <header style={styles.header}>
          <NavLink to="/" style={styles.brand}>Fable Food — PO Inbox</NavLink>
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
            <Route path="/"           element={<Inbox />} />
            <Route path="/detail/:id" element={<PODetail />} />
            <Route path="/settings"   element={<Settings />} />
            <Route path="*"           element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
