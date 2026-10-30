import { MAX_AGE } from '../../app/build';
import { doEvolve, go, save, toast } from '../../app/store';
import { AGE_ORDER } from '../../contracts';
import { AGES, ageDef } from '../../data/ages';
import { rosterOf } from '../../data/units';
import { canEvolve, evolvePrice, mustEvolve } from '../../meta/progress';
import { Icon, Portrait } from '../kit/icons';
import { displayName, portraitUrl, warlordName } from '../skin';
import { Button, Panel, Pill } from '../kit/kit';

export { MAX_AGE } from '../../app/build';

/**
 * Ages (UX §6): the six-Age track and the Evolve button. Evolve is free once this Age's Warlord is beaten; before
 * that it can be bought early for Gold (GDD §3.5). Ages past MAX_AGE read "coming next".
 */
export function Ages() {
  const s = save.value;
  const cur = ageDef(s.armyAge);
  const next = AGES[cur.index + 1];
  const price = evolvePrice(s);
  const beaten = s.warlordsBeaten.includes(s.armyAge);
  const nextLocked = !next || next.index >= MAX_AGE;
  const roster = rosterOf(s.armyAge);
  return (
    <div class="screen ages" data-testid="ages">
      <header class="topbar">
        <div class="screen-title t-display">AGES</div>
        <Pill icon="coin" value={s.gold} testId="gold" />
      </header>
      <div class="medals" role="list">
        {AGE_ORDER.map((id, i) => {
          const a = ageDef(id);
          const state = i < cur.index ? 'past' : i === cur.index ? 'cur' : 'future';
          return (
            <div key={id} class={`medal ${state}`} role="listitem" aria-label={a.name}>
              <span class="medal-disc">{state === 'future' ? <Icon name="lock" size={26} /> : state === 'past' ? <Icon name="check" size={26} /> : <Icon name="bolt" size={30} />}</span>
              <span class="medal-name">{a.name.replace(' Age', '')}</span>
            </div>
          );
        })}
      </div>
      <Panel title={cur.name.toUpperCase()} tone="purple" class="age-panel">
        <div class="age-body">
          <div class="age-troops">
            {(['melee', 'ranged', 'tank'] as const).map((slot) => (
              <div key={slot} class={`age-troop ${slot}`}>
                <Portrait src={portraitUrl(s.armyAge, slot)} class="small" fallback={slot} size={40} />
                <span>{displayName(roster[slot].id)}</span>
              </div>
            ))}
          </div>
          <div class={`age-warlord ${beaten ? 'beaten' : ''}`}>
            <Icon name="crown" size={30} />
            <span>{warlordName(s.armyAge)}</span>
            {beaten && <Icon name="check" size={26} />}
          </div>
          {nextLocked ? (
            <div class="age-next" data-testid="age-coming">
              <span class="t-display">{next ? `${next.name.toUpperCase()}` : 'FINAL AGE'}</span>
              <span>{next ? 'Coming next' : 'You reached the top of the storm'}</span>
            </div>
          ) : price === null ? (
            <div class="age-next">
              <span>Win the battles of this Age to evolve again</span>
            </div>
          ) : (
            <div class="age-evolve">
              <Button
                size="l"
                tone="purple"
                icon="bolt"
                label="EVOLVE!"
                sub={price === 0 ? 'Free' : `${price} Gold`}
                highlight={canEvolve(s)}
                disabled={!canEvolve(s)}
                testId="evolve"
                onPress={() => {
                  if (doEvolve()) {
                    toast(`${ageDef(save.value.armyAge).name.toUpperCase()}!`, 'storm', 2400);
                    go('hub');
                  }
                }}
              />
              <span class="age-hint">{price === 0 ? 'Your army is ready.' : mustEvolve(s) ? '' : `Evolve early, or beat ${warlordName(s.armyAge)} to evolve free.`}</span>
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}
