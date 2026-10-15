import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

/**
 * 生成移动端 UI 截图，作为 UI 规格的可视化验收证据。
 * 输出目录：docs/acceptance/ui-screenshots/
 *
 * Playwright 以 CJS 加载 spec，因此用 process.cwd()（= 仓库根）而非
 * import.meta.url 定位输出目录。
 */
const OUT_DIR = path.resolve(process.cwd(), 'docs/acceptance/ui-screenshots');

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

async function shoot(page: Page, name: string) {
  // 关闭动效后再截图：否则可能抓到入场动画中途的半透明状态，截图不稳定。
  await page.screenshot({
    path: path.join(OUT_DIR, `${name}.png`),
    fullPage: false,
    animations: 'disabled',
  });
}

test('01 empty-conversation first screen', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: '找展商' })).toBeVisible({
    timeout: 15_000,
  });
  await shoot(page, '01-first-screen');
});

test('02 conversation with an exhibitor card', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '找展商' }).click();
  await expect(page.getByRole('heading', { name: '华研生物科技' })).toBeVisible({
    timeout: 15_000,
  });
  await shoot(page, '02-conversation-with-card');
});

test('03 citations expanded', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '找展商' }).click();
  const citations = page.locator('details.citations');
  await expect(citations).toBeVisible({ timeout: 15_000 });
  await citations.locator('summary').click();
  await expect(citations).toHaveJSProperty('open', true);
  await shoot(page, '03-citations-expanded');
});

test('04 negative feedback bottom sheet', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '找展商' }).click();
  await expect(page.getByRole('heading', { name: '华研生物科技' })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole('button', { name: /没帮助/ }).click();
  await expect(page.getByRole('dialog', { name: '反馈原因' })).toBeVisible();
  await shoot(page, '04-feedback-sheet');
});

test('05 booth map with highlight', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '找展商' }).click();
  await page.getByRole('button', { name: '展位定位' }).click();
  await expect(page.getByTestId('map-highlight')).toBeVisible({ timeout: 15_000 });
  await shoot(page, '05-map-highlight');
});

test('06 error state with recovery action', async ({ page }) => {
  await page.goto('/');
  const composer = page.getByLabel('输入你的问题');
  await expect(composer).toBeVisible({ timeout: 15_000 });
  await composer.fill('服务不可用测试');
  await page.getByRole('button', { name: '发送' }).click();
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 15_000 });
  await shoot(page, '06-error-recovery');
});

test('07 streaming with stop control', async ({ page }) => {
  await page.goto('/');
  const composer = page.getByLabel('输入你的问题');
  await expect(composer).toBeVisible({ timeout: 15_000 });
  await composer.fill('查询超时场景测试');
  await page.getByRole('button', { name: '发送' }).click();
  await expect(page.getByRole('button', { name: '停止生成' })).toBeVisible({
    timeout: 5_000,
  });
  await shoot(page, '07-streaming-stop');
  await page.getByRole('button', { name: '停止生成' }).click();
});

test('08 map degraded state without map_shape_id', async ({ page }) => {
  const booths = encodeURIComponent(
    JSON.stringify([{ booth_id: 'booth_demo_D01', display_code: 'D01' }]),
  );
  // An unknown hall: no map to derive a shape id from (a known hall's booth is derived and highlighted).
  await page.goto(`/map?hall_id=hall_unknown&booths=${booths}`);
  await expect(page.getByRole('status')).toContainText('暂无该展位的地图坐标', {
    timeout: 15_000,
  });
  await shoot(page, '08-map-degraded');
});
