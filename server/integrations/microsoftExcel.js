const https = require('https');

const MS_GRAPH = 'https://graph.microsoft.com/v1.0';

function getAuthorizeUrl(redirectUri, state) {
  const params = new URLSearchParams({
    client_id: process.env.MS_CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: 'Files.Read offline_access',
    response_mode: 'query'
  });
  if (state) params.set('state', state);
  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
}

async function exchangeCodeForTokens(code, redirectUri) {
  const body = new URLSearchParams({
    client_id: process.env.MS_CLIENT_ID,
    client_secret: process.env.MS_CLIENT_SECRET,
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code'
  }).toString();

  const tokens = await msTokenRequest(body);
  const expiresAt = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null;
  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || null,
    expires_at: expiresAt
  };
}

async function refreshAccessToken(refreshToken) {
  const body = new URLSearchParams({
    client_id: process.env.MS_CLIENT_ID,
    client_secret: process.env.MS_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token'
  }).toString();

  const tokens = await msTokenRequest(body);
  const expiresAt = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null;
  return {
    access_token: tokens.access_token,
    expires_at: expiresAt
  };
}

function msTokenRequest(body) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'login.microsoftonline.com',
        path: '/common/oauth2/v2.0/token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body)
        }
      },
      (res) => {
        let data = '';
        res.on('data', (ch) => (data += ch));
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.error) reject(new Error(json.error_description || json.error));
            else resolve(json);
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function fetchRange(accessToken, fileId, rangeAddress, sheetName) {
  const sheet = sheetName || 'Sheet1';
  const range = rangeAddress || 'A1:Z1000';
  const path = `/me/drive/items/${encodeURIComponent(fileId)}/workbook/worksheets('${encodeURIComponent(sheet)}')/range(address='${encodeURIComponent(range)}')`;
  const res = await graphRequest(accessToken, path);
  const values = res.values;
  if (!Array.isArray(values)) return [];
  return values;
}

function graphRequest(accessToken, path, method = 'GET') {
  const u = new URL(path.startsWith('http') ? path : MS_GRAPH + (path.startsWith('/') ? path : '/' + path));
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      },
      (res) => {
        let data = '';
        res.on('data', (ch) => (data += ch));
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.error) reject(new Error(json.error.message || JSON.stringify(json.error)));
            else resolve(json);
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

module.exports = {
  getAuthorizeUrl,
  exchangeCodeForTokens,
  fetchRange,
  refreshAccessToken
};
