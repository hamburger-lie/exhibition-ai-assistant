import { expect, test } from '@playwright/test';

test('展位定位 opens the map, highlights the shape and can return to the conversation', async ({
  page,
}) => {
  await page.goto('/');

  const exhibitorQuickAction = page.getByRole('button', { name: '找展商' });
  await expect(exhibitorQuickAction).toBeVisible({ timeout: 15_000 });
  await exhibitorQuickAction.click();

  const highlightAction = page.getByRole('button', { name: '展位定位' });
  await expect(highlightAction).toBeVisible({ timeout: 15_000 });
  await highlightAction.click();

  await expect(page).toHaveURL(/\/map\?/);
  // 展示的是接口给的展位号 C18，不是内部 booth_id。
  await expect(page.getByRole('heading', { name: '5.2馆 · C18' })).toBeVisible();
  await expect(page.getByTestId('map-highlight')).toContainText(
    '已在图上高亮展位 C18',
  );
  await expect(page.locator('.map-info__code')).toHaveText('C18');

  // 只有接口指定的 shape 被标记。
  await expect(page.locator('#shape_demo_C18')).toHaveAttribute(
    'data-highlighted',
    'true',
  );
  await expect(page.locator('#shape_demo_C20')).not.toHaveAttribute(
    'data-highlighted',
    'true',
  );

  // 规格 §7.1：返回后消息仍在（Chat 流保存在 SPA 全局状态里）。
  await page.getByRole('button', { name: '返回对话' }).click();
  await expect(page.getByRole('heading', { name: '华研生物科技' })).toBeVisible();
});
