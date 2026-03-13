// PHASE 1: READ ONLY
// Calls the Anthropic Claude API to extract structured PO data.
// Results are cached in SQLite — Claude is never called twice for the same email.

const Anthropic = require('@anthropic-ai/sdk');
const db = require('./db');

const MODEL = 'claude-sonnet-4-6';

const SYSTEM_PROMPT = `You are a purchase order extraction assistant for Fable Food, a food supplier based in Australia. Extract all relevant information from the content below (which may include an email body and/or a PDF attachment) and return it as structured JSON.

You will be given the email body and, where present, the text extracted from a PDF attachment. The PDF is typically the authoritative source for line items and pricing. Use the email body for delivery context, instructions, or any information not captured in the PDF.

Extract the following fields (use null if not found — never guess or hallucinate values):

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
 * Build the user message combining email body and PDF text.
 *
 * @param {string} emailBody
 * @param {Array<{ filename: string, text: string, error: boolean }>} pdfResults
 * @returns {string}
 */
function buildUserMessage(emailBody, pdfResults = []) {
  let msg = `EMAIL BODY:\n${emailBody || '(no body text)'}`;

  for (const pdf of pdfResults) {
    msg += `\n\n---\nPDF ATTACHMENT: "${pdf.filename}"\n`;
    if (pdf.error) {
      msg += `(Could not extract text from this PDF — may be scanned or encrypted. Flag for manual review.)`;
    } else {
      msg += pdf.text;
    }
  }

  msg += `\n\n---\nIf both sources contain order information, reconcile them. The PDF is typically the authoritative source for line items and pricing. The email body may contain delivery instructions or context not in the PDF.`;

  return msg;
}

/**
 * Call Claude to extract PO data, then cache the result in SQLite.
 * If a cached result already exists for this messageId, return it immediately.
 *
 * @param {object} params
 * @param {string} params.messageId
 * @param {string} params.emailBody
 * @param {Array<{ filename: string, text: string, error: boolean }>} params.pdfResults
 * @returns {object}  Parsed JSON from Claude
 */
async function extractPO({ messageId, emailBody, pdfResults = [] }) {
  // Cache check — never call Claude twice for the same email
  if (db.hasExtraction(messageId)) {
    const row = db.getEmail(messageId);
    try {
      return JSON.parse(row.extracted_json);
    } catch {
      // Corrupted cache entry — re-extract
    }
  }

  const client = new Anthropic();
  const userMessage = buildUserMessage(emailBody, pdfResults);

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
