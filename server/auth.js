const { google } = require('googleapis');
const db = require('./db');

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

function createOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

/**
 * Build the Google OAuth consent URL for a given inbox.
 * state encodes the inbox ID so the callback knows which inbox to update.
 */
function getAuthUrl(inboxId = 'orders-au') {
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state: inboxId,
  });
}

/**
 * Exchange an authorisation code for tokens, persist the refresh token to
 * the inboxes table, and return an authenticated OAuth2 client.
 */
async function handleCallback(code, inboxId = 'orders-au') {
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  if (tokens.refresh_token) {
    db.updateInboxToken(inboxId, tokens.refresh_token);
  }

  return { client, tokens };
}

/**
 * Return an authenticated OAuth2 client for the given inbox using its stored
 * refresh token (or the GMAIL_REFRESH_TOKEN env var as a fallback for the
 * Phase 1 primary inbox).
 *
 * Throws if no refresh token is available.
 */
function getAuthenticatedClient(inbox) {
  const refreshToken = inbox.refresh_token || process.env.GMAIL_REFRESH_TOKEN;
  if (!refreshToken) {
    throw new Error(
      `No refresh token found for inbox ${inbox.id}. ` +
      `Visit /orders/auth/setup?inbox=${inbox.id} to authenticate.`
    );
  }

  const client = createOAuthClient();
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

module.exports = { getAuthUrl, handleCallback, getAuthenticatedClient };
