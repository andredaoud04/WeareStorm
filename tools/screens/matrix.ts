/**
 * Screenshot matrix (docs/UX.md §10). Usage: npx tsx tools/screens/matrix.ts [baseUrl] [outDir] [scene...]
 * Captures each scene at the five reference sizes and fails on console errors, document scroll or overflowing text.
 */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  try { return require('playwright'); } catch { return require('/opt/node-tools/node_modules/playwright'); }
}

const SIZES: [number, number, string][] = [
  [375, 667, 'se'], [390, 844, 'phone'], [430, 932, 'max'], [820, 1180, 'ipad'], [1024, 1366, 'ipadpro'],
];

async function main() {
  const [base = 'http://127.0.0.1:5173', out = 'screens-out', ...scenes] = process.argv.slice(2);
  const list = scenes.length ? scenes : ['title'];
  mkdirSync(out, { recursive: true });
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const problems: string[] = [];
  for (const [w, h, tag] of SIZES) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true, isMobile: w < 800 });
    const page = await ctx.newPage();
    page.on('pageerror', (e: Error) => problems.push(`${tag}: pageerror ${e.message}`));
    page.on('console', (m: { type(): string; text(): string }) => { if (m.type() === 'error') problems.push(`${tag}: console ${m.text()}`); });
    for (const scene of list) {
      await page.goto(`${base}/?scene=${scene}`);
      await page.waitForTimeout(900);
      const layout = await page.evaluate(() => ({
        scroll: document.documentElement.scrollHeight > innerHeight + 1 || document.documentElement.scrollWidth > innerWidth + 1,
        overflow: [...document.querySelectorAll('body *')].filter((el) => {
          const e = el as HTMLElement;
          return e.children.length === 0 && e.textContent?.trim() && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== 'visible';
        }).length,
      }));
      if (layout.scroll) problems.push(`${tag}/${scene}: document scrolls`);
      if (layout.overflow) problems.push(`${tag}/${scene}: ${layout.overflow} clipped text elements`);
      await page.screenshot({ path: `${out}/${scene}-${tag}.png` });
    }
    await ctx.close();
  }
  await browser.close();
  if (problems.length) { console.error(problems.join('\n')); process.exitCode = 1; }
  else console.log(`ok: ${list.length} scene(s) × ${SIZES.length} sizes → ${out}`);
}
main();
