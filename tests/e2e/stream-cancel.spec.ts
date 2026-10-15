import { expect, test } from '@playwright/test';

test('stopping generation keeps what was produced and restores the input immediately', async ({
  page,
}) => {
  await page.goto('/');

  const composer = page.getByLabel('输入你的问题');
  await expect(composer).toBeVisible({ timeout: 15_000 });

  // 「超时」命中 Mock B 中首事件前长延迟的场景，留出足够时间点停止。
  await composer.fill('查询超时场景测试');
  await page.getByRole('button', { name: '发送' }).click();

  const stopButton = page.getByRole('button', { name: '停止生成' });
  await expect(stopButton).toBeVisible({ timeout: 5_000 });
  await stopButton.click();

  await expect(page.getByText('已停止生成')).toBeVisible({ timeout: 5_000 });
  // 规格 §5.4：输入区立即恢复。
  await expect(page.getByRole('button', { name: '发送' })).toBeVisible();
  await expect(page.getByRole('button', { name: '停止生成' })).toHaveCount(0);
  await expect(composer).toBeEnabled();
});

test('the composer stays editable while an answer is generating', async ({ page }) => {
  await page.goto('/');

  const composer = page.getByLabel('输入你的问题');
  await expect(composer).toBeVisible({ timeout: 15_000 });
  await composer.fill('查询超时场景测试');
  await page.getByRole('button', { name: '发送' }).click();

  await expect(page.getByRole('button', { name: '停止生成' })).toBeVisible({
    timeout: 5_000,
  });

  // 规格 §5.1：生成期间允许编辑下一条内容，但不允许重复发送。
  await composer.fill('下一条问题');
  await expect(composer).toHaveValue('下一条问题');
  await expect(page.getByRole('button', { name: '发送' })).toHaveCount(0);

  await page.getByRole('button', { name: '停止生成' }).click();
});
