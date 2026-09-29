import { test, expect } from '@playwright/test';

const userId = '00000000-0000-4000-8000-000000000901';
const firstId = '00000000-0000-4000-8000-000000000902';
const secondId = '00000000-0000-4000-8000-000000000903';

async function fixture(page, { signedIn = true, workspaces = [{ id: firstId, name: 'Product team', role: 'owner' }] } = {}) {
  await page.addInitScript(({ signedIn: authenticated, user }) => {
    localStorage.setItem('research.locale', 'en');
    if (authenticated) localStorage.setItem('sb-127-auth-token', JSON.stringify({
      access_token: 'local-test-token', refresh_token: 'local-test-refresh', token_type: 'bearer',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: user, email: 'research@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} },
    }));
  }, { signedIn, user: userId });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname !== '127.0.0.1') return route.abort();
    if (url.port === '5399') return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    if (!url.pathname.startsWith('/api/research')) return route.continue();
    const path = url.pathname.slice('/api/research'.length);
    const data = path === '/workspaces' ? workspaces : path === '/studies' ? [] : null;
    if (data !== null) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'success', data }) });
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });
}

test('one workspace stays a plain name and language works on signed-in and auth headers', async ({ page }) => {
  await fixture(page);
  await page.goto('/');
  const workspace = page.getByTestId('research-workspace');
  await expect(workspace).toHaveText('Product team');
  await expect(workspace).not.toHaveAttribute('role', 'combobox');
  await expect(workspace.locator('svg')).toHaveCount(0);
  await expect(page.getByRole('listbox', { name: 'Workspace' })).toHaveCount(0);
  await page.getByTestId('research-language').click();
  await expect(page.getByRole('option', { name: 'English' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('option', { name: 'Українська' }).click();
  await expect(page.getByTestId('research-language')).toHaveText('UA');
  await expect(workspace).toHaveAttribute('aria-label', 'Робочий простір');

  await page.addInitScript(() => localStorage.removeItem('sb-127-auth-token'));
  await page.reload();
  await expect(page.getByTestId('research-auth-form')).toBeVisible();
  await page.getByTestId('research-language').click();
  await page.getByRole('option', { name: 'English' }).click();
  await expect(page.getByTestId('research-language')).toHaveText('EN');
});

test('workspace menu shows role metadata, supports keyboard and outside close, then switches', async ({ page }) => {
  await fixture(page, { workspaces: [{ id: firstId, name: 'Product team', role: 'owner' }, { id: secondId, name: 'Another team', role: 'member' }] });
  await page.goto('/');
  const trigger = page.getByTestId('research-workspace');
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('research-workspace-option').first()).toContainText('Owner');
  await expect(page.getByTestId('research-workspace-option').last()).toContainText('Member');
  await expect(page.getByTestId('research-workspace-option').first()).toHaveAttribute('aria-selected', 'true');
  await trigger.press('End');
  await expect(page.getByTestId('research-workspace-option').last()).toHaveClass(/is-active/);
  await trigger.press('Escape');
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.click();
  await page.getByRole('link', { name: 'Research home' }).click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.press('ArrowDown');
  await trigger.press('ArrowDown');
  await trigger.press('Enter');
  await expect(trigger).toHaveAttribute('title', 'Another team');
  await trigger.press(' ');
  await trigger.press('Home');
  await trigger.press('Tab');
  await expect(trigger).toHaveAttribute('title', 'Another team');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
});

test('long workspace options wrap and the open menu stays on a 320px screen', async ({ page }) => {
  const longName = 'Research and customer experience team with a very long workspace name that needs several lines';
  const workspaces = Array.from({ length: 10 }, (_, index) => ({ id: `00000000-0000-4000-8000-${String(910 + index).padStart(12, '0')}`, name: index === 0 ? longName : `Workspace ${index}`, role: index ? 'member' : 'owner' }));
  await fixture(page, { workspaces });
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/');
  await page.getByTestId('research-workspace').click();
  const menu = page.getByRole('listbox', { name: 'Workspace' });
  await expect(menu).toBeVisible();
  await expect(page.getByTestId('research-workspace-option').first()).toContainText(longName);
  const dimensions = await menu.evaluate(element => {
    const box = element.getBoundingClientRect();
    const first = element.querySelector('[role="option"]').getBoundingClientRect();
    return { left: box.left, right: box.right, height: box.height, scrollHeight: element.scrollHeight, firstHeight: first.height, viewport: innerWidth, documentWidth: document.documentElement.scrollWidth };
  });
  expect(dimensions.left).toBeGreaterThanOrEqual(0);
  expect(dimensions.right).toBeLessThanOrEqual(dimensions.viewport);
  expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewport);
  expect(dimensions.height).toBeLessThanOrEqual(192);
  expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.height);
  expect(dimensions.firstHeight).toBeGreaterThan(44);
  await page.getByTestId('research-workspace').press('End');
  await expect(page.getByTestId('research-workspace-option').last()).toHaveClass(/is-active/);
});

test('open header menus stay inside narrow and short viewports', async ({ page }) => {
  await fixture(page, { workspaces: Array.from({ length: 10 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(920 + index).padStart(12, '0')}`,
    name: `Workspace ${index}`, role: index ? 'member' : 'owner',
  })) });
  await page.goto('/');
  for (const viewport of [{ width: 320, height: 844 }, { width: 320, height: 240 }]) {
    await page.setViewportSize(viewport);
    for (const testId of ['research-workspace', 'research-language']) {
      const trigger = page.getByTestId(testId);
      await trigger.click();
      const menu = page.getByRole('listbox');
      await expect(menu).toBeVisible();
      const rect = await menu.boundingBox();
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(viewport.width);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.y + rect.height).toBeLessThanOrEqual(viewport.height);
      await trigger.press('End');
      const last = page.getByTestId(`${testId}-option`).last();
      await expect(last).toBeInViewport();
      await trigger.press('Escape');
      await expect(trigger).toBeFocused();
    }
  }
});
