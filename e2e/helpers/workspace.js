const { expect } = require('@playwright/test');

async function openWorkspaceSwitcher(page) {
  await page.getByTestId('workspace-switcher-toggle').click();
  await expect(page.getByTestId('workspace-option').first()).toBeVisible();
}

async function switchWorkspace(page, workspaceName) {
  await openWorkspaceSwitcher(page);
  await page
    .locator('[data-testid="workspace-option"]')
    .filter({ has: page.getByText(workspaceName, { exact: true }) })
    .click();

  await expect(page.getByTestId('current-workspace-label')).toHaveText(workspaceName);
}

module.exports = {
  switchWorkspace,
};
