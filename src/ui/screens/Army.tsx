import { useEffect, useRef, useState } from 'preact/hooks';
import type { Slot } from '../../contracts';
import { coachStep, inTutorial } from '../../app/ftue';
import { reduceMotion } from '../../app/motion';
import { armyFocus, buyUnlock, buyUpgrade, markFtue, save } from '../../app/store';
import { ageDef } from '../../data/ages';
import { MAX_LEVEL, UNLOCK_PRICE, foodRate, playerBaseHp, trainingMult, type Track } from '../../data/economy';
import { rosterOf } from '../../data/units';
import { canUnlock, canUpgrade, priceFor, trackAvailable } from '../../meta/progress';
import { centerOf, coinBurst, confetti, floatText, replayClass, sparkles } from '../kit/fx';
import { Icon, Portrait, type IconName } from '../kit/icons';
import { displayName, portraitUrl } from '../skin';
import { Button, Pill } from '../kit/kit';

/**
 * Army (UX §5): the roster and the five Camp tracks. Must fit without scrolling at 375 × 667. Purchases play the
 * ART_BIBLE §5.14 choreography (coins from the wallet to the button, level flip, stat glow, sparkles, a "+N" float,
 * the troop card bounces); an unlock flips the card from silhouette to colour with confetti.
 */
export function Army() {
  const s = save.value;
  const age = ageDef(s.armyAge);
  const roster = rosterOf(s.armyAge);
  const slots: Slot[] = ['melee', 'ranged', 'tank'];
  const tracks: Track[] = ['food', 'walls', 'melee', 'ranged', 'tank'];
  // while Nimbus points at something here, the deep-link mark steps aside so there is one thing to look at
  const focus = useFocus();
  const f = coachStep.value ? null : focus.value;
  const [reveal, setReveal] = useState<{ slot: Slot; phase: 'out' | 'in' } | null>(null);
  const cards = useRef<HTMLDivElement>(null);
  const unlock = (slot: 'ranged' | 'tank', btn: Element | null) => {
    const from = centerOf(document.querySelector('.army [data-testid="gold"] .icon'));
    const to = centerOf(btn);
    if (!buyUnlock(slot)) return;
    if (slot === 'ranged' && inTutorial(save.value)) markFtue('recruit');
    if (focus.peek()?.kind === 'unlock') armyFocus.value = null;
    if (from && to) coinBurst(from, to, 5);
    setReveal({ slot, phase: 'out' });
    setTimeout(() => {
      setReveal({ slot, phase: 'in' });
      const c = centerOf(cards.current?.querySelector(`[data-testid="unit-${slot}"]`));
      if (c) {
        confetti(c, 28, { ms: 1600, power: 0.7 });
        sparkles(c, 8);
      }
    }, 200);
    setTimeout(() => setReveal((r) => (r?.slot === slot ? null : r)), 1500);
  };
  return (
    <div class="screen army" data-testid="army">
      <header class="topbar">
        <div class="screen-title t-display">{age.name.replace(' Age', '').toUpperCase()} CAMP</div>
        <Pill icon="coin" value={s.gold} testId="gold" />
      </header>
      <div class="roster" ref={cards}>
        {slots.map((slot) => {
          const def = roster[slot];
          const revealing = reveal?.slot === slot ? reveal.phase : null;
          const owned = (slot === 'melee' || s.owned[slot as 'ranged' | 'tank']) && revealing !== 'out';
          const m = trainingMult(s.levels[slot]);
          const focused = f?.kind === 'unlock' && f.slot === slot;
          const cls = ['unit-card', slot, owned ? '' : 'locked', revealing === 'out' ? 'reveal-out' : revealing === 'in' ? 'reveal-in' : '', focused ? 'focus' : ''].join(' ');
          return (
            <div key={slot} class={cls} data-testid={`unit-${slot}`}>
              {focused && <span class="tip-badge">BEST</span>}
              {revealing === 'in' && <span class="new-badge">NEW!</span>}
              <span class="unit-portrait">
                <Portrait src={portraitUrl(def.age, slot)} class={owned ? '' : 'shadowed'} fallback={owned ? (slot as IconName) : 'lock'} />
                {!owned && <span class="lock-badge"><Icon name="lock" size={30} /></span>}
              </span>
              {owned && <span class="lvl unit-lvl">{s.levels[slot]}</span>}
              <span class={`unit-name ${displayName(def.id).length > 11 ? 'long' : ''}`}>{displayName(def.id)}</span>
              {owned ? (
                <span class="unit-stats">
                  <Icon name="heart" size={16} />
                  {Math.round(def.hp * m)}
                  <Icon name="sword" size={16} />
                  {Math.round(def.dmg * m)}
                </span>
              ) : revealing === 'out' ? null : slot === 'tank' && !s.owned.ranged ? (
                <span class="unit-needs">Needs Ranged</span>
              ) : (
                <UnlockButton slot={slot as 'ranged' | 'tank'} onBuy={unlock} />
              )}
            </div>
          );
        })}
      </div>
      <div class="tracks panel">
        {tracks.filter((t) => trackAvailable(s, t)).map((t, i) => (
          <TrackRow key={t} track={t} index={i} focused={f?.kind === 'upgrade' && f.track === t} />
        ))}
      </div>
    </div>
  );
}

/** The Results deep link: bring the recommended row into view once, keep it marked until bought or the screen closes. */
function useFocus() {
  useEffect(() => {
    const f = armyFocus.peek();
    if (f) {
      const sel = f.kind === 'upgrade' ? `[data-testid="track-${f.track}"]` : `[data-testid="unit-${f.slot}"]`;
      requestAnimationFrame(() => document.querySelector(sel)?.scrollIntoView({ block: 'nearest', behavior: reduceMotion() ? 'auto' : 'smooth' }));
    }
    return () => {
      armyFocus.value = null;
    };
  }, []);
  return armyFocus;
}

function UnlockButton({ slot, onBuy }: { slot: 'ranged' | 'tank'; onBuy: (slot: 'ranged' | 'tank', el: Element | null) => void }) {
  const s = save.value;
  return (
    <Button size="s" tone={canUnlock(s, slot) ? 'gold' : 'grey'} disabled={!canUnlock(s, slot)} icon="coin" label={String(UNLOCK_PRICE[slot])} onPress={() => onBuy(slot, document.querySelector(`[data-testid="unlock-${slot}"]`))} testId={`unlock-${slot}`} ariaLabel={`Unlock for ${UNLOCK_PRICE[slot]} Gold`} />
  );
}

const TRACK_META: Record<Track, { name: string; icon: IconName }> = {
  food: { name: 'Food', icon: 'food' },
  walls: { name: 'Walls', icon: 'wall' },
  melee: { name: 'Melee', icon: 'melee' },
  ranged: { name: 'Ranged', icon: 'ranged' },
  tank: { name: 'Tank', icon: 'tank' },
};

function effect(track: Track, level: number, age: Parameters<typeof foodRate>[0]): string {
  if (track === 'food') return `${foodRate(age, level).toFixed(1)}/s`;
  if (track === 'walls') return `${playerBaseHp(age, level)} HP`;
  return `+${Math.round((trainingMult(level) - 1) * 100)}%`;
}

/** What one level adds, for the purchase float ("+0.1/s", "+60 HP", "+10%"). */
function gain(track: Track, level: number, age: Parameters<typeof foodRate>[0]): string {
  if (track === 'food') return `+${(foodRate(age, level) - foodRate(age, level - 1)).toFixed(1)}/s`;
  if (track === 'walls') return `+${playerBaseHp(age, level) - playerBaseHp(age, level - 1)} HP`;
  return `+${Math.round((trainingMult(level) - trainingMult(level - 1)) * 100)}%`;
}

function TrackRow({ track, index, focused }: { track: Track; index: number; focused: boolean }) {
  const s = save.value;
  const lv = s.levels[track];
  const price = priceFor(s, track);
  const can = canUpgrade(s, track);
  const [flip, setFlip] = useState(0);
  const max = lv >= MAX_LEVEL;
  const row = useRef<HTMLDivElement>(null);
  const buy = () => {
    const btn = row.current?.querySelector('.btn');
    const from = centerOf(document.querySelector('.army [data-testid="gold"] .icon'));
    const to = centerOf(btn);
    if (!buyUpgrade(track)) return;
    setFlip((f) => f + 1);
    if (armyFocus.peek()?.kind === 'upgrade') armyFocus.value = null;
    const after = save.value;
    const land = () => {
      const el = row.current;
      if (!el) return;
      replayClass(el, 'bought');
      replayClass(el.querySelector('.track-effect'), 'glow');
      const c = centerOf(el.querySelector('.track-effect b') ?? el.querySelector('.track-effect'));
      if (c) floatText({ x: c.x, y: c.y - 14 }, gain(track, after.levels[track], after.armyAge), 'good');
      const b = centerOf(btn) ?? to;
      if (b) sparkles(b, 6);
      if (track === 'melee' || track === 'ranged' || track === 'tank') replayClass(document.querySelector(`[data-testid="unit-${track}"]`), 'bounce');
    };
    if (from && to) coinBurst(from, to, 5, { onDone: land });
    else land();
  };
  return (
    <div ref={row} class={`track ${focused ? 'focus' : ''}`} style={{ animationDelay: `${index * 35}ms` }} data-testid={`track-${track}`}>
      <Icon name={TRACK_META[track].icon} size={36} />
      <div class="track-main">
        <div class="track-name">
          {TRACK_META[track].name}
          <span class={`lvl ${flip ? (flip % 2 ? 'flipA' : 'flipB') : ''}`}>{lv}</span>
          <span class="track-of">/ {MAX_LEVEL}</span>
          {focused && <span class="tip-badge" data-testid="focus-badge">BEST</span>}
        </div>
        <div class="track-effect">
          {effect(track, lv, s.armyAge)}
          {!max && (
            <>
              <Icon name="next" size={14} />
              <b>{effect(track, lv + 1, s.armyAge)}</b>
            </>
          )}
        </div>
      </div>
      {max ? (
        <span class="chip">MAX</span>
      ) : (
        <Button size="s" tone={can ? 'green' : 'grey'} disabled={!can} icon="coin" label={String(price)} testId={`buy-${track}`} ariaLabel={`Upgrade ${TRACK_META[track].name} for ${price} Gold`} onPress={buy} />
      )}
    </div>
  );
}
