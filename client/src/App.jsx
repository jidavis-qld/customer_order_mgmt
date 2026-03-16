import React from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { C, T } from './design.js';
import Inbox from './views/Inbox.jsx';
import PODetail from './views/PODetail.jsx';
import Settings from './views/Settings.jsx';

const BASE = import.meta.env.VITE_BASE_PATH || '/orders';

const S = {
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
    gap:          '0.75rem',
    height:       '52px',
    flexShrink:   0,
  },

  homeBtn: {
    fontSize:       T.xs,
    padding:        '0.2rem 0.6rem',
    borderRadius:   '4px',
    border:         '1px solid #3d5a1e',
    color:          C.sageMid,
    textDecoration: 'none',
  },

  sep: { color: '#5e7462' },

  appName: {
    fontSize:   T.base,
    fontWeight: T.semibold,
    color:      C.sageMid,
  },

  nav: { display: 'flex', gap: '0.15rem', flex: 1, marginLeft: '1rem' },

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

  signOut: {
    marginLeft:     'auto',
    fontSize:       T.xs,
    padding:        '0.2rem 0.6rem',
    borderRadius:   '4px',
    border:         '1px solid #3d5a1e',
    color:          C.sageMid,
    textDecoration: 'none',
  },

  main: { flex: 1 },
};

export default function App() {
  return (
    <BrowserRouter basename={BASE}>
      <div style={S.layout}>
        <header style={S.header}>
          <a
            href="/"
            style={S.homeBtn}
            onMouseEnter={e => e.currentTarget.style.color = C.lime}
            onMouseLeave={e => e.currentTarget.style.color = C.sageMid}
          >
            ← Home
          </a>
          <span style={S.sep}>|</span>
          <img
            src={`${import.meta.env.BASE_URL}FAB_logo_white.png`}
            alt="Fable"
            style={{ height: '26px', width: 'auto' }}
          />
          <span style={S.sep}>|</span>
          <span style={S.appName}>PO Inbox</span>

          <nav style={S.nav}>
            <NavLink
              to="/"
              end
              style={({ isActive }) => ({ ...S.navLink, ...(isActive ? S.navLinkActive : {}) })}
            >
              Inbox
            </NavLink>
            <NavLink
              to="/settings"
              style={({ isActive }) => ({ ...S.navLink, ...(isActive ? S.navLinkActive : {}) })}
            >
              Settings
            </NavLink>
          </nav>

          <a
            href="/_gcp_iap/clear_login_cookie"
            style={S.signOut}
            onMouseEnter={e => e.currentTarget.style.color = C.lime}
            onMouseLeave={e => e.currentTarget.style.color = C.sageMid}
          >
            Sign out
          </a>
        </header>

        <main style={S.main}>
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
