import { expect, test } from '@playwright/test';

test('the empty-conversation first screen carries a quick action into a completed answer', async ({
  page,
}) => {
  await page.goto('/');

  // 规格 §3：首屏就是空对话状态，同时具备欢迎区、快捷入口和输入区。
  await expect(
    page.getByRole('heading', { name: /你好，我是 AI 问答助手/ }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel('输入你的问题')).toBeVisible();

  for (const label of ['找展商', '找产品', '找展位', '查活动']) {
    await expect(page.getByRole('button', { name: label })).toBeVisible();
  }

  await page.getByRole('button', { name: '找展商' }).click();

  // 不跳转到独立的 /chat 路由，欢迎区就地收起。
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: '华研生物科技' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole('button', { name: '找展商' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /新对话/ })).toBeVisible();
  await expect(page.getByLabel('输入你的问题')).toBeEnabled();
});

test('citations stay collapsed until the user opens them', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '找展商' }).click();

  const citations = page.locator('details.citations');
  await expect(citations).toBeVisible({ timeout: 15_000 });
  await expect(citations).toHaveJSProperty('open', false);
  await expect(page.getByText(/参考依据 \d+/)).toBeVisible();

  await citations.locator('summary').click();
  await expect(citations).toHaveJSProperty('open', true);
  await expect(page.getByText('source_exhibitors_2026')).toBeVisible();
});
