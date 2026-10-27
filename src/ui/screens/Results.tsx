import { useEffect, useState } from 'preact/hooks';
import { countTick } from '../../app/audio';
import { session, startBattle } from '../../app/battleController';
import { go, results, save } from '../../app/store';
import { canEvolve, canPlayStage, mustEvolve, priceFor, type Recommendation } from '../../meta/progress';
import { Icon } from '../kit/icons';
import { Button, useCountUp } from '../kit/kit';
import { leaveBattle } from './BattleHud';

/**
 * Victory / defeat (UX §4). Appears after the end-of-battle slow-motion beat. The smart primary button follows the
 * shared recommendUpgrade() rule: Upgrade when something is affordable, otherwise the next battle.
 */
export function Results() {
  const r = results.value;
  const s = session.value;
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!r) {
      setShown(false);
      return;
    }
    const t = setTimeout(() => setShown(true), r.result === 'victory' ? 1250 : 700);
    return () => clearTimeout(t);
  }, [r?.battleId]);
  if (!r || !s || r.battleId !== s.id || !shown) return null;
  const win = r.result === 'victory';
  const st = save.value;
  const evolveNow = win && r.warlord && canEvolve(st);
  const nextId = Math.min(30, st.campaignStage);
  const primary = evolveNow
    ? { label: 'EVOLVE!', tone: 'purple' as const, icon: 'bolt' as const, act: () => done('ages') }
    : r.next && r.next.kind !== 'evolve'
      ? { label: 'Upgrade', tone: 'green' as const, icon: 'up' as const, act: () => done('army') }
      : win
        ? { label: `Battle ${nextId}`, tone: 'blue' as const, icon: 'battle' as const, act: () => again(nextId) }
        : { label: 'Retry', tone: 'blue' as const, icon: 'battle' as const, act: () => again(r.stageId) };
  return (
    <div class={`results ${win ? 'win' : 'lose'}`} data-testid="results">
      <div class="results-rays" />
      <div class="results-banner t-display" data-testid="results-banner">
        {win ? (r.warlord ? 'WARLORD DEFEATED!' : 'VICTORY!') : r.result === 'retreat' ? 'RETREAT' : 'DEFEAT'}
      </div>
      <div class="panel results-panel">
        <Row icon="skull" label="Enemies defeated" value={r.kills} delay={0} plain />
        <Row icon="coin" label={win ? 'Battle Gold' : 'You keep'} value={r.settlement.goldKept} delay={250} />
        {r.settlement.bonus > 0 && <Row icon="star" label={r.settlement.firstClear ? 'Victory bonus' : 'Replay bonus'} value={r.settlement.bonus} delay={500} />}
        <div class="results-total">
          <span>Total</span>
          <Total value={r.settlement.total} />
        </div>
        {!win && r.next && <Tip rec={r.next} />}
        <div class="results-actions">
          <Button size="l" tone={primary.tone} icon={primary.icon} label={primary.label} highlight onPress={primary.act} testId="results-primary" />
          <div class="results-secondary">
            <Button tone="dark" icon="home" label="Home" onPress={() => done('hub')} testId="results-home" />
            {primary.label === 'Upgrade' && (
              <Button tone="blue" icon="battle" label={win ? 'Next' : 'Retry'} onPress={() => again(win ? nextId : r.stageId)} testId="results-again" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function done(to: 'hub' | 'army' | 'ages') {
  results.value = null;
  leaveBattle(to);
}

function again(stageId: number) {
  results.value = null;
  if (!canPlayStage(save.value, stageId)) {
    leaveBattle(mustEvolve(save.value) ? 'ages' : 'hub'); // the next battle needs an Evolve first
    return;
  }
  startBattle(stageId);
  go('battle');
}

function Row({ icon, label, value, delay, plain }: { icon: 'coin' | 'star' | 'skull'; label: string; value: number; delay: number; plain?: boolean }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setOn(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  const v = useCountUp(on ? value : 0, 500);
  useEffect(() => void (plain || countTick(v, value)), [v]);
  return (
    <div class={`results-row ${on ? 'on' : ''}`}>
      <Icon name={icon} size={30} />
      <span class="results-label">{label}</span>
      <span class="results-value t-display">{plain ? v : `+${v}`}</span>
    </div>
  );
}

function Total({ value }: { value: number }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setOn(true), 800);
    return () => clearTimeout(t);
  }, []);
  const v = useCountUp(on ? value : 0, 600);
  useEffect(() => countTick(v, value), [v]);
  return (
    <span class="results-total-v t-display">
      <Icon name="coin" size={30} />+{v}
    </span>
  );
}

const TRACK_NAME = { food: 'Food', walls: 'Walls', melee: 'Melee training', ranged: 'Ranged training', tank: 'Tank training' } as const;

function Tip({ rec }: { rec: Recommendation }) {
  const st = save.value;
  const text =
    rec.kind === 'unlock'
      ? `Unlock the ${rec.slot === 'ranged' ? 'Slinger' : 'Rockhide'} for ${rec.price} Gold`
      : rec.kind === 'upgrade'
        ? `${TRACK_NAME[rec.track]} Lv ${st.levels[rec.track] + 1} for ${priceFor(st, rec.track)} Gold`
        : 'Evolve your army';
  return (
    <div class="results-tip">
      <Icon name="up" size={24} />
      <span>{text}</span>
    </div>
  );
}
