/**
 * Screenshot matrix (docs/UX.md §10). Usage: npx tsx tools/screens/matrix.ts [baseUrl] [outDir] [scene...]
 * Captures each scene at every reference size (plus Safari-with-toolbars sizes and a notch inset case) and fails on
 * console errors, document scroll, clipped text, tappables under 48 pt, or controls outside the safe viewport.
 */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  try {
    return require('playwright');
  } catch {
    return require('/opt/node-tools/node_modules/playwright');
  }
}

/** [width, height, tag, insets "top,bottom" or ''] */
const SIZES: [number, number, string, string][] = [
  [375, 667, 'se', ''],
  [375, 548, 'se-safari', ''],
  [390, 844, 'phone', '47,34'],
  [390, 664, 'phone-safari', ''],
  [430, 932, 'max', '59,34'],
  [820, 1180, 'ipad', '24,20'],
  [1024, 1366, 'ipadpro', '24,20'],
];

export const SCENES = [
  'title', 'hub', 'hub-boss', 'hub-evolve', 'army', 'army-new', 'army-focus', 'ages', 'ages-evolve', 'settings',
  'battle-start', 'battle', 'battle-warlord', 'battle-rm', 'pause', 'victory', 'defeat',
  // FTUE coach steps (GDD §1.5)
  'coach-food', 'coach-deploy', 'coach-results', 'coach-recruit', 'coach-recruit-army', 'coach-back', 'coach-ranged',
  'coach-food-up', 'coach-speed', 'coach-tank', 'coach-storm', 'coach-warlord',
];

const SLOW = new Set(['victory', 'defeat', 'coach-results']);

async function main() {
  const [base = 'http://127.0.0.1:5173', out = 'screens-out', ...scenes] = process.argv.slice(2);
  const list = scenes.length ? scenes : SCENES;
  mkdirSync(out, { recursive: true });
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const problems: string[] = [];
  // MATRIX_SIZES=ipad,ipadpro limits a run to some sizes (e.g. to re-check one device class).
  const only = process.env.MATRIX_SIZES?.split(',').filter(Boolean);
  for (const [w, h, tag, insets] of SIZES.filter(([, , t]) => !only?.length || only.includes(t))) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true, isMobile: w < 800 });
    await ctx.addInitScript('window.__name = (f) => f'); // tsx keeps function names via a helper the page lacks
    for (const scene of list) {
      const page = await ctx.newPage();
      page.on('pageerror', (e: Error) => problems.push(`${tag}/${scene}: pageerror ${e.message}`));
      page.on('console', (m: { type(): string; text(): string }) => {
        if (m.type() === 'error') problems.push(`${tag}/${scene}: console ${m.text()}`);
      });
      await page.goto(`${base}/?scene=${scene}${insets ? `&insets=${insets}` : ''}`);
      await page.waitForTimeout(SLOW.has(scene) ? 4500 : 1200);
      // Measure only once one-shot entrances (sheet slide-ups, pops) have finished. Looping idles never finish, and a
      // live battle keeps firing toasts and card pops, so those are not waited for.
      await page
        .waitForFunction(
          () =>
            document.getAnimations().every((a) => {
              if (a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity) return true;
              const t = (a.effect as KeyframeEffect | null)?.target;
              // live effects (coin flights, banners) keep coming while a battle runs
              return !!t && !!t.closest('.toasts, .deck, .food, .boss-bar, .fx-layer, .banner');
            }),
          null,
          { timeout: 12000 },
        )
        .catch(() => problems.push(`${tag}/${scene}: entrance animations still running after 12 s`));
      const layout = await page.evaluate(() => {
        const css = getComputedStyle(document.documentElement);
        const top = parseFloat(css.getPropertyValue('--safe-top')) || 0;
        const bottom = parseFloat(css.getPropertyValue('--safe-bottom')) || 0;
        const u = parseFloat(css.getPropertyValue('--u')) || 1;
        const visible = (el: Element) => {
          const r = el.getBoundingClientRect();
          const st = getComputedStyle(el);
          return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none';
        };
        const tappables = [...document.querySelectorAll('button')].filter(visible);
        return {
          scroll: document.documentElement.scrollHeight > innerHeight + 1 || document.documentElement.scrollWidth > innerWidth + 1,
          overflow: [...document.querySelectorAll('body *')].filter((el) => {
            const e = el as HTMLElement;
            return e.children.length === 0 && e.textContent?.trim() && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== 'visible';
          }).length,
          small: tappables
            .map((b) => ({ id: b.getAttribute('data-testid') ?? b.getAttribute('aria-label') ?? b.className, r: b.getBoundingClientRect() }))
            .filter(({ r }) => Math.min(r.width, r.height) < 48 * Math.min(u, 1) - 0.5)
            .map(({ id, r }) => `${id} ${r.width.toFixed(0)}x${r.height.toFixed(0)}`),
          outside: tappables
            .map((b) => ({ id: b.getAttribute('data-testid') ?? b.className, r: b.getBoundingClientRect() }))
            .filter(({ r }) => r.top < top - 1 || r.bottom > innerHeight - bottom + 1 || r.left < -1 || r.right > innerWidth + 1)
            .filter(({ id }) => !String(id).startsWith('tab-')) // the tab bar sits in the bottom inset by design (padded)
            .map(({ id }) => String(id)),
        };
      });
      if (layout.scroll) problems.push(`${tag}/${scene}: document scrolls`);
      if (layout.overflow) problems.push(`${tag}/${scene}: ${layout.overflow} clipped text elements`);
      if (layout.small.length) problems.push(`${tag}/${scene}: tappables under 48 pt: ${layout.small.join(', ')}`);
      if (layout.outside.length) problems.push(`${tag}/${scene}: controls outside the safe viewport: ${layout.outside.join(', ')}`);
      await page.screenshot({ path: `${out}/${scene}-${tag}.png` });
      await page.close();
    }
    await ctx.close();
  }
  await browser.close();
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exitCode = 1;
  } else console.log(`ok: ${list.length} scene(s) × ${SIZES.length} sizes → ${out}`);
}
main();
