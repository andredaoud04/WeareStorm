/**
 * End-to-end: a brand-new player's first minutes, played through the real UI with real taps (BUILD_PLAN 1C).
 * Usage: npx tsx tools/screens/e2e.ts [baseUrl]
 * Title → Battle 1 (tap the Clubber card until the battle ends) → Results → Upgrade → unlock the Slinger →
 * Battle 2 starts with two cards → reload mid-battle → the save survives and the open battle is settled.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  try {
    return require('playwright');
  } catch {
    return require('/opt/node-tools/node_modules/playwright');
  }
}

const base = process.argv[2] ?? 'http://127.0.0.1:5173';
const step = (msg: string) => console.log(`- ${msg}`);

async function main() {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e: Error) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m: { type(): string; text(): string }) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  const fail = (msg: string) => {
    throw new Error(msg);
  };

  await page.goto(base);
  await page.getByTestId('title').waitFor();
  step('title shows on a fresh save');
  await page.getByTestId('title').click();
  await page.getByTestId('battle-hud').waitFor();
  if ((await page.getByTestId('stage-chip').innerText()).trim() !== 'BATTLE 1') fail('first tap should start Battle 1');
  if (await page.getByTestId('card-ranged').count()) fail('a new player should own only the Clubber');
  step('first tap goes straight into Battle 1 with one card');

  if (await page.getByTestId('speed').count()) fail('x2 speed should stay hidden until Battle 3');
  await page.evaluate(() => (window.__ws as { setSpeed(n: number): void }).setSpeed(2));
  const started = Date.now();
  while (!(await page.getByTestId('results').count())) {
    if (Date.now() - started > 120_000) fail('Battle 1 did not end within 120 s of real time');
    await page.getByTestId('card-melee').dispatchEvent('pointerdown');
    await page.waitForTimeout(400);
  }
  const banner = (await page.getByTestId('results-banner').innerText()).trim();
  if (banner !== 'VICTORY!') fail(`tapping Clubbers should win Battle 1, got "${banner}"`);
  step(`won Battle 1 in ${((Date.now() - started) / 1000).toFixed(0)} s of real time at x2`);

  const gold = await page.evaluate(() => (window.__ws as { state(): { save: { gold: number } } }).state().save.gold);
  if (gold < 30) fail(`Battle 1 should pay enough for the 30-Gold Slinger, paid ${gold}`);
  const primary = (await page.getByTestId('results-primary').innerText()).trim();
  if (primary !== 'Upgrade') fail(`with ${gold} Gold the primary button should be Upgrade, got "${primary}"`);
  await page.getByTestId('results-primary').click({ force: true }); // highlighted buttons breathe (never 'stable')
  await page.getByTestId('army').waitFor();
  step(`Results paid ${gold} Gold and Upgrade opened the Army`);

  await page.getByTestId('unlock-ranged').click({ force: true });
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => (window.__ws as { state(): { save: { gold: number; owned: { ranged: boolean } } } }).state().save);
  if (!after.owned.ranged || after.gold !== gold - 30) fail('unlocking the Slinger should cost 30 Gold');
  step('unlocked the Slinger for 30 Gold');

  await page.getByTestId('tab-hub').click();
  await page.getByTestId('hub').waitFor();
  if (!(await page.getByTestId('battle').innerText()).includes('BATTLE 2')) fail('the Hub should offer Battle 2');
  await page.getByTestId('battle').click({ force: true });
  await page.getByTestId('card-ranged').waitFor();
  step('Battle 2 starts with the Clubber and the Slinger');

  await page.waitForTimeout(1500);
  await page.reload();
  await page.getByTestId('title').waitFor();
  const saved = await page.evaluate(() => (window.__ws as { state(): { save: { campaignStage: number; owned: { ranged: boolean }; pendingBattle: unknown; stats: { battles: number } } } }).state().save);
  if (saved.campaignStage !== 2 || !saved.owned.ranged) fail('progress should survive a reload');
  if (saved.pendingBattle) fail('a battle interrupted by a reload should be settled on boot');
  if (saved.stats.battles !== 2) fail(`the interrupted battle should be recorded, battles = ${saved.stats.battles}`);
  await page.getByTestId('title').click();
  await page.getByTestId('hub').waitFor();
  step('after a reload the save survives, the open battle is settled, and the title leads to the Hub');

  await browser.close();
  if (errors.length) fail(`console errors:\n${errors.join('\n')}`);
  console.log('e2e passed');
}

main().catch((e) => {
  console.error(`e2e FAILED: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
