const { google } = require('googleapis');

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

/**
 * Return an authenticated Gmail client that impersonates the given inbox email
 * using a Google service account with Domain-Wide Delegation (DWD).
 *
 * Authentication source (in priority order):
 *  1. GOOGLE_CREDENTIALS_JSON env var — full service account key JSON as a string.
 *     This is the production pattern used by all Fable Food Cloud Run services.
 *     The service account must have DWD enabled in Google Workspace Admin with
 *     scope: https://www.googleapis.com/auth/gmail.readonly
 *  2. Application Default Credentials (GOOGLE_APPLICATION_CREDENTIALS file path,
 *     or `gcloud auth application-default login`) — for local dev without a key file.
 *     Note: ADC via the Cloud Run metadata server does NOT support DWD impersonation,
 *     so GOOGLE_CREDENTIALS_JSON is required in production.
 *
 * No OAuth flow. No refresh tokens. No browser redirects.
 * Credentials are managed entirely by GCP.
 *
 * @param {string} inboxEmail  The Gmail address to impersonate, e.g. "orders@fablefood.co"
 * @returns {JWT|OAuth2Client}  An authenticated googleapis auth client
 */
async function getGmailClient(inboxEmail) {
  if (process.env.GOOGLE_CREDENTIALS_JSON) {
    const key = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
    return new google.auth.JWT({
      email:   key.client_email,
      key:     key.private_key,
      scopes:  SCOPES,
      subject: inboxEmail,  // DWD: impersonate the target mailbox
    });
  }

  // Local dev fallback: Application Default Credentials
  // Requires: gcloud auth application-default login
  // DWD impersonation is not available via ADC metadata server — set
  // GOOGLE_CREDENTIALS_JSON with a service account key for full parity with production.
  const auth = new google.auth.GoogleAuth({ scopes: SCOPES });
  return auth.getClient();
}

/**
 * Returns true if Gmail credentials are configured (GOOGLE_CREDENTIALS_JSON set,
 * or ADC is available via GOOGLE_APPLICATION_CREDENTIALS).
 */
function credentialsConfigured() {
  return !!(
    process.env.GOOGLE_CREDENTIALS_JSON ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS
  );
}

module.exports = { getGmailClient, credentialsConfigured };
