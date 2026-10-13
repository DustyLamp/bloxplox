import { expect, test } from '@playwright/test';

test('account deletion requires explicit confirmation and cancellation keeps the account open', async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Delete account', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const remove = dialog.getByRole('button', { name: 'Permanently delete account', exact: true });
  await expect(remove).toBeDisabled();
  await dialog.getByLabel('Type DELETE to confirm').fill('delete');
  await expect(remove).toBeDisabled();
  await dialog.getByLabel('Type DELETE to confirm').fill('DELETE');
  await expect(remove).toBeEnabled();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('local@example.test', { exact: true })).toBeVisible();
});
