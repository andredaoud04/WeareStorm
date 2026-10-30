import { startBattle } from '../../app/battleController';
import { affordable, campaignComplete, evolveReady, go, nextStage, route, save, sheet } from '../../app/store';
import { ageDef } from '../../data/ages';
import { STAGES, stageDef } from '../../data/stages';
import { mustEvolve } from '../../meta/progress';
import { Icon } from '../kit/icons';
import { Button, Pill, TabBar } from '../kit/kit';
import { MAX_AGE } from './Ages';
import { stageTitle, warlordName } from '../skin';

/** Hub, the Battle tab (UX §2): the diorama lives in the Pixi world behind this layer. */
export function Hub() {
  const s = save.value;
  const stage = stageDef(nextStage.value);
  const age = ageDef(stage.age);
  const evolveFirst = mustEvolve(s);
  const shownAge = evolveFirst ? ageDef(s.armyAge) : age;
  const pips = STAGES.filter((x) => x.age === shownAge.id);
  return (
    <div class="screen hub" data-testid="hub">
      <header class="topbar">
        <Pill icon="coin" value={s.gold} testId="gold" />
        <Button size="s" tone="dark" icon="gear" iconOnly ariaLabel="Settings" onPress={() => (sheet.value = 'settings')} testId="settings" />
      </header>
      <div class="age-chip t-display">{shownAge.name.toUpperCase()}</div>
      <div class="pips" aria-label="Stages">
        {pips.map((p) => {
          const done = s.clearedStages.includes(p.id);
          const cur = p.id === s.campaignStage;
          return (
            <span key={p.id} class={`pip ${done ? 'done' : ''} ${cur ? 'cur' : ''} ${p.warlord ? 'boss' : ''}`}>
              {p.warlord ? <Icon name="skull" size={22} /> : done ? <Icon name="check" size={16} /> : null}
            </span>
          );
        })}
      </div>
      <div class="hub-cta" data-uitop>
        {campaignComplete.value ? (
          <>
            <div class="cta-sub t-display">CAMPAIGN COMPLETE</div>
            <Button size="l" tone="gold" icon="star" label={`Replay ${warlordName('future')}`} highlight onPress={() => play(30)} testId="battle" />
          </>
        ) : evolveFirst && age.index >= MAX_AGE ? (
          <>
            <div class="cta-sub t-display" data-testid="coming-soon">{age.name.toUpperCase()} IS COMING SOON</div>
            <div class="cta-sub">You beat every battle of this build. Thanks for playing!</div>
          </>
        ) : evolveFirst ? (
          <>
            <Button size="l" tone="purple" icon="bolt" label="EVOLVE!" highlight={evolveReady.value} onPress={() => go('ages')} testId="evolve-cta" />
            <div class="cta-sub">Your army must evolve to fight on</div>
          </>
        ) : (
          <>
            <Button size="l" tone={stage.warlord ? 'red' : 'blue'} icon={stage.warlord ? 'crown' : 'battle'} label={`BATTLE ${stage.id}`} highlight onPress={() => play(stage.id)} testId="battle" />
            <div class="cta-sub">{stage.warlord ? `WARLORD: ${stageTitle(stage)}` : stage.title}</div>
          </>
        )}
      </div>
    </div>
  );
}

function play(stageId: number) {
  startBattle(stageId);
  go('battle');
}

export function MainTabs() {
  const tabs = [
    { id: 'army', label: 'Army', icon: 'helmet' as const, badge: affordable.value || null },
    { id: 'hub', label: 'Battle', icon: 'battle' as const },
    { id: 'ages', label: 'Ages', icon: 'ages' as const, badge: evolveReady.value ? ('glow' as const) : null },
  ];
  return <TabBar tabs={tabs} active={route.value} onSelect={(id) => go(id as 'hub' | 'army' | 'ages')} />;
}
