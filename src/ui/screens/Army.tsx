import { useState } from 'preact/hooks';
import type { Slot } from '../../contracts';
import { buyUnlock, buyUpgrade, save } from '../../app/store';
import { ageDef } from '../../data/ages';
import { MAX_LEVEL, UNLOCK_PRICE, foodRate, playerBaseHp, trainingMult, type Track } from '../../data/economy';
import { rosterOf } from '../../data/units';
import { canUnlock, canUpgrade, priceFor, trackAvailable } from '../../meta/progress';
import { Icon, type IconName } from '../kit/icons';
import { Button, Pill } from '../kit/kit';

/** Army (UX §5): the roster and the five Camp tracks. Must fit without scrolling at 375 × 667. */
export function Army() {
  const s = save.value;
  const age = ageDef(s.armyAge);
  const roster = rosterOf(s.armyAge);
  const slots: Slot[] = ['melee', 'ranged', 'tank'];
  const tracks: Track[] = ['food', 'walls', 'melee', 'ranged', 'tank'];
  return (
    <div class="screen army" data-testid="army">
      <header class="topbar">
        <div class="screen-title t-display">{age.name.replace(' Age', '').toUpperCase()} CAMP</div>
        <Pill icon="coin" value={s.gold} testId="gold" />
      </header>
      <div class="roster">
        {slots.map((slot) => {
          const def = roster[slot];
          const owned = slot === 'melee' || s.owned[slot as 'ranged' | 'tank'];
          const m = trainingMult(s.levels[slot]);
          return (
            <div key={slot} class={`unit-card ${slot} ${owned ? '' : 'locked'}`} data-testid={`unit-${slot}`}>
              <span class="unit-portrait">
                <Icon name={owned ? (slot as IconName) : 'lock'} size={56} />
              </span>
              {owned && <span class="lvl unit-lvl">{s.levels[slot]}</span>}
              <span class="unit-name">{def.name}</span>
              {owned ? (
                <span class="unit-stats">
                  <Icon name="heart" size={16} />
                  {Math.round(def.hp * m)}
                  <Icon name="sword" size={16} />
                  {Math.round(def.dmg * m)}
                </span>
              ) : slot === 'tank' && !s.owned.ranged ? (
                <span class="unit-needs">Needs Ranged</span>
              ) : (
                <UnlockButton slot={slot as 'ranged' | 'tank'} />
              )}
            </div>
          );
        })}
      </div>
      <div class="tracks panel">
        {tracks.filter((t) => trackAvailable(s, t)).map((t, i) => (
          <TrackRow key={t} track={t} index={i} />
        ))}
      </div>
    </div>
  );
}

function UnlockButton({ slot }: { slot: 'ranged' | 'tank' }) {
  const s = save.value;
  return (
    <Button size="s" tone={canUnlock(s, slot) ? 'gold' : 'grey'} disabled={!canUnlock(s, slot)} icon="coin" label={String(UNLOCK_PRICE[slot])} onPress={() => buyUnlock(slot)} testId={`unlock-${slot}`} ariaLabel={`Unlock for ${UNLOCK_PRICE[slot]} Gold`} />
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

function TrackRow({ track, index }: { track: Track; index: number }) {
  const s = save.value;
  const lv = s.levels[track];
  const price = priceFor(s, track);
  const can = canUpgrade(s, track);
  const [flip, setFlip] = useState(0);
  const max = lv >= MAX_LEVEL;
  return (
    <div class="track" style={{ animationDelay: `${index * 35}ms` }} data-testid={`track-${track}`}>
      <Icon name={TRACK_META[track].icon} size={36} />
      <div class="track-main">
        <div class="track-name">
          {TRACK_META[track].name}
          <span class={`lvl ${flip ? (flip % 2 ? 'flipA' : 'flipB') : ''}`}>{lv}</span>
          <span class="track-of">/ {MAX_LEVEL}</span>
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
        <Button size="s" tone={can ? 'green' : 'grey'} disabled={!can} icon="coin" label={String(price)} testId={`buy-${track}`} ariaLabel={`Upgrade ${TRACK_META[track].name} for ${price} Gold`} onPress={() => {
          if (buyUpgrade(track)) setFlip((f) => f + 1);
        }} />
      )}
    </div>
  );
}
