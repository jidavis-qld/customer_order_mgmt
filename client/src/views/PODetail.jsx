import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { C, T, F } from '../design.js';

const BASE_API = import.meta.env.VITE_BASE_PATH || '/orders';

const s = {
  page:       { padding: '1.5rem', maxWidth: '960px' },
  back:       { color: C.olive, cursor: 'pointer', background: 'none', border: 'none', fontSize: T.base, marginBottom: '1rem', display: 'block', padding: 0, fontFamily: T.fontFamily },
  title:      { fontSize: T.lg, fontWeight: T.bold, color: C.forest, marginBottom: '0.25rem' },
  subtitle:   { color: C.sage, fontSize: T.base, marginBottom: '1.25rem' },
  flagBox:    { background: C.flagBg, border: `1px solid ${C.flagBorder}`, borderRadius: '8px', padding: '0.9rem 1.1rem', marginBottom: '1.25rem' },
  flagTitle:  { fontWeight: T.bold, color: C.flagText, marginBottom: '0.4rem', fontSize: T.base },
  flagItem:   { color: C.flagText, fontSize: T.sm, paddingLeft: '1rem', marginBottom: '0.2rem' },
  card:       { ...F.card },
  cardTitle:  { ...F.cardTitle },
  grid:       { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem' },
  field:      { display: 'flex', flexDirection: 'column', gap: '0.1rem' },
  fieldLabel: { fontSize: T.xs, color: C.sageMid, fontWeight: T.bold, textTransform: 'uppercase', letterSpacing: T.upper },
  fieldValue: { fontSize: T.base, color: C.forest },
  nullValue:  { fontSize: T.base, color: C.sageLight, fontStyle: 'italic' },
  table:      { width: '100%', borderCollapse: 'collapse' },
  th:         { ...F.tableHeader, padding: '0.5rem 0.8rem' },
  td:         { ...F.tableCell,   padding: '0.5rem 0.8rem' },
  badge:      { ...F.badge },
  summary:    { cursor: 'pointer', fontWeight: T.bold, fontSize: T.base, color: C.olive, userSelect: 'none', marginBottom: '0.25rem' },
  pre:        { background: C.sagePale, borderRadius: '6px', padding: '0.75rem 1rem', fontSize: T.xs, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: C.forest, fontFamily: 'monospace' },
  sourceChip: { display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: T.xs, padding: '0.2rem 0.6rem', borderRadius: '20px', background: C.limeLight, color: C.olive, marginLeft: '0.5rem' },
  attachOk:   { color: C.olive,     fontSize: T.sm },
  attachErr:  { color: C.errorText, fontSize: T.sm },
  error:      { ...F.errorBox },
};

function Field({ label, value, currency }) {
  const display = value == null || value === ''
    ? <span style={s.nullValue}>Not found</span>
    : typeof value === 'number'
      ? currency
        ? new Intl.NumberFormat('en-AU', { style: 'currency', currency }).format(value)
        : value.toLocaleString()
      : String(value);

  return (
    <div style={s.field}>
      <span style={s.fieldLabel}>{label}</span>
      <span style={s.fieldValue}>{display}</span>
    </div>
  );
}

function sourceLabel(src) {
  if (src === 'email_and_pdf') return 'Email + PDF';
  if (src === 'pdf_only') return 'PDF only';
  return 'Email only';
}

export default function PODetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [email, setEmail]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${BASE_API}/api/emails/${encodeURIComponent(id)}`);
        if (!res.ok) throw new Error(`Server error ${res.status}`);
        setEmail(await res.json());
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) return <div style={s.page}>Loading…</div>;
  if (error)   return <div style={s.page}><div style={s.error}>{error}</div></div>;
  if (!email)  return <div style={s.page}>Not found.</div>;

  const ext = email.extracted || {};
  const flags = Array.isArray(ext.flags) ? ext.flags : [];
  const lineItems = Array.isArray(ext.line_items) ? ext.line_items : [];
  const currency = ext.currency || 'AUD';

  return (
    <div style={s.page}>
      <button style={s.back} onClick={() => navigate(-1)}>← Back to Inbox</button>

      <div>
        <h2 style={s.title}>
          {email.subject || '(no subject)'}
          {email.data_source && <span style={s.sourceChip}>{sourceLabel(email.data_source)}</span>}
        </h2>
        <p style={s.subtitle}>
          From {email.sender_name || email.sender_email}
          {email.sender_name && email.sender_email && ` <${email.sender_email}>`} · {' '}
          {email.received_at ? new Date(email.received_at).toLocaleString('en-AU') : '—'}
        </p>
      </div>

      {/* Flags */}
      {flags.length > 0 && (
        <div style={s.flagBox}>
          <div style={s.flagTitle}>⚠ {flags.length} item{flags.length !== 1 ? 's' : ''} require attention</div>
          {flags.map((f, i) => <div key={i} style={s.flagItem}>• {f}</div>)}
        </div>
      )}

      {/* Customer & Order Info */}
      <div style={s.card}>
        <div style={s.cardTitle}>Order Details</div>
        <div style={s.grid}>
          <Field label="Customer Name"     value={ext.customer_name} />
          <Field label="Customer Email"    value={ext.customer_email} />
          <Field label="Customer Phone"    value={ext.customer_phone} />
          <Field label="PO Number"         value={ext.po_number} />
          <Field label="Order Date"        value={ext.order_date} />
          <Field label="Delivery Date"     value={ext.requested_delivery_date} />
          <Field label="Delivery Day"      value={ext.requested_delivery_day} />
          <Field label="Currency"          value={ext.currency} />
          <Field label="Order Total"       value={ext.order_total} currency={currency} />
          <Field label="Payment Terms"     value={ext.payment_terms} />
        </div>
      </div>

      {/* Delivery */}
      <div style={s.card}>
        <div style={s.cardTitle}>Delivery</div>
        <div style={s.grid}>
          <Field label="Delivery Address"  value={ext.delivery_address} />
          <Field label="Special Instructions" value={ext.special_instructions} />
        </div>
      </div>

      {/* Line Items */}
      <div style={s.card}>
        <div style={s.cardTitle}>Line Items ({lineItems.length})</div>
        {lineItems.length === 0 ? (
          <span style={s.nullValue}>No line items extracted</span>
        ) : (
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Product</th>
                <th style={s.th}>SKU / Code</th>
                <th style={s.th}>Qty</th>
                <th style={s.th}>Unit</th>
                <th style={s.th}>Unit Price</th>
                <th style={s.th}>Line Total</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((item, i) => (
                <tr key={i}>
                  <td style={s.td}>{item.product_name || '—'}</td>
                  <td style={{ ...s.td, color: '#888' }}>{item.sku_or_code || '—'}</td>
                  <td style={s.td}>{item.quantity ?? '—'}</td>
                  <td style={s.td}>{item.unit || '—'}</td>
                  <td style={s.td}>
                    {item.unit_price != null
                      ? new Intl.NumberFormat('en-AU', { style: 'currency', currency }).format(item.unit_price)
                      : <span style={s.nullValue}>—</span>}
                  </td>
                  <td style={{ ...s.td, fontVariantNumeric: 'tabular-nums' }}>
                    {item.line_total != null
                      ? new Intl.NumberFormat('en-AU', { style: 'currency', currency }).format(item.line_total)
                      : <span style={s.nullValue}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Attachments */}
      {email.attachments && email.attachments.length > 0 && (
        <div style={s.card}>
          <div style={s.cardTitle}>Attachments</div>
          {email.attachments.map(att => (
            <div key={att.id} style={{ marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span style={{ fontSize: '0.88rem' }}>{att.filename}</span>
              {att.size_bytes > 0 && <span style={{ color: '#999', fontSize: '0.78rem' }}>({Math.round(att.size_bytes / 1024)} KB)</span>}
              {att.parse_error
                ? <span style={s.attachErr}>⚠ Parse failed</span>
                : <span style={s.attachOk}>✓ Text extracted</span>}
            </div>
          ))}
        </div>
      )}

      {/* Collapsible raw data */}
      <div style={s.card}>
        <div style={s.cardTitle}>Raw Data</div>

        <details style={{ marginBottom: '0.75rem' }}>
          <summary style={s.summary}>Email body</summary>
          <pre style={s.pre}>{email.body_text || '(empty)'}</pre>
        </details>

        {email.attachments?.filter(a => a.pdf_text).map(att => (
          <details key={att.id} style={{ marginBottom: '0.75rem' }}>
            <summary style={s.summary}>PDF text — {att.filename}</summary>
            <pre style={s.pre}>{att.pdf_text}</pre>
          </details>
        ))}

        <details>
          <summary style={s.summary}>Extracted JSON (Claude output)</summary>
          <pre style={s.pre}>{JSON.stringify(email.extracted, null, 2)}</pre>
        </details>
      </div>
    </div>
  );
}
