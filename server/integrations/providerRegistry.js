const googleSheets = require('./googleSheets');
const microsoftExcel = require('./microsoftExcel');
const { normalizeRangeA1 } = require('./normalizeRangeA1');

const INTEGRATION_PROVIDER_ADAPTERS = {
  google_sheets: {
    authorize: googleSheets.getAuthorizeUrl,
    exchangeCodeForTokens: googleSheets.exchangeCodeForTokens,
    refreshAccessToken: googleSheets.refreshAccessToken,
    async fetchMetricRows({ accessToken, integrationConfig }) {
      const spreadsheetId = integrationConfig?.spreadsheetId;
      const range = normalizeRangeA1(integrationConfig?.range || 'Sheet1!A1:Z1000');
      if (!spreadsheetId) throw new Error('Missing spreadsheetId');
      return googleSheets.fetchRange(accessToken, spreadsheetId, range);
    },
  },
  microsoft_excel: {
    authorize: microsoftExcel.getAuthorizeUrl,
    exchangeCodeForTokens: microsoftExcel.exchangeCodeForTokens,
    refreshAccessToken: microsoftExcel.refreshAccessToken,
    async fetchMetricRows({ accessToken, integrationConfig }) {
      const fileId = integrationConfig?.fileId;
      const range = normalizeRangeA1(integrationConfig?.range || 'A1:Z1000');
      const sheetName = integrationConfig?.sheetName || 'Sheet1';
      if (!fileId) throw new Error('Missing fileId');
      return microsoftExcel.fetchRange(accessToken, fileId, range, sheetName);
    },
  },
};

function getIntegrationProvider(provider) {
  return INTEGRATION_PROVIDER_ADAPTERS[provider] || null;
}

function getIntegrationProviders() {
  return Object.keys(INTEGRATION_PROVIDER_ADAPTERS);
}

module.exports = {
  INTEGRATION_PROVIDER_ADAPTERS,
  getIntegrationProvider,
  getIntegrationProviders,
};
