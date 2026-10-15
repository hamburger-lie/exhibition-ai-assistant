import { expect, test, type Page } from '@playwright/test';

async function ask(page: Page, text: string) {
  await page.goto('/');
  const composer = page.getByLabel('输入你的问题');
  await expect(composer).toBeVisible({ timeout: 15_000 });
  await composer.fill(text);
  await page.getByRole('button', { name: '发送' }).click();
}

test('an upstream-unavailable answer shows recovery copy and a retry action', async ({
  page,
}) => {
  await ask(page, '服务不可用测试');

  const alert = page.getByRole('alert');
  await expect(alert).toBeVisible({ timeout: 15_000 });
  await expect(alert).toContainText('服务暂时不可用');
  // 规格 §6：错误必须包含恢复路径。
  await expect(alert.getByRole('button', { name: '重试' })).toBeVisible();
});

test('a rate-limited answer explains the wait rather than showing a raw failure', async ({
  page,
}) => {
  await ask(page, '限流场景测试');

  const alert = page.getByRole('alert');
  await expect(alert).toBeVisible({ timeout: 15_000 });
  await expect(alert).toContainText('当前咨询较多');
  await expect(alert.getByRole('button', { name: '重试' })).toBeVisible();
});

test('a mid-stream interruption keeps what was already generated', async ({ page }) => {
  await ask(page, '中断场景测试');

  const alert = page.getByRole('alert');
  await expect(alert).toBeVisible({ timeout: 15_000 });
  await expect(alert).toContainText('回答中断');
  // 规格 §6：保留已有内容并可重新获取。
  await expect(alert.getByRole('button', { name: '重试' })).toBeVisible();
  await expect(page.locator('.msg--assistant .msg__text')).not.toBeEmpty();
});

test('an unknown SSE event does not break the page', async ({ page }) => {
  await ask(page, '未知事件场景测试');

  // 规格 §10：未知事件安全忽略，已知事件照常完成回答并展示反馈。
  await expect(page.getByRole('button', { name: /有帮助/ })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(
    await page.evaluate(() => document.querySelectorAll('.msg--assistant').length),
  ).toBeGreaterThan(0);
});
