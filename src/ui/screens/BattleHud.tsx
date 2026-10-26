import { useEffect, useRef, useState } from 'preact/hooks';
import type { Slot } from '../../contracts';
import { session, type BattleSession } from '../../app/battleController';
import { go, markFtue, save, setSetting, sheet, toast } from '../../app/store';
import { rosterOf } from '../../data/units';
import { portraits } from '../../render/art/portraits';
import type { SaveV1 } from '../../meta/save';
import { Icon, type IconName } from '../kit/icons';
import { Bar, Button, Pill, Sheet } from '../kit/kit';

const SLOTS: Slot[] = ['melee', 'ranged', 'tank'];
const ROLE_ICON: Record<Slot, IconName> = { melee: 'melee', ranged: 'ranged', tank: 'tank' };

/** Battle HUD (UX §3): top bar, base bars, the deck. Gameplay numbers come from the session at 10 Hz. */
export function BattleHud() {
  const s = session.value;
  if (!s) return null;
  return <Hud s={s} key={s.id} />;
}

function Hud({ s }: { s: BattleSession }) {
  const hud = s.hud.value;
  const st = save.value;
  const stage = s.stage;
  const owned = SLOTS.filter((x) => x === 'melee' || st.owned[x as 'ranged' | 'tank']);
  const [speed, setSpeed] = useState(s.speed);
  const ended = s.ended$.value;
  useBattleToasts(s);
  const coach = stage.id === 1 && !st.ftue['deploy1'];
  return (
    <div class="screen battle" data-testid="battle-hud">
      <header class="topbar">
        <Button size="s" tone="dark" icon="pause" iconOnly ariaLabel="Pause" testId="pause" onPress={() => {
          if (ended) return;
          s.paused = true;
          sheet.value = 'pause';
        }} />
        <Pill icon="coin" value={hud.gold} testId="battle-gold" />
        <div class="stage-chip t-display" data-testid="stage-chip">
          {stage.warlord && <Icon name="crown" size={22} />}
          BATTLE {stage.id}
        </div>
        <Button size="s" tone={speed > 1 ? 'gold' : 'dark'} icon="speed" iconOnly ariaLabel="Speed" testId="speed" onPress={() => {
          s.speed = s.speed > 1 ? 1 : 2;
          setSpeed(s.speed);
        }} />
      </header>
      <div class="bars">
        <div class="bar-wrap">
          <Icon name="home" size={24} />
          <Bar value={hud.pBase} max={hud.pMax} />
        </div>
        <div class="bar-wrap enemy">
          <Bar value={hud.eBase} max={hud.eMax} kind="enemy" />
          {hud.warded ? <span class="ward" title="Warded"><Icon name="shield" size={24} /></span> : <Icon name="flag" size={24} />}
        </div>
      </div>
      {hud.warlord && hud.warlord.hp > 0 && (
        <div class="boss-bar" data-testid="boss-bar">
          <Icon name="crown" size={26} />
          <div class="boss-name t-display">{stage.title.toUpperCase()}</div>
          <Bar value={hud.warlord.hp} max={hud.warlord.max} kind="boss" />
        </div>
      )}
      <div class="deck" data-uitop>
        {hud.stormcall.unlocked && <StormRing s={s} />}
        <FoodPanel s={s} food={hud.food} rate={hud.foodRate} />
        <div class="cards">
          {owned.map((slot) => (
            <div key={slot} class="card-slot">
              <DeckCard s={s} slot={slot} queued={hud.queue[slot]} coach={coach && slot === 'melee'} disabled={ended} />
              {coach && !ended && slot === 'melee' && <Coach />}
            </div>
          ))}
        </div>
      </div>
      {sheet.value === 'pause' && <PauseSheet s={s} />}
      {sheet.value === 'retreat' && <RetreatSheet s={s} />}
    </div>
  );
}

function FoodPanel({ s, food, rate }: { s: BattleSession; food: number; rate: number }) {
  const [floats, setFloats] = useState<{ id: number; v: number }[]>([]);
  useEffect(() => {
    let n = 0;
    return s.onEvents((ev) => {
      for (const e of ev) {
        if (e.kind !== 'deployQueued') continue;
        const id = ++n;
        setFloats((f) => [...f.slice(-3), { id, v: e.foodSpent }]);
        setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 800);
      }
    });
  }, [s]);
  const label = food >= 1000 ? `${(food / 1000).toFixed(1)}k` : String(food);
  return (
    <div class="food" data-testid="food">
      <Icon name="food" size={34} />
      <div class="food-num t-display">{label}</div>
      <div class="food-rate">+{rate.toFixed(1)}/s</div>
      {floats.map((f) => (
        <span key={f.id} class="food-float t-display">-{f.v}</span>
      ))}
    </div>
  );
}

function DeckCard({ s, slot, queued, coach, disabled }: { s: BattleSession; slot: Slot; queued: number; coach: boolean; disabled: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  const def = rosterOf(s.state.input.armyAge)[slot];
  const [shake, setShake] = useState(0);
  useEffect(() => {
    let wasReady = false;
    const offFrame = s.onFrame(() => {
      const el = ref.current;
      if (!el) return;
      const f = Math.min(1, s.foodNow() / def.cost);
      el.style.setProperty('--fill', f.toFixed(3));
      const ready = f >= 1;
      if (ready !== wasReady) {
        el.classList.toggle('ready', ready);
        if (ready) {
          el.classList.remove('popready');
          void el.offsetWidth; // restart the one-shot "ready" pop
          el.classList.add('popready');
        }
        wasReady = ready;
      }
    });
    const offEv = s.onEvents((ev) => {
      if (ev.some((e) => e.kind === 'deployRejected' && e.slot === slot && e.reason !== 'food')) setShake((n) => n + 1);
    });
    return () => {
      offFrame();
      offEv();
    };
  }, [s, slot, def.cost]);
  const press = (e: PointerEvent) => {
    e.preventDefault();
    if (disabled) return;
    if (s.foodNow() < def.cost) {
      setShake((n) => n + 1);
      return;
    }
    s.deploy(slot);
    if (slot === 'melee' && s.stage.id === 1) markFtue('deploy1');
  };
  return (
    <button
      ref={ref}
      class={`card ${slot} ${shake ? (shake % 2 ? 'nopeA' : 'nopeB') : ''} ${coach ? 'coached' : ''}`}
      data-testid={`card-${slot}`}
      aria-label={`${def.name}, ${def.cost} Food`}
      onPointerDown={press}
    >
      <span class="card-portrait">
        {portraits.value[def.id] ? <img class="bust" src={portraits.value[def.id]} alt="" draggable={false} /> : <Icon name={ROLE_ICON[slot]} size={54} />}
      </span>
      <span class="card-name">{def.name}</span>
      <span class="card-cost">
        <Icon name="food" size={18} />
        {def.cost}
      </span>
      <span class="card-veil" />
      {queued > 0 && (
        <span class="card-queue">
          {Array.from({ length: queued }, (_, i) => (
            <i key={i} />
          ))}
        </span>
      )}
    </button>
  );
}

function StormRing({ s }: { s: BattleSession }) {
  const hud = s.hud.value;
  const sc = hud.stormcall;
  return (
    <button
      class={`ring storm-ring ${sc.ready ? 'ready' : ''}`}
      style={{ ['--p' as string]: sc.ready ? 1 : sc.charge }}
      data-testid="stormcall"
      aria-label={sc.ready ? 'Stormcall ready' : 'Stormcall charging'}
      onPointerDown={(e) => {
        e.preventDefault();
        if (sc.ready) s.command({ kind: 'stormcall' });
      }}
    >
      <Icon name="storm" size={40} />
    </button>
  );
}

function Coach() {
  return (
    <div class="coach" aria-live="polite">
      <div class="coach-bubble">Tap to send a Clubber!</div>
      <div class="coach-hand">
        <svg viewBox="0 0 48 48" width="56" height="56" aria-hidden="true">
          <path d="M20 44c-6 0-10-5-10-10v-8a3 3 0 0 1 6 0v-14a3.5 3.5 0 0 1 7 0v10a3.5 3.5 0 0 1 7 0v2a3.5 3.5 0 0 1 7 0v2a3.5 3.5 0 0 1 7 0v8c0 6-5 10-11 10z" fill="#F7D0A8" stroke="#1D1830" stroke-width="2.5" stroke-linejoin="round" />
        </svg>
      </div>
    </div>
  );
}

function useBattleToasts(s: BattleSession) {
  useEffect(
    () =>
      s.onEvents((ev) => {
        for (const e of ev) {
          if (e.kind === 'rally') toast('ENEMY RALLY!', 'bad');
          else if (e.kind === 'wardBroken') toast('WARD BROKEN!', 'good');
          else if (e.kind === 'stormRising') toast(e.level === 1 ? 'STORM RISING' : `STORM RISING ${e.level}`, 'storm');
          else if (e.kind === 'warlordIntro') toast(`WARLORD: ${s.stage.title.toUpperCase()}`, 'bad', 2600);
          else if (e.kind === 'stormcallCharged') toast('STORMCALL READY', 'storm', 1400);
        }
      }),
    [s],
  );
}

function PauseSheet({ s }: { s: BattleSession }) {
  const set = save.value.settings;
  const resume = () => {
    sheet.value = null;
    s.paused = false;
  };
  return (
    <Sheet title="PAUSED" onClose={resume} testId="pause-sheet">
      <div class="sheet-col">
        <Button size="l" tone="green" icon="play" label="Resume" onPress={resume} testId="resume" />
        <Toggles set={set} />
        <Button tone="red" icon="flag" label="Retreat" onPress={() => (sheet.value = 'retreat')} testId="retreat" />
      </div>
    </Sheet>
  );
}

function RetreatSheet({ s }: { s: BattleSession }) {
  const gold = s.hud.value.gold;
  return (
    <Sheet title="RETREAT?" onClose={() => (sheet.value = 'pause')} testId="retreat-sheet">
      <div class="sheet-col">
        <p class="sheet-copy">
          You keep <b>{gold} Gold</b> from this battle.
        </p>
        <Button tone="red" icon="flag" label="Retreat" onPress={() => {
          sheet.value = null;
          s.retreat();
        }} testId="retreat-confirm" />
        <Button tone="dark" label="Keep Fighting" onPress={() => (sheet.value = 'pause')} />
      </div>
    </Sheet>
  );
}

export function Toggles({ set }: { set: SaveV1['settings'] }) {
  const canVibrate = typeof navigator !== 'undefined' && 'vibrate' in navigator;
  const rows: { k: keyof typeof set; label: string; icon: IconName }[] = [
    { k: 'sound', label: 'Sound', icon: 'sound' },
    { k: 'music', label: 'Music', icon: 'music' },
    ...(canVibrate ? [{ k: 'haptics' as const, label: 'Haptics', icon: 'vibrate' as const }] : []),
    { k: 'reduceMotion', label: 'Reduce Motion', icon: 'motion' },
    { k: 'damageNumbers', label: 'Damage Numbers', icon: 'numbers' },
  ];
  return (
    <div class="toggles">
      {rows.map((r) => (
        <button key={r.k} class={`toggle ${set[r.k] ? 'on' : ''}`} data-testid={`toggle-${r.k}`} onClick={() => setSetting(r.k, !set[r.k])} aria-pressed={set[r.k]}>
          <Icon name={r.icon} size={26} />
          <span>{r.label}</span>
          <i class="switch" />
        </button>
      ))}
    </div>
  );
}

/** Leaves the battle screen (Results' Home / Next / Upgrade buttons call this after settling). */
export function leaveBattle(to: 'hub' | 'army' | 'ages') {
  sheet.value = null;
  session.value = null;
  go(to);
}
