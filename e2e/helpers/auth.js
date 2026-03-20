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

async function getAccessToken(page) {
  return page.evaluate(() => {
    const storageKeys = Object.keys(window.localStorage).filter(
      (key) => key.startsWith('sb-') && key.endsWith('-auth-token')
    );

    for (const key of storageKeys) {
      const rawValue = window.localStorage.getItem(key);
      if (!rawValue) continue;

      try {
        const parsedValue = JSON.parse(rawValue);
        const accessToken = parsedValue?.access_token ?? parsedValue?.currentSession?.access_token ?? null;
        if (accessToken) {
          return accessToken;
        }
      } catch {
        // Ignore malformed localStorage entries and keep looking.
      }
    }

    return null;
  });
}

module.exports = {
  getAccessToken,
  login,
  logout,
  setEnglishLocale,
};
