import { expect, test } from '@playwright/test';
import demoData from '../src/demo-data.json' with { type: 'json' };
import { STORAGE_KEY } from '../src/session';
import { PREFERENCES_KEY } from '../src/preferences';

for (const density of ['comfortable', 'compact'] as const) {
  test(`${density} 圖譜光暈跨列連續，原線維持原本粗細`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1360, height: 1200 });
    await page.addInitScript(
      ({ sessionKey, preferencesKey, selection, density }) => {
        const path = 'demo://keifu';
        localStorage.setItem(
          sessionKey,
          JSON.stringify({
            version: 1,
            projects: [{ path, name: 'keifu', pinned: false }],
            tabs: [{ path, selection, remotes: true, limit: 500 }],
            active: path,
          }),
        );
        localStorage.setItem(preferencesKey, JSON.stringify({ version: 1, density }));
      },
      {
        sessionKey: `${STORAGE_KEY}-demo`,
        preferencesKey: `${PREFERENCES_KEY}-demo`,
        selection: demoData.snapshot.rows[8].commit!.oid,
        density,
      },
    );
    await page.goto('/?demo');
    const graph = page.locator(`#commit-${demoData.snapshot.rows[5].commit!.oid} .graph-svg`);
    await expect(graph).toBeVisible();
    await expect(graph.locator('.graph-line-highlight')).toHaveCount(1);
    await expect(graph.locator('.graph-line-highlight')).toHaveCSS('stroke-width', '1.8px');
    await expect(graph.locator('.graph-line-highlight')).toHaveCSS('filter', 'none');
    const box = (await graph.boundingBox())!;
    const height = Math.round(box.height);
    const screenshot = await page.screenshot({
      clip: { x: box.x, y: box.y, width: box.width, height: height * 2 },
      path: testInfo.outputPath('continuous-glow.png'),
    });
    // Sample directly around the seam: compact rows bring the glowing commit
    // nodes close enough to affect pixels farther away from the boundary.
    const { samples, background } = await page.evaluate(
      async ({ png, height }) => {
        const image = new Image();
        image.src = `data:image/png;base64,${png}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d')!;
        context.drawImage(image, 0, 0);
        const pixel = (x: number, y: number) =>
          Array.from(context.getImageData(x, y, 1, 1).data).slice(0, 3);
        return {
          samples: [-1, 0, 1].map((dy) => pixel(43, height + dy)),
          background: pixel(60, height),
        };
      },
      { png: screenshot.toString('base64'), height },
    );
    expect(samples[1][0] - background[0]).toBeGreaterThan(12);
    for (let channel = 0; channel < 3; channel++) {
      const values = samples.map((pixel) => pixel[channel]);
      expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(3);
    }
  });
}
