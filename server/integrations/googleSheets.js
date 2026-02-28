const { google } = require('googleapis');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];

function getAuthorizeUrl(redirectUri, state) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
    state: state || undefined
  });
}

async function exchangeCodeForTokens(code, redirectUri) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );
  const { tokens } = await oauth2Client.getToken(code);
  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: tokens.expiry_date ? new Date(tokens.expiry_date) : null
  };
}

async function fetchRange(accessToken, spreadsheetId, rangeA1) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2Client.setCredentials({ access_token: accessToken });
  const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: rangeA1
  });
  const rows = res.data.values || [];
  return rows;
}

async function refreshAccessToken(refreshToken) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  const { credentials } = await oauth2Client.refreshAccessToken();
  return {
    access_token: credentials.access_token,
    expires_at: credentials.expiry_date ? new Date(credentials.expiry_date) : null
  };
}

module.exports = {
  getAuthorizeUrl,
  exchangeCodeForTokens,
  fetchRange,
  refreshAccessToken
};
