/**
 * Fable Food design system — shared colour palette and component tokens.
 * Mirrors the in_demandSOP design system for visual consistency across Fable tools.
 *
 * Usage:
 *   import { C, T } from '../design.js';
 *   <div style={{ background: C.olive, color: C.lime }}>…</div>
 */

// ─── Brand colours ────────────────────────────────────────────────────────────

export const C = {
  // Primary palette
  forest:     '#332f21',   // Primary text, darkest tone
  olive:      '#2c4214',   // Header bg, primary buttons, active states
  oliveHover: '#3a5a1e',   // Olive hover/pressed
  lime:       '#cfff8e',   // Button text on olive, key accent
  limeLight:  '#eaffd4',   // Very light lime background
  taupe:      '#5e590f',   // Amber/taupe accent

  // Sage scale
  sage:       '#5e7462',   // Secondary text, muted labels
  sageMid:    '#8fad92',   // Tertiary text, placeholders
  sageLight:  '#dde8df',   // Borders, dividers
  sagePale:   '#f0f5f1',   // Table headers, chip backgrounds
  rowHover:   '#f5f7f3',   // Table row hover

  // Base
  white:      '#ffffff',   // Card / panel backgrounds
  body:       '#fafaf7',   // Page background (off-white)

  // Status
  errorBg:    '#fef2f2',
  errorBorder:'#fecaca',
  errorText:  '#b91c1c',
  successBg:  '#f0f5f1',
  successBorder:'#dde8df',
  successText:'#2c4214',
  flagBg:     '#fffbec',
  flagBorder: '#fbbf24',
  flagText:   '#92400e',
};

// ─── Typography tokens ────────────────────────────────────────────────────────

export const T = {
  fontFamily: "'ZapfHumanist', 'Palatino Linotype', 'Book Antiqua', Palatino, serif",

  // Sizes
  xs:   '0.75rem',   // 12px — captions, micro labels
  sm:   '0.82rem',   // 13px — table cells, secondary content
  base: '0.9rem',    // 14.4px — body / default
  md:   '1rem',      // 16px — card titles
  lg:   '1.2rem',    // 19px — page headings
  xl:   '1.4rem',    // 22px — section headings

  // Weights
  normal: 400,
  bold:   700,

  // Letter spacing
  upper: '0.06em',   // For uppercase eyebrow labels
};

// ─── Shared component style fragments ────────────────────────────────────────
// Compose these with spread: { ...F.card, padding: '2rem' }

export const F = {
  card: {
    background:   C.white,
    borderRadius: '8px',
    border:       `1px solid ${C.sageLight}`,
    padding:      '1.25rem 1.5rem',
    marginBottom: '1rem',
  },

  cardTitle: {
    fontWeight:    T.bold,
    fontSize:      T.md,
    color:         C.forest,
    borderBottom:  `1px solid ${C.sageLight}`,
    paddingBottom: '0.5rem',
    marginBottom:  '0.9rem',
  },

  tableHeader: {
    background:   C.sagePale,
    color:        C.sage,
    fontSize:     T.sm,
    fontWeight:   T.bold,
    padding:      '0.65rem 1rem',
    textAlign:    'left',
    borderBottom: `1px solid ${C.sageLight}`,
    whiteSpace:   'nowrap',
  },

  tableCell: {
    padding:      '0.65rem 1rem',
    fontSize:     T.base,
    borderBottom: `1px solid ${C.sagePale}`,
    color:        C.forest,
    verticalAlign:'middle',
  },

  input: {
    padding:     '0.45rem 0.7rem',
    border:      `1px solid ${C.sageLight}`,
    borderRadius:'6px',
    fontSize:    T.base,
    background:  C.white,
    color:       C.forest,
    fontFamily:  T.fontFamily,
    outline:     'none',
  },

  btnPrimary: {
    padding:         '0.5rem 1.1rem',
    borderRadius:    '6px',
    border:          'none',
    cursor:          'pointer',
    fontSize:        T.base,
    fontWeight:      T.bold,
    fontFamily:      T.fontFamily,
    background:      C.olive,
    color:           C.lime,
    transition:      'background 0.15s',
  },

  btnSecondary: {
    padding:      '0.5rem 1rem',
    borderRadius: '6px',
    border:       `1px solid ${C.sageLight}`,
    cursor:       'pointer',
    fontSize:     T.base,
    fontWeight:   T.normal,
    fontFamily:   T.fontFamily,
    background:   C.white,
    color:        C.sage,
  },

  badge: {
    display:       'inline-block',
    padding:       '0.18rem 0.55rem',
    borderRadius:  '20px',
    fontSize:      T.xs,
    fontWeight:    T.bold,
    textTransform: 'uppercase',
    letterSpacing: T.upper,
  },

  errorBox: {
    background:   C.errorBg,
    border:       `1px solid ${C.errorBorder}`,
    borderRadius: '6px',
    padding:      '0.75rem 1rem',
    color:        C.errorText,
    fontSize:     T.base,
    marginBottom: '1rem',
  },

  successBox: {
    background:   C.successBg,
    border:       `1px solid ${C.successBorder}`,
    borderRadius: '6px',
    padding:      '0.75rem 1rem',
    color:        C.successText,
    fontSize:     T.base,
    marginBottom: '1rem',
  },
};
