import { expect, test, type Page } from '@playwright/test';

/**
 * Composer 自动增高的 bug：textarea 是 border-box，但 scrollHeight 不包含
 * 上下边框，直接把 scrollHeight 赋给 height 会让元素比内容矮 2px，于是从
 * 空输入开始就会出现原生纵向滚动条。jsdom 不做真实布局，量不出这 2px 的
 * 误差，所以这个必须是 Playwright 真机布局测试。
 */

const VIEWPORTS = [
  { name: '390x844 (mobile)', width: 390, height: 844 },
  { name: '1280x800 (desktop)', width: 1280, height: 800 },
];

async function openComposer(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: '找展商' })).toBeVisible({
    timeout: 15_000,
  });
  return page.locator('#chat-composer-input');
}

interface TextareaMetrics {
  height: number;
  overflowY: string;
  scrollHeight: number;
  clientHeight: number;
}

async function readMetrics(
  textarea: ReturnType<Page['locator']>,
): Promise<TextareaMetrics> {
  return textarea.evaluate((node: HTMLTextAreaElement) => ({
    height: node.getBoundingClientRect().height,
    overflowY: getComputedStyle(node).overflowY,
    scrollHeight: node.scrollHeight,
    clientHeight: node.clientHeight,
  }));
}

for (const viewport of VIEWPORTS) {
  test.describe(viewport.name, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('empty input shows no scrollbar', async ({ page }) => {
      const textarea = await openComposer(page);
      const metrics = await readMetrics(textarea);

      expect(metrics.overflowY).toBe('hidden');
      // 没有滚动条意味着内容高度不超过可视高度（不存在多出来的 2px）。
      expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.clientHeight);
    });

    test('1-4 lines auto-grow with no scrollbar', async ({ page }) => {
      const textarea = await openComposer(page);

      let previousHeight = 0;
      for (let lines = 1; lines <= 4; lines += 1) {
        await textarea.fill('\n'.repeat(lines - 1));
        const metrics = await readMetrics(textarea);

        expect(metrics.overflowY).toBe('hidden');
        expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.clientHeight);
        expect(metrics.height).toBeGreaterThanOrEqual(previousHeight);
        expect(metrics.height).toBeLessThanOrEqual(116);
        previousHeight = metrics.height;
      }
    });

    test('from the 5th line the height caps at 116px and becomes internally scrollable', async ({
      page,
    }) => {
      const textarea = await openComposer(page);
      // 6 行，明确超过 4 行上限。
      await textarea.fill('\n'.repeat(5));

      const metrics = await readMetrics(textarea);
      expect(metrics.height).toBe(116);
      expect(metrics.overflowY).toBe('auto');
      expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);

      // 确认真的可以内部滚动，而不只是样式声明了 auto。
      const scrolled = await textarea.evaluate((node: HTMLTextAreaElement) => {
        node.scrollTop = 0;
        node.scrollTop = node.scrollHeight;
        return node.scrollTop > 0;
      });
      expect(scrolled).toBe(true);
    });
  });
}
