import { expect, test, type Page } from '@playwright/test';

/** 规格 §9：移动优先，最低基准 375px；另覆盖常见 390/430 与横屏。 */
const VIEWPORTS = [
  { name: '375x812', width: 375, height: 812 },
  { name: '390x844', width: 390, height: 844 },
  { name: '430x932', width: 430, height: 932 },
  { name: 'landscape-844x390', width: 844, height: 390 },
];

test.use({ isMobile: true, hasTouch: true });

async function assertNoHorizontalScroll(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}

for (const viewport of VIEWPORTS) {
  test(`no horizontal scroll on the first screen at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/');
    await expect(page.getByRole('button', { name: '找展商' })).toBeVisible({
      timeout: 15_000,
    });

    await assertNoHorizontalScroll(page);
  });

  test(`no horizontal scroll in the conversation at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/');
    await page.getByRole('button', { name: '找展商' }).click();
    await expect(page.getByRole('heading', { name: '华研生物科技' })).toBeVisible({
      timeout: 15_000,
    });

    await assertNoHorizontalScroll(page);
  });
}

test('every interactive control meets the 44x44 touch-target minimum', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await page.getByRole('button', { name: '找展商' }).click();
  await expect(page.getByRole('heading', { name: '华研生物科技' })).toBeVisible({
    timeout: 15_000,
  });

  const undersized = await page.evaluate(() => {
    // Chromium 在动画期间（例如只做 translateY、没有 scale 的入场位移）偶尔会
    // 把真实 44px 的元素报成 43.999969px 这类浮点噪声，不代表真的变小了。
    // 0.01px 的容差只吸收这种噪声，43.37px（scale 造成的真实收缩）仍然会被
    // 判定为不合格。
    const EPSILON = 0.01;
    const offenders: string[] = [];
    for (const el of document.querySelectorAll('button, a[href], textarea, summary')) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue; // 不可见控件跳过
      if (rect.width + EPSILON < 44 || rect.height + EPSILON < 44) {
        offenders.push(
          `${el.className || el.tagName}: ${Math.round(rect.width)}x${Math.round(rect.height)}`,
        );
      }
    }
    return offenders;
  });

  expect(undersized).toEqual([]);
});

test('the fixed composer does not cover the last message', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await page.getByRole('button', { name: '找展商' }).click();
  await expect(page.getByRole('heading', { name: '华研生物科技' })).toBeVisible({
    timeout: 15_000,
  });

  const overlaps = await page.evaluate(() => {
    const composer = document.querySelector('.composer')?.getBoundingClientRect();
    const scroller = document.querySelector('.chat-scroll')?.getBoundingClientRect();
    if (!composer || !scroller) return true;
    // 输入区是独立的 flex 行，不应压在滚动区之上。
    return scroller.bottom > composer.top + 1;
  });

  expect(overlaps).toBe(false);
});
