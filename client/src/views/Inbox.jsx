import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { C, T, F } from '../design.js';

const BASE_API = import.meta.env.VITE_BASE_PATH || '/orders';

const s = {
  page:       { padding: '1.5rem' },
  toolbar:    { display: 'flex', gap: '0.75rem', alignItems: 'flex-end', marginBottom: '1rem', flexWrap: 'wrap' },
  input:      { ...F.input },
  label:      { display: 'flex', flexDirection: 'column', gap: '0.2rem', fontSize: T.xs, color: C.sage },
  btn:        { ...F.btnPrimary },
  btnGhost:   { ...F.btnSecondary },
  table:      { width: '100%', borderCollapse: 'collapse', background: C.white, borderRadius: '8px', overflow: 'hidden', border: `1px solid ${C.sageLight}` },
  th:         { ...F.tableHeader },
  td:         { ...F.tableCell },
  rowFlagged: { background: C.flagBg },
  rowNotPo:   { background: C.white, opacity: 0.45 },
  rowHover:   { cursor: 'pointer' },
  badge:      { ...F.badge },
  flagAlert:  { background: C.flagBg,    color: C.flagText,    border: `1px solid ${C.flagBorder}` },
  notPoBadge: { background: '#f3f4f6',   color: '#6b7280',     border: '1px solid #e5e7eb' },
  sourceEmail:{ background: C.sagePale,  color: C.olive },
  sourcePdf:  { background: C.limeLight, color: C.olive },
  sourceBoth: { background: C.limeLight, color: C.olive },
  statusOk:   { background: C.limeLight, color: C.olive },
  statusPend: { background: C.sagePale,  color: C.sage },
  empty:      { textAlign: 'center', padding: '3rem', color: C.sageMid, fontSize: T.base },
  error:      { ...F.errorBox },
  checkLabel: { display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: T.base, cursor: 'pointer', color: C.forest, paddingTop: '1.2rem' },
};

function sourceBadge(src) {
  if (src === 'email_and_pdf') return <span style={{ ...s.badge, ...s.sourceBoth }}>Email + PDF</span>;
  if (src === 'pdf_only')      return <span style={{ ...s.badge, ...s.sourcePdf }}>PDF</span>;
  return                              <span style={{ ...s.badge, ...s.sourceEmail }}>Email</span>;
}

function statusBadge(row) {
  if (row.extracted?.is_purchase_order === false) return <span style={{ ...s.badge, ...s.notPoBadge }}>Not a PO</span>;
  if (row.has_flags) return <span style={{ ...s.badge, ...s.flagAlert }}>Flagged</span>;
  // human_is_po: null = unverified, 0 = confirmed not-PO, 1 = confirmed PO
  if (row.extracted && row.human_is_po !== null && row.human_is_po !== undefined) {
    return <span style={{ ...s.badge, ...s.statusOk }}>Verified ✓</span>;
  }
  if (row.extracted) return <span style={{ ...s.badge, ...s.statusOk }}>Extracted</span>;
  return                   <span style={{ ...s.badge, ...s.statusPend }}>Pending</span>;
}

function fmt(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtCurrency(val, currency = 'AUD') {
  if (val == null) return '—';
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency }).format(val);
}

export default function Inbox() {
  const navigate = useNavigate();

  const [emails, setEmails]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [syncing, setSyncing]     = useState(false);
  const [error, setError]         = useState(null);
  const [syncMsg, setSyncMsg]     = useState(null);

  // Filters
  const [dateFrom, setDateFrom]   = useState('');
  const [dateTo, setDateTo]       = useState('');
  const [customer, setCustomer]   = useState('');
  const [flagged, setFlagged]     = useState(false);
  const [unread, setUnread]       = useState(false);
  const [posOnly, setPosOnly]     = useState(true);

  const fetchEmails = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (dateFrom)        params.set('dateFrom', dateFrom);
      if (dateTo)          params.set('dateTo', dateTo);
      if (customer.trim()) params.set('customer', customer.trim());
      if (flagged)         params.set('flagged', 'true');
      if (unread)          params.set('unread', 'true');

      const res = await fetch(`${BASE_API}/api/emails?${params}`);
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      setEmails(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, customer, flagged, unread]);

  useEffect(() => { fetchEmails(); }, [fetchEmails]);

  async function handleSync() {
    setSyncing(true);
    setSyncMsg(null);
    setError(null);
    try {
      const res = await fetch(`${BASE_API}/api/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inboxId: 'orders-au', maxResults: 50 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);
      setSyncMsg(`Synced — ${data.new} new emails, ${data.extracted} extracted${data.errors?.length ? `, ${data.errors.length} errors` : ''}.`);
      await fetchEmails();
    } catch (err) {
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div style={s.page}>
      <h2 style={{ marginBottom: '1rem', fontWeight: T.bold, fontSize: T.lg, color: C.forest }}>PO Inbox — orders@fablefood.co</h2>

      {error && <div style={s.error}>{error}</div>}
      {syncMsg && <div style={{ ...F.successBox }}>{syncMsg}</div>}

      {/* Toolbar */}
      <div style={s.toolbar}>
        <label style={s.label}>
          From
          <input type="date" style={s.input} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        </label>
        <label style={s.label}>
          To
          <input type="date" style={s.input} value={dateTo} onChange={e => setDateTo(e.target.value)} />
        </label>
        <label style={s.label}>
          Customer
          <input
            type="text" placeholder="Search customer…" style={{ ...s.input, width: '200px' }}
            value={customer} onChange={e => setCustomer(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && fetchEmails()}
          />
        </label>
        <label style={s.checkLabel}>
          <input type="checkbox" checked={flagged} onChange={e => setFlagged(e.target.checked)} />
          Flagged only
        </label>
        <label style={s.checkLabel}>
          <input type="checkbox" checked={unread} onChange={e => setUnread(e.target.checked)} />
          Unread only
        </label>
        <label style={s.checkLabel}>
          <input type="checkbox" checked={posOnly} onChange={e => setPosOnly(e.target.checked)} />
          POs only
        </label>
        <button style={{ ...s.btn, ...s.btnGhost }} onClick={fetchEmails} disabled={loading}>Refresh</button>
        <button style={{ ...s.btn, ...s.btnPrimary }} onClick={handleSync} disabled={syncing}>
          {syncing ? 'Syncing…' : 'Refresh Inbox'}
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div style={s.empty}>Loading…</div>
      ) : emails.length === 0 ? (
        <div style={s.empty}>No POs found. Click "Refresh Inbox" to fetch emails from Gmail.</div>
      ) : (
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>Date Received</th>
              <th style={s.th}>Customer</th>
              <th style={s.th}>Subject</th>
              <th style={s.th}>PO Number</th>
              <th style={s.th}>Delivery Date</th>
              <th style={s.th}>Order Total</th>
              <th style={s.th}>Source</th>
              <th style={s.th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {emails
              .filter(row => !posOnly || row.extracted?.is_purchase_order !== false)
              .map(row => {
              const ext = row.extracted || {};
              const isUnread = !row.is_read;
              const isNotPo = ext.is_purchase_order === false;
              return (
                <tr
                  key={row.message_id}
                  style={{ ...(isNotPo ? s.rowNotPo : row.has_flags ? s.rowFlagged : {}), ...s.rowHover }}
                  onClick={() => navigate(`/detail/${row.message_id}`)}
                  onMouseEnter={e => e.currentTarget.style.opacity = isNotPo ? '0.3' : '0.85'}
                  onMouseLeave={e => e.currentTarget.style.opacity = isNotPo ? '0.45' : '1'}
                >
                  <td style={s.td}>{fmt(row.received_at)}</td>
                  <td style={{ ...s.td, fontWeight: isUnread && !isNotPo ? 700 : 400 }}>
                    {ext.customer_name || row.sender_name || row.sender_email || '—'}
                  </td>
                  <td style={{ ...s.td, fontWeight: isUnread && !isNotPo ? 700 : 400, maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {row.subject}
                  </td>
                  <td style={s.td}>{ext.po_number || '—'}</td>
                  <td style={s.td}>{ext.requested_delivery_date ? fmt(ext.requested_delivery_date) : (ext.requested_delivery_day || '—')}</td>
                  <td style={{ ...s.td, fontVariantNumeric: 'tabular-nums' }}>
                    {isNotPo ? '—' : fmtCurrency(ext.order_total, ext.currency || 'AUD')}
                  </td>
                  <td style={s.td}>{isNotPo ? '—' : sourceBadge(row.data_source)}</td>
                  <td style={s.td}>{statusBadge(row)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
