import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { C, T, F } from '../design.js';

const BASE_API = import.meta.env.VITE_BASE_PATH || '/orders';

const s = {
  page:       { padding: '1.5rem', maxWidth: '960px' },
  back:       { color: C.olive, cursor: 'pointer', background: 'none', border: 'none', fontSize: T.base, marginBottom: '1rem', display: 'block', padding: 0, fontFamily: T.fontFamily },
  title:      { fontSize: T.lg, fontWeight: T.bold, color: C.forest, marginBottom: '0.25rem' },
  subtitle:   { color: C.sage, fontSize: T.base, marginBottom: '1rem' },
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

  // Feedback bar
  feedbackBar: {
    background: C.sagePale,
    border: `1px solid ${C.sageLight}`,
    borderRadius: '8px',
    padding: '0.75rem 1rem',
    marginBottom: '1.25rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    flexWrap: 'wrap',
  },
  feedbackVerified: {
    ...F.successBox,
    marginBottom: '1.25rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    flexWrap: 'wrap',
  },
  feedbackReextract: {
    background: C.flagBg,
    border: `1px solid ${C.flagBorder}`,
    borderRadius: '8px',
    padding: '0.65rem 1rem',
    marginBottom: '0.75rem',
    color: C.flagText,
    fontSize: T.sm,
  },
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

/**
 * FeedbackBar — confirm or correct Claude's classification.
 * Verified examples feed into Claude's prompt for future emails (few-shot learning).
 */
function FeedbackBar({ claudeIsPo, humanIsPo, feedbackAt, onFeedback, saving, fbError, willReExtract, onChangeRequest }) {
  const isVerified = humanIsPo !== null && humanIsPo !== undefined;
  const effectiveIsPo = isVerified ? !!humanIsPo : claudeIsPo;
  const classLabel = effectiveIsPo ? 'Purchase Order' : 'Not a Purchase Order';

  if (isVerified) {
    const dateStr = feedbackAt
      ? new Date(feedbackAt).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
      : null;
    return (
      <>
        {willReExtract && (
          <div style={s.feedbackReextract}>
            ⚠ Marked as PO — click <strong>Refresh Inbox</strong> to re-extract line items with Claude
          </div>
        )}
        <div style={s.feedbackVerified}>
          <span style={{ fontWeight: T.bold }}>✓ Verified: {classLabel}</span>
          {dateStr && <span style={{ color: C.sage, fontSize: T.xs }}>{dateStr}</span>}
          <span style={{ color: C.sage, fontSize: T.xs }}>· Helps Claude learn your inbox</span>
          <button
            style={{ background: 'none', border: 'none', color: C.olive, cursor: 'pointer', fontSize: T.sm, padding: 0, fontFamily: T.fontFamily, textDecoration: 'underline' }}
            onClick={onChangeRequest}
          >
            Change
          </button>
        </div>
      </>
    );
  }

  return (
    <div style={s.feedbackBar}>
      <span style={{ fontSize: T.sm, color: C.sage, flexShrink: 0 }}>
        Claude classified this as: <strong style={{ color: C.forest }}>{classLabel}</strong> — correct?
      </span>
      <button
        style={{ ...F.btnPrimary, padding: '0.3rem 0.85rem', fontSize: T.sm, fontWeight: T.normal, opacity: saving ? 0.6 : 1 }}
        disabled={saving}
        onClick={() => onFeedback(claudeIsPo)}
      >
        ✓ Yes
      </button>
      <button
        style={{ ...F.btnSecondary, padding: '0.3rem 0.85rem', fontSize: T.sm, opacity: saving ? 0.6 : 1 }}
        disabled={saving}
        onClick={() => onFeedback(!claudeIsPo)}
      >
        ✗ No — it's {claudeIsPo ? 'NOT a PO' : 'a PO'}
      </button>
      {fbError && <span style={{ color: C.errorText, fontSize: T.xs }}>{fbError}</span>}
    </div>
  );
}

export default function PODetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [email, setEmail]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  // Feedback state — local copies so the UI updates instantly without a refetch
  const [localHumanIsPo, setLocalHumanIsPo] = useState(null);
  const [feedbackAt, setFeedbackAt]         = useState(null);
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [feedbackError, setFeedbackError]   = useState(null);
  const [willReExtract, setWillReExtract]   = useState(false);

  // Re-extract state
  const [reExtracting, setReExtracting] = useState(false);
  const [reExtractError, setReExtractError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${BASE_API}/api/emails/${encodeURIComponent(id)}`);
        if (!res.ok) throw new Error(`Server error ${res.status}`);
        const data = await res.json();
        setEmail(data);
        setLocalHumanIsPo(data.human_is_po ?? null);
        setFeedbackAt(data.human_feedback_at ?? null);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  async function handleReExtract() {
    setReExtracting(true);
    setReExtractError(null);
    try {
      const res = await fetch(`${BASE_API}/api/emails/${encodeURIComponent(id)}/reextract`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);
      // Reload the full email so all fields update
      const res2 = await fetch(`${BASE_API}/api/emails/${encodeURIComponent(id)}`);
      const updated = await res2.json();
      setEmail(updated);
      setLocalHumanIsPo(updated.human_is_po ?? null);
      setFeedbackAt(updated.human_feedback_at ?? null);
      setWillReExtract(false);
    } catch (err) {
      setReExtractError(err.message);
    } finally {
      setReExtracting(false);
    }
  }

  async function handleFeedback(isPo) {
    setFeedbackSaving(true);
    setFeedbackError(null);
    try {
      const res = await fetch(`${BASE_API}/api/emails/${encodeURIComponent(id)}/feedback`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_purchase_order: isPo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);
      setLocalHumanIsPo(isPo ? 1 : 0);
      setFeedbackAt(new Date().toISOString());
      setWillReExtract(data.willReExtract || false);
    } catch (err) {
      setFeedbackError(err.message);
    } finally {
      setFeedbackSaving(false);
    }
  }

  if (loading) return <div style={s.page}>Loading…</div>;
  if (error)   return <div style={s.page}><div style={s.error}>{error}</div></div>;
  if (!email)  return <div style={s.page}>Not found.</div>;

  const ext = email.extracted || {};
  const flags = Array.isArray(ext.flags) ? ext.flags : [];
  const lineItems = Array.isArray(ext.line_items) ? ext.line_items : [];
  const currency = ext.currency || 'AUD';
  // claudeIsPo: true unless Claude explicitly returned is_purchase_order: false
  const claudeIsPo = ext.is_purchase_order !== false;

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

      {/* Feedback / learning bar — only when email has been extracted */}
      {email.extracted && (
        <FeedbackBar
          claudeIsPo={claudeIsPo}
          humanIsPo={localHumanIsPo}
          feedbackAt={feedbackAt}
          onFeedback={handleFeedback}
          saving={feedbackSaving}
          fbError={feedbackError}
          willReExtract={willReExtract}
          onChangeRequest={() => { setLocalHumanIsPo(null); setWillReExtract(false); }}
        />
      )}

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
          <Field label="Delivery Address"     value={ext.delivery_address} />
          <Field label="Time Slot"            value={ext.time_slot} />
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
            <div key={att.id} style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.88rem', color: C.forest }}>{att.filename}</span>
              {att.size_bytes > 0 && <span style={{ color: C.sageMid, fontSize: '0.78rem' }}>({Math.round(att.size_bytes / 1024)} KB)</span>}
              {att.parse_error
                ? <span style={s.attachErr}>⚠ Parse failed</span>
                : <span style={s.attachOk}>✓ Text extracted</span>}
              <a
                href={`${BASE_API}/api/attachments/${encodeURIComponent(att.id)}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ ...F.btnSecondary, textDecoration: 'none', fontSize: T.xs, padding: '0.2rem 0.65rem' }}
              >
                View PDF
              </a>
            </div>
          ))}
        </div>
      )}

      {/* Collapsible raw data */}
      <div style={s.card}>
        <div style={{ ...s.cardTitle, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>Raw Data</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {reExtractError && <span style={{ color: C.errorText, fontSize: T.xs }}>{reExtractError}</span>}
            <button
              style={{ ...F.btnSecondary, fontSize: T.xs, padding: '0.2rem 0.7rem' }}
              disabled={reExtracting}
              onClick={handleReExtract}
              title="Re-run Claude on this email with the latest prompt"
            >
              {reExtracting ? 'Re-extracting…' : '↺ Re-extract'}
            </button>
          </span>
        </div>

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
