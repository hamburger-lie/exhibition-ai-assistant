import { expect, test } from '@playwright/test';

async function answerReady(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '找展商' }).click();
  await expect(page.getByRole('heading', { name: '华研生物科技' })).toBeVisible({
    timeout: 15_000,
  });
}

test('positive feedback is submitted directly and acknowledged', async ({ page }) => {
  await answerReady(page);

  await page.getByRole('button', { name: /有帮助/ }).click();
  await expect(page.getByText('感谢反馈')).toBeVisible({ timeout: 5_000 });
});

test('negative feedback collects an enum reason in a bottom sheet', async ({ page }) => {
  await answerReady(page);

  await page.getByRole('button', { name: /没帮助/ }).click();

  const sheet = page.getByRole('dialog', { name: '反馈原因' });
  await expect(sheet).toBeVisible();
  // 未选原因前不可提交。
  await expect(sheet.getByRole('button', { name: '提交' })).toBeDisabled();

  await sheet.getByRole('button', { name: '信息过时' }).click();
  await sheet.getByRole('button', { name: '提交' }).click();

  await expect(sheet).toHaveCount(0);
  await expect(page.getByText('感谢反馈')).toBeVisible({ timeout: 5_000 });
});

test('the feedback sheet can be dismissed without submitting', async ({ page }) => {
  await answerReady(page);

  await page.getByRole('button', { name: /没帮助/ }).click();
  await expect(page.getByRole('dialog', { name: '反馈原因' })).toBeVisible();

  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '反馈原因' })).toHaveCount(0);
  await expect(page.getByText('感谢反馈')).toHaveCount(0);
});
