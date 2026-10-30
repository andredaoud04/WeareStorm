import { useEffect, useRef, useState } from 'preact/hooks';
import { countTick } from '../../app/audio';
import { session, startBattle } from '../../app/battleController';
import { nextAgeInBuild } from '../../app/build';
import { affordable, armyFocus, go, results, resultsPhase, resultsPrimary, save, type ResultsPhase, type ResultsView } from '../../app/store';
import { setWorldMood } from '../../app/world';
import { canPlayStage, mustEvolve, priceFor, type Recommendation } from '../../meta/progress';
import { centerOf, coinBurst, confetti } from '../kit/fx';
import { Icon, type IconName } from '../kit/icons';
import { Button, Pill, useCountUp } from '../kit/kit';
import { slotName } from '../skin';
import { leaveBattle } from './BattleHud';

/**
 * Victory / defeat (UX §4) with the ART_BIBLE §5.14 choreography. Victory: the base collapses in slow motion, then at
 * +1.2 s the banner drops over rays and confetti, at +1.8 s the sheet slides up and the Gold rows count with a 250 ms
 * stagger, then the Total flies into the wallet and the primary button pops. Defeat: the world desaturates at once,
 * DEFEAT slides in at +0.7 s and the sheet follows. A tap on the backdrop skips straight to the end.
 */

const ORDER: ResultsPhase[] = ['hidden', 'banner', 'panel', 'done'];
const at = (p: ResultsPhase) => ORDER.indexOf(p);
const advance = (p: ResultsPhase) => {
  if (at(p) > at(resultsPhase.peek())) resultsPhase.value = p;
};

export function Results() {
  const r = results.value;
  const s = session.value;
  const active = !!r && !!s && r.battleId === s.id;
  useEffect(() => {
    if (!active || !r) return;
    const win = r.result === 'victory';
    const t1 = win ? 1200 : 700;
    const t2 = win ? 1800 : 1300;
    resultsPhase.value = 'hidden';
    if (!win) setWorldMood('defeat');
    const ts = [setTimeout(() => advance('banner'), t1), setTimeout(() => advance('panel'), t2), setTimeout(() => advance('done'), t2 + 1500)];
    return () => {
      ts.forEach(clearTimeout);
      resultsPhase.value = 'hidden';
      setWorldMood(null);
    };
  }, [active, r?.battleId]);
  const phase = resultsPhase.value;
  if (!active || !r || phase === 'hidden') return null;
  return <ResultsSheet r={r} phase={phase} />;
}

function ResultsSheet({ r, phase }: { r: ResultsView; phase: ResultsPhase }) {
  const win = r.result === 'victory';
  const st = save.value;
  const panelOn = at(phase) >= at('panel');
  const skipped = useRef(false);
  const banner = useRef<HTMLDivElement>(null);
  const total = useRef<HTMLSpanElement>(null);
  const wallet = useRef<HTMLDivElement>(null);
  const [walletIn, setWalletIn] = useState(false);
  // confetti with the banner drop
  useEffect(() => {
    if (!win) return;
    const c = centerOf(banner.current);
    if (c) confetti({ x: c.x, y: c.y }, 70);
  }, []);
  // the Total flies into the wallet once the counts are done
  useEffect(() => {
    if (phase !== 'done' || walletIn) return;
    const from = centerOf(total.current);
    const to = centerOf(wallet.current?.querySelector('.icon'));
    if (!from || !to || skipped.current || r.settlement.total <= 0) {
      setWalletIn(true);
      return;
    }
    coinBurst(from, to, 6, { stagger: 45, onLand: (i) => i === 0 && setWalletIn(true), onDone: () => setWalletIn(true) });
  }, [phase]);

  const kind = resultsPrimary(r, st);
  const nextId = Math.min(30, st.campaignStage);
  const primary =
    kind === 'evolve'
      ? { label: 'EVOLVE!', tone: 'purple' as const, icon: 'bolt' as const, act: () => done('ages') }
      : kind === 'upgrade'
        ? { label: 'Upgrade', tone: 'green' as const, icon: 'up' as const, act: () => upgrade(r) }
        : kind === 'next'
          ? { label: `Battle ${nextId}`, tone: 'blue' as const, icon: 'battle' as const, act: () => again(nextId) }
          : { label: 'Retry', tone: 'blue' as const, icon: 'battle' as const, act: () => again(r.stageId) };
  const kept = r.settlement.goldKept;
  const sub = win ? null : r.result === 'retreat' ? `You keep ${kept} Gold` : kind === 'upgrade' ? `You keep ${kept} Gold — upgrade and try again!` : `You keep ${kept} Gold — try again!`;
  const skip = () => {
    if (phase === 'done' || !results.peek()) return;
    skipped.current = true;
    advance('done');
  };
  const fast = skipped.current;
  return (
    <div class={`results ${win ? 'win' : 'lose'} ${panelOn ? 'panel-on' : ''}`} data-testid="results" data-phase={phase}>
      <div class="results-skip" onClick={skip} />
      <div class="results-vignette" />
      {win && <div class="results-rays" />}
      <div class="results-wallet" ref={wallet}>
        <Pill icon="coin" value={walletIn ? st.gold : st.gold - r.settlement.total} testId="results-wallet" />
      </div>
      <div class="results-banner t-display" data-testid="results-banner" ref={banner}>
        {win ? (r.warlord ? 'WARLORD DEFEATED!' : 'VICTORY!') : r.result === 'retreat' ? 'RETREAT' : 'DEFEAT'}
      </div>
      {sub && <div class="results-sub">{sub}</div>}
      <div class={`panel results-panel ${panelOn ? '' : 'pending'}`} onClick={skip}>
        <Row icon="skull" label={`${r.kills} ${r.kills === 1 ? 'Kill' : 'Kills'}`} value={r.killGold} delay={0} start={panelOn} fast={fast} testId="results-kills" />
        <Row icon="flag" label="Base damage" value={r.baseGold} delay={250} start={panelOn} fast={fast} testId="results-base" />
        {r.settlement.bonus > 0 && <Row icon="star" label={r.settlement.firstClear ? 'Victory bonus' : 'Replay bonus'} value={r.settlement.bonus} delay={500} start={panelOn} fast={fast} />}
        <div class="results-total">
          <span>{win ? 'Total' : 'You keep'}</span>
          <Total value={r.settlement.total} start={panelOn} fast={fast} ref_={total} />
        </div>
        {!win && r.next && <Tip rec={r.next} onPress={() => upgrade(r)} />}
        <div class="results-actions">
          <div class="results-primary-wrap act" style={{ ['--d' as string]: fast ? '0ms' : '1000ms' }}>
            <Button size="l" tone={primary.tone} icon={primary.icon} label={primary.label} highlight onPress={primary.act} testId="results-primary" />
            {kind === 'upgrade' && affordable.value > 0 && <span class="badge results-badge" data-testid="results-badge">{affordable.value}</span>}
          </div>
          <div class="results-secondary act" style={{ ['--d' as string]: fast ? '0ms' : '1120ms' }}>
            <Button tone="dark" icon="home" label="Home" onPress={() => done('hub')} testId="results-home" />
            {kind === 'upgrade' && <Button tone="blue" icon="battle" label={win ? 'Next' : 'Retry'} onPress={() => again(win ? nextId : r.stageId)} testId="results-again" />}
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

/** Upgrade deep-links to the recommended item: the Army brings that row into view and marks it. */
function upgrade(r: ResultsView) {
  armyFocus.value = r.next && r.next.kind !== 'evolve' ? r.next : null;
  done('army');
}

function again(stageId: number) {
  results.value = null;
  if (!canPlayStage(save.value, stageId)) {
    leaveBattle(mustEvolve(save.value) && nextAgeInBuild(save.value) ? 'ages' : 'hub'); // the next battle needs an Evolve first
    return;
  }
  startBattle(stageId);
  go('battle');
}

function Row({ icon, label, value, delay, start, fast, testId }: { icon: IconName; label: string; value: number; delay: number; start: boolean; fast: boolean; testId?: string }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!start) return;
    if (fast) return setOn(true);
    const t = setTimeout(() => setOn(true), delay);
    return () => clearTimeout(t);
  }, [start, fast, delay]);
  const v = useCountUp(on ? value : 0, fast ? 1 : 500);
  useEffect(() => void countTick(v, value), [v]);
  return (
    <div class={`results-row ${on ? 'on' : ''}`} data-testid={testId}>
      <Icon name={icon} size={30} />
      <span class="results-label">{label}</span>
      <span class="results-value t-display">+{v}</span>
    </div>
  );
}

function Total({ value, start, fast, ref_ }: { value: number; start: boolean; fast: boolean; ref_: { current: HTMLSpanElement | null } }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!start) return;
    if (fast) return setOn(true);
    const t = setTimeout(() => setOn(true), 800);
    return () => clearTimeout(t);
  }, [start, fast]);
  const v = useCountUp(on ? value : 0, fast ? 1 : 600);
  useEffect(() => countTick(v, value), [v]);
  return (
    <span class="results-total-v t-display" ref={ref_} data-testid="results-total">
      <Icon name="coin" size={30} />+{v}
    </span>
  );
}

const TRACK_NAME = { food: 'Food', walls: 'Walls', melee: 'Melee training', ranged: 'Ranged training', tank: 'Tank training' } as const;

/** The defeat tip (UX §4): what to buy, as a deep link into the Army. */
function Tip({ rec, onPress }: { rec: Recommendation; onPress: () => void }) {
  const st = save.value;
  const text =
    rec.kind === 'unlock'
      ? `Unlock the ${slotName(st.armyAge, rec.slot)} for ${rec.price} Gold`
      : rec.kind === 'upgrade'
        ? `${TRACK_NAME[rec.track]} Lv ${st.levels[rec.track] + 1} for ${priceFor(st, rec.track)} Gold`
        : 'Evolve your army';
  return (
    <button class="results-tip" onClick={onPress} data-testid="results-tip" disabled={rec.kind === 'evolve'}>
      <Icon name="up" size={24} />
      <span>{text}</span>
      {rec.kind !== 'evolve' && <Icon name="next" size={18} />}
    </button>
  );
}
