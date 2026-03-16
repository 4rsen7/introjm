const { expect } = require('@playwright/test');

async function setEnglishLocale(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('app_locale', 'en');
  });
}

async function login(page, { email, password }) {
  await setEnglishLocale(page);
  await page.goto('/auth');
  await expect(page).toHaveURL(/\/auth$/);

  await page.getByTestId('auth-email').fill(email);
  await page.getByTestId('auth-password').fill(password);
  await page.getByTestId('auth-submit').click();

  await expect(page).toHaveURL(/\/dashboard$/);
}

async function logout(page) {
  await page.getByTestId('signout-button').click();
  await expect(page).toHaveURL(/\/auth$/);
  await expect(page.getByTestId('auth-submit')).toBeVisible();
}

module.exports = {
  login,
  logout,
  setEnglishLocale,
};
