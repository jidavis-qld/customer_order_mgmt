// PHASE 1: READ ONLY
// Calls the Anthropic Claude API to extract structured PO data.
// Results are cached in SQLite — Claude is never called twice for the same email
// unless a human correction forces a re-extraction (forceReExtract: true).

const Anthropic = require('@anthropic-ai/sdk');
const db = require('./db');

const MODEL = 'claude-sonnet-4-6';

const SYSTEM_PROMPT = `You are a purchase order extraction assistant for Fable Food, a food supplier based in Australia.

FIRST, determine whether this email is an actual new purchase order from a customer, or something else (e.g. an internal team discussion, a contractor update, a delivery status message, a reply thread about an existing order, or a non-order email that happened to arrive in the orders inbox).

Set "is_purchase_order" accordingly:
- true  → the email contains a new or amended purchase order from a customer placing product orders
- false → the email is an internal update, discussion, status message, or anything that is not a customer placing an order

If is_purchase_order is false, set all order fields to null, set data_source to "email_only", and add a brief "not_a_po" flag describing what the email actually is (e.g. "not_a_po: internal team discussion", "not_a_po: delivery status update from Hornbill", "not_a_po: reply thread, not a new order").

If is_purchase_order is true, extract all fields below (use null if not found — never guess or hallucinate values):

- customer_name: string
- customer_email: string
- customer_phone: string
- po_number: string
- order_date: string (ISO format if determinable)
- requested_delivery_date: string (ISO format if determinable)
- requested_delivery_day: string (e.g. "Tuesday", "every Monday and Thursday")
- delivery_address: string
- line_items: array of {
    product_name: string,
    sku_or_code: string or null,
    quantity: number,
    unit: string (e.g. "kg", "case", "each"),
    unit_price: number or null,
    line_total: number or null
  }
- order_total: number or null
- currency: string (default "AUD" for Australian customers)
- special_instructions: string (delivery notes, access requirements, temperature handling, etc.)
- payment_terms: string or null
- data_source: one of "email_only", "pdf_only", "email_and_pdf"
- flags: array of strings — flag anything that needs human attention, including:
    - missing pricing
    - missing delivery date
    - ambiguous quantities or units
    - PDF could not be parsed
    - conflicting information between email and PDF
    - unusual delivery requirements

Return only valid JSON with no commentary outside it.`;

/**
 * Build thread context to inject when the current email is a reply in an
 * existing Gmail thread. This tells Claude that prior messages in the thread
 * have already been seen, so this reply is unlikely to be a new PO.
 *
 * @param {string} currentMessageId
 * @param {string} threadId
 * @returns {string}
 */
function buildThreadContext(currentMessageId, threadId) {
  if (!threadId) return '';

  const threadEmails = db.getThreadEmails(threadId);
  // Only earlier messages are relevant context
  const earlier = threadEmails.filter(m => m.message_id !== currentMessageId);
  if (earlier.length === 0) return '';

  const position = threadEmails.findIndex(m => m.message_id === currentMessageId) + 1;
  const total = threadEmails.length;

  let ctx = `\n\n--- THREAD CONTEXT ---\n`;
  ctx += `This is message ${position} of ${total} in an email thread. Earlier messages in this thread:\n`;

  earlier.forEach((m, i) => {
    let classification = '';
    if (m.extracted_json) {
      try {
        const ext = JSON.parse(m.extracted_json);
        classification = ext.is_purchase_order === true
          ? ' [classified: IS a PO]'
          : ext.is_purchase_order === false
            ? ' [classified: NOT a PO]'
            : '';
      } catch (_) {}
    }
    const dateStr = m.received_at ? new Date(m.received_at).toLocaleDateString('en-AU') : '';
    ctx += `  ${i + 1}. "${m.subject}" — from ${m.sender_name || m.sender_email} on ${dateStr}${classification}\n`;
  });

  ctx += `\nIMPORTANT: Because this is a reply in an existing thread, it is most likely a follow-up question, confirmation, or update — NOT a new purchase order. Only classify it as is_purchase_order: true if it explicitly contains NEW order line items or explicitly amends/replaces a prior order.\n`;
  ctx += `--- END THREAD CONTEXT ---`;

  return ctx;
}

/**
 * Build few-shot learning context from human-verified examples.
 * Injected into the user message so Claude calibrates to Fable's specific
 * email patterns (supplier formats, contractor updates, internal threads, etc.)
 *
 * @param {Array}  examples         From db.getFeedbackExamples()
 * @param {Array}  senderReputation From db.getSenderReputation()
 * @returns {string}
 */
function buildLearningContext(examples, senderReputation) {
  let ctx = '';

  // Sender reputation (only include confident patterns: >=80% consistent)
  const knownPO    = senderReputation.filter(s => s.total >= 2 && s.po_count / s.total >= 0.8);
  const knownNonPO = senderReputation.filter(s => s.total >= 2 && (s.total - s.po_count) / s.total >= 0.8);

  if (knownPO.length > 0 || knownNonPO.length > 0) {
    ctx += '\n\n--- SENDER REPUTATION (learned from your inbox) ---\n';
    if (knownPO.length > 0) {
      ctx += 'These senders reliably send purchase orders:\n';
      knownPO.forEach(s => {
        ctx += `  - ${s.sender_email}${s.sender_name ? ` (${s.sender_name})` : ''} — ${s.po_count}/${s.total} verified POs\n`;
      });
    }
    if (knownNonPO.length > 0) {
      ctx += 'These senders never send purchase orders:\n';
      knownNonPO.forEach(s => {
        const nonPo = s.total - s.po_count;
        ctx += `  - ${s.sender_email}${s.sender_name ? ` (${s.sender_name})` : ''} — ${nonPo}/${s.total} verified non-POs\n`;
      });
    }
    ctx += '---';
  }

  // Few-shot examples
  if (examples.length > 0) {
    ctx += '\n\n--- VERIFIED EXAMPLES FROM YOUR INBOX ---\n';
    examples.forEach((ex, i) => {
      const label = ex.is_po ? 'IS a purchase order' : 'NOT a purchase order';
      const threadNote = ex.is_thread_reply ? ', thread reply' : ', new thread';
      ctx += `\nExample ${i + 1} (${label}${threadNote}):\n`;
      ctx += `Sender: ${ex.sender_name ? ex.sender_name + ' ' : ''}<${ex.sender_email}>\n`;
      ctx += `Subject: ${ex.subject}\n`;
      ctx += `Body: ${(ex.body_snippet || '').trim()}${ex.body_snippet && ex.body_snippet.length >= 400 ? '...' : ''}\n`;
    });
    ctx += '--- END EXAMPLES ---';
  }

  return ctx;
}

/**
 * Build the user message combining email body, thread context, learning context, and PDF text.
 *
 * @param {string} emailBody
 * @param {Array<{ filename: string, text: string, error: boolean }>} pdfResults
 * @param {string} threadContext      From buildThreadContext()
 * @param {string} learningContext    From buildLearningContext()
 * @returns {string}
 */
function buildUserMessage(emailBody, pdfResults = [], threadContext = '', learningContext = '') {
  let msg = `EMAIL BODY:\n${emailBody || '(no body text)'}`;

  if (threadContext) {
    msg += threadContext;
  }

  for (const pdf of pdfResults) {
    msg += `\n\n---\nPDF ATTACHMENT: "${pdf.filename}"\n`;
    if (pdf.error) {
      msg += `(Could not extract text from this PDF — may be scanned or encrypted. Flag for manual review.)`;
    } else {
      msg += pdf.text;
    }
  }

  if (learningContext) {
    msg += learningContext;
  }

  msg += `\n\n---\nIf both sources contain order information, reconcile them. The PDF is typically the authoritative source for line items and pricing. The email body may contain delivery instructions or context not in the PDF.`;

  return msg;
}

/**
 * Call Claude to extract PO data, then cache the result in SQLite.
 * If a cached result already exists for this messageId, return it immediately
 * unless forceReExtract is true (used after human corrections).
 *
 * @param {object}  params
 * @param {string}  params.messageId
 * @param {string}  params.emailBody
 * @param {Array}   params.pdfResults
 * @param {boolean} [params.forceReExtract=false]
 * @returns {object}  Parsed JSON from Claude
 */
async function extractPO({ messageId, emailBody, pdfResults = [], forceReExtract = false }) {
  // Cache check — skip if already extracted (unless forced by human correction)
  if (!forceReExtract && db.hasExtraction(messageId)) {
    const row = db.getEmail(messageId);
    try {
      return JSON.parse(row.extracted_json);
    } catch {
      // Corrupted cache entry — re-extract
    }
  }

  // ── Build context ──────────────────────────────────────────────────────────

  // Thread context: tell Claude where this email sits in its conversation thread
  const email = db.getEmail(messageId);
  const threadCtx = buildThreadContext(messageId, email?.thread_id);
  if (threadCtx) {
    const pos = threadCtx.match(/message (\d+) of (\d+)/);
    console.log(`[extract] Thread context: message ${pos ? pos[1] : '?'} of ${pos ? pos[2] : '?'} in thread ${email?.thread_id}`);
  }

  // Learning context: inject verified examples + sender reputation
  const examples         = db.getFeedbackExamples(10);
  const senderReputation = db.getSenderReputation();
  const learningCtx      = buildLearningContext(examples, senderReputation);
  if (examples.length > 0) {
    console.log(`[extract] Learning context: ${examples.filter(e => e.is_po).length} PO examples, ${examples.filter(e => !e.is_po).length} non-PO examples`);
  }

  // ── Call Claude ────────────────────────────────────────────────────────────

  const client      = new Anthropic();
  const userMessage = buildUserMessage(emailBody, pdfResults, threadCtx, learningCtx);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });

  const rawText = response.content[0]?.text || '{}';
  let parsed;
  try {
    // Strip any accidental markdown code fences
    const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    parsed = JSON.parse(cleaned);
  } catch (err) {
    console.error('[extract.js] Failed to parse Claude response as JSON:', err.message);
    parsed = {
      flags: ['Claude response could not be parsed as JSON — manual review required'],
      data_source: pdfResults.length > 0 ? 'email_and_pdf' : 'email_only',
      _raw: rawText,
    };
  }

  // Determine data_source if Claude didn't set it
  if (!parsed.data_source) {
    const hasPdfText = pdfResults.some(p => !p.error && p.text);
    const hasEmail = !!(emailBody && emailBody.trim());
    if (hasPdfText && hasEmail)  parsed.data_source = 'email_and_pdf';
    else if (hasPdfText)         parsed.data_source = 'pdf_only';
    else                         parsed.data_source = 'email_only';
  }

  // Add parse error flags for any broken PDFs
  const parseErrors = pdfResults.filter(p => p.error);
  if (parseErrors.length > 0) {
    parsed.flags = parsed.flags || [];
    parseErrors.forEach(p => {
      if (!parsed.flags.includes('PDF could not be parsed')) {
        parsed.flags.push(`PDF could not be parsed: ${p.filename}`);
      }
    });
  }

  const hasFlags = Array.isArray(parsed.flags) && parsed.flags.length > 0;

  db.upsertExtraction({
    message_id:     messageId,
    extracted_json: JSON.stringify(parsed),
    extracted_at:   new Date().toISOString(),
    model:          MODEL,
    data_source:    parsed.data_source,
    has_flags:      hasFlags ? 1 : 0,
  });

  return parsed;
}

module.exports = { extractPO };
