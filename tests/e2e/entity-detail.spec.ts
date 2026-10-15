import { expect, test, type Page } from '@playwright/test';

async function answerReady(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '找展商' }).click();
  await expect(page.getByRole('heading', { name: '华研生物科技' })).toBeVisible({
    timeout: 15_000,
  });
}

test('查看详情 opens the E07 detail page for the card entity', async ({ page }) => {
  await answerReady(page);

  await page.getByRole('button', { name: '查看展商' }).click();

  await expect(page).toHaveURL(/\/entity\/exhibitor\/exhibitor_huayan/);
  await expect(
    page.getByRole('heading', { name: '华研生物科技' }),
  ).toBeVisible();
  await expect(page.getByText('胶原蛋白原料与护肤产品展商。')).toBeVisible();
  // 展位来自 E07 的结构化字段，与卡片同一套 ID。
  await expect(page.getByRole('button', { name: /C18/ })).toBeVisible();
});

test('returning from the detail page keeps messages, draft and scroll position', async ({
  page,
}) => {
  await answerReady(page);

  // 先留下一段未发送的草稿。
  const composer = page.getByLabel('输入你的问题');
  await composer.fill('这是一段还没发送的草稿');

  await page.getByRole('button', { name: '查看展商' }).click();
  await expect(page).toHaveURL(/\/entity\//);

  await page.getByRole('button', { name: '返回对话' }).click();

  await expect(page).toHaveURL(/\/$/);
  // 规格 §7.1：返回 Chat 后恢复消息与输入草稿。
  await expect(page.getByRole('heading', { name: '华研生物科技' })).toBeVisible();
  await expect(composer).toHaveValue('这是一段还没发送的草稿');
  // 欢迎区没有被重建，说明会话状态没有被重置。
  await expect(page.getByRole('button', { name: '找展商' })).toHaveCount(0);
});

test('detail page can reach the booth map and come back', async ({ page }) => {
  await answerReady(page);
  await page.getByRole('button', { name: '查看展商' }).click();

  await page.getByRole('button', { name: /C18/ }).click();
  await expect(page).toHaveURL(/\/map\?/);
  await expect(page.getByTestId('map-highlight')).toContainText('C18');

  await page.getByRole('button', { name: '返回对话' }).click();
  await expect(page).toHaveURL(/\/entity\//);
});

test('an unknown entity id surfaces a not-found message, not a fabricated entity', async ({
  page,
}) => {
  await page.goto('/');
  // 先让会话建立，详情页需要 session token。
  await expect(page.getByRole('button', { name: '找展商' })).toBeVisible({
    timeout: 15_000,
  });

  await page.goto(
    '/entity/exhibitor/exhibitor_does_not_exist?expo_id=expo_demo_2026_spring',
  );

  const alert = page.getByRole('alert');
  await expect(alert).toBeVisible({ timeout: 15_000 });
  await expect(alert).toContainText('未找到该内容');
  await expect(page.getByText('华研生物科技')).toHaveCount(0);
});
