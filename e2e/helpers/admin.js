const { expect } = require('@playwright/test');

function getAdminUrl() {
  return process.env.PLAYWRIGHT_ADMIN_URL || 'http://127.0.0.1:3000';
}

async function loginAdmin(page, { email, password }) {
  await page.goto(`${getAdminUrl()}/admin/login`);
  await page.getByRole('textbox', { name: /email/i }).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await expect(page).not.toHaveURL(/\/admin\/login$/);
}

module.exports = {
  getAdminUrl,
  loginAdmin,
};
