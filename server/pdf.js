// PHASE 1: READ ONLY
// PDF text extraction only — no files written to disk.

const pdfParse = require('pdf-parse');

/**
 * Extract plain text from a PDF Buffer.
 *
 * @param {Buffer} buffer  Raw PDF data
 * @param {string} filename  Used only for logging
 * @returns {{ text: string, error: boolean, errorMessage: string|null }}
 */
async function extractPdfText(buffer, filename = 'attachment.pdf') {
  try {
    const data = await pdfParse(buffer);
    const text = (data.text || '').trim();

    if (!text) {
      // Could be a scanned image PDF — flag it but don't throw
      return {
        text: '',
        error: true,
        errorMessage: `No text extracted from "${filename}" — may be a scanned image or encrypted PDF.`,
      };
    }

    return { text, error: false, errorMessage: null };
  } catch (err) {
    console.error(`[pdf.js] Failed to parse "${filename}":`, err.message);
    return {
      text: '',
      error: true,
      errorMessage: `Failed to parse "${filename}": ${err.message}`,
    };
  }
}

module.exports = { extractPdfText };
