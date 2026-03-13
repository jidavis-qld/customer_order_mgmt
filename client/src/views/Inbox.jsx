import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

const BASE_API = import.meta.env.VITE_BASE_PATH || '/orders';

const s = {
  page:      { padding: '1.5rem' },
  toolbar:   { display: 'flex', gap: '0.75rem', alignItems: 'flex-end', marginBottom: '1rem', flexWrap: 'wrap' },
  input:     { padding: '0.45rem 0.7rem', border: '1px solid #ccc', borderRadius: '6px', fontSize: '0.9rem', background: '#fff' },
  label:     { display: 'flex', flexDirection: 'column', gap: '0.2rem', fontSize: '0.8rem', color: '#555' },
  btn:       { padding: '0.5rem 1.1rem', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600 },
  btnPrimary:{ background: '#2d6a4f', color: '#fff' },
  btnGhost:  { background: '#fff', color: '#333', border: '1px solid #ccc' },
  table:     { width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' },
  th:        { padding: '0.7rem 1rem', background: '#f0f0f0', textAlign: 'left', fontSize: '0.82rem', fontWeight: 600, color: '#444', borderBottom: '1px solid #ddd', whiteSpace: 'nowrap' },
  td:        { padding: '0.7rem 1rem', fontSize: '0.88rem', borderBottom: '1px solid #f0f0f0', verticalAlign: 'middle' },
  rowFlagged:{ background: '#fffbec' },
  rowHover:  { cursor: 'pointer' },
  badge:     { display: 'inline-block', padding: '0.2rem 0.55rem', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' },
  flagAlert: { background: '#fff3cd', color: '#856404', border: '1px solid #ffc107' },
  sourceEmail: { background: '#e8f4fd', color: '#0c5c8a' },
  sourcePdf:   { background: '#edf7ee', color: '#1a5c2a' },
  sourceBoth:  { background: '#f0ecff', color: '#4c2f8a' },
  statusOk:    { background: '#edf7ee', color: '#1a5c2a' },
  statusPend:  { background: '#f0f0f0', color: '#555' },
  empty:     { textAlign: 'center', padding: '3rem', color: '#888' },
  syncing:   { color: '#2d6a4f', fontWeight: 600 },
  error:     { background: '#fff0f0', border: '1px solid #f5c6cb', borderRadius: '6px', padding: '0.75rem 1rem', marginBottom: '1rem', color: '#721c24', fontSize: '0.9rem' },
  checkLabel:{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.88rem', cursor: 'pointer', paddingTop: '1.2rem' },
};

function sourceBadge(src) {
  if (src === 'email_and_pdf') return <span style={{ ...s.badge, ...s.sourceBoth }}>Email + PDF</span>;
  if (src === 'pdf_only')      return <span style={{ ...s.badge, ...s.sourcePdf }}>PDF</span>;
  return                              <span style={{ ...s.badge, ...s.sourceEmail }}>Email</span>;
}

function statusBadge(row) {
  if (row.has_flags) return <span style={{ ...s.badge, ...s.flagAlert }}>Flagged</span>;
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
      <h2 style={{ marginBottom: '1rem', fontWeight: 700, fontSize: '1.3rem' }}>PO Inbox — orders@fablefood.co</h2>

      {error && <div style={s.error}>{error}</div>}
      {syncMsg && <div style={{ ...s.error, background: '#edf7ee', color: '#1a5c2a', borderColor: '#86efac' }}>{syncMsg}</div>}

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
        <button style={{ ...s.btn, ...s.btnGhost }} onClick={fetchEmails} disabled={loading}>Refresh</button>
        <button style={{ ...s.btn, ...s.btnPrimary }} onClick={handleSync} disabled={syncing}>
          {syncing ? <span style={s.syncing}>Syncing…</span> : 'Refresh Inbox'}
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
            {emails.map(row => {
              const ext = row.extracted || {};
              const isUnread = !row.is_read;
              return (
                <tr
                  key={row.message_id}
                  style={{ ...(row.has_flags ? s.rowFlagged : {}), ...s.rowHover }}
                  onClick={() => navigate(`/detail/${row.message_id}`)}
                  onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                >
                  <td style={s.td}>{fmt(row.received_at)}</td>
                  <td style={{ ...s.td, fontWeight: isUnread ? 700 : 400 }}>
                    {ext.customer_name || row.sender_name || row.sender_email || '—'}
                  </td>
                  <td style={{ ...s.td, fontWeight: isUnread ? 700 : 400, maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {row.subject}
                  </td>
                  <td style={s.td}>{ext.po_number || '—'}</td>
                  <td style={s.td}>{ext.requested_delivery_date ? fmt(ext.requested_delivery_date) : (ext.requested_delivery_day || '—')}</td>
                  <td style={{ ...s.td, fontVariantNumeric: 'tabular-nums' }}>
                    {fmtCurrency(ext.order_total, ext.currency || 'AUD')}
                  </td>
                  <td style={s.td}>{sourceBadge(row.data_source)}</td>
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
