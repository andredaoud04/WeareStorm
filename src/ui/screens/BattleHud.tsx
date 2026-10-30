import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Slot } from '../../contracts';
import { uiSound } from '../../app/audio';
import { SPEED_UNLOCK_STAGE, session, type BattleSession } from '../../app/battleController';
import { CoinBatcher } from '../../app/coinBatch';
import { reduceMotion } from '../../app/motion';
import { go, markFtue, save, setSetting, sheet, toast } from '../../app/store';
import { worldToScreen } from '../../app/world';
import { QUEUE_CAP } from '../../data/economy';
import { rosterOf, unitDef } from '../../data/units';
import type { SaveV1 } from '../../meta/save';
import { BANNER_MS, Banner, type BannerSpec } from '../kit/coach';
import { centerOf, flyCoin, replayClass } from '../kit/fx';
import { Icon, Portrait, type IconName } from '../kit/icons';
import { Bar, Button, Pill, Sheet } from '../kit/kit';
import { displayName, portraitUrl, stageTitle } from '../skin';

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
  const banner = useBanners(s);
  const pill = useRef<HTMLDivElement>(null);
  const coins = useCoinFlights(s, pill);
  const canSpeed = stage.id >= SPEED_UNLOCK_STAGE;
  return (
    <div class="screen battle" data-testid="battle-hud">
      <header class="topbar">
        <Button size="s" tone="dark" icon="pause" iconOnly ariaLabel="Pause" testId="pause" onPress={() => {
          if (ended) return;
          s.paused = true;
          sheet.value = 'pause';
        }} />
        <div class="pill-anchor" ref={pill}>
          {/* Gold counts when its coin lands (coinPop), so the pill never runs ahead of the coins in the air */}
          <Pill icon="coin" value={s.state.goldEarned - coins.inFlight} testId="battle-gold" />
        </div>
        <div class="stage-chip t-display" data-testid="stage-chip">
          {stage.warlord && <Icon name="crown" size={22} />}
          BATTLE {stage.id}
        </div>
        {canSpeed ? (
          <Button size="s" tone={speed > 1 ? 'gold' : 'dark'} icon="speed" iconOnly ariaLabel={speed > 1 ? 'Speed ×2' : 'Speed ×1'} testId="speed" highlight={!st.ftue['speedUsed']} onPress={() => {
            s.speed = s.speed > 1 ? 1 : 2;
            setSpeed(s.speed);
            setSetting('fast', s.speed > 1);
            markFtue('speedUsed');
          }} />
        ) : (
          <span class="speed-slot" aria-hidden="true" />
        )}
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
          <div class="boss-name t-display">{stageTitle(stage).toUpperCase()}</div>
          <Bar value={hud.warlord.hp} max={hud.warlord.max} kind="boss" />
        </div>
      )}
      <div class="deck" data-uitop>
        {hud.stormcall.unlocked && <StormRing s={s} />}
        <FoodPanel s={s} food={hud.food} rate={hud.foodRate} />
        <div class="cards">
          {owned.map((slot) => (
            <div key={slot} class="card-slot">
              <DeckCard s={s} slot={slot} queued={hud.queue[slot]} full={hud.full} busy={hud.queue.melee + hud.queue.ranged + hud.queue.tank >= QUEUE_CAP} disabled={ended} />
            </div>
          ))}
        </div>
      </div>
      {banner && <Banner key={banner.id} b={banner} />}
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

function DeckCard({ s, slot, queued, full, busy, disabled }: { s: BattleSession; slot: Slot; queued: number; full: boolean; busy: boolean; disabled: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  const def = rosterOf(s.state.input.armyAge)[slot];
  const [shake, setShake] = useState(0);
  useEffect(() => {
    let wasReady = false;
    const offFrame = s.onFrame(() => {
      const el = ref.current;
      if (!el) return;
      // READY and the press check use the sim's exact Food, so a card that says READY is always accepted; the fill
      // is interpolated for smoothness but holds just short of full until the sim agrees.
      const ready = s.state.food >= def.cost * 1000;
      const f = ready ? 1 : Math.min(0.97, s.foodNow() / def.cost);
      el.style.setProperty('--fill', f.toFixed(3));
      el.classList.toggle('ready', ready); // every frame: a re-render that rewrites `class` must not drop it
      if (ready !== wasReady) {
        if (ready) {
          el.classList.remove('popready');
          void el.offsetWidth; // restart the one-shot "ready" pop
          el.classList.add('popready');
        }
        wasReady = ready;
      }
    });
    const offEv = s.onEvents((ev) => {
      if (ev.some((e) => e.kind === 'deployRejected' && e.slot === slot)) setShake((n) => n + 1);
    });
    return () => {
      offFrame();
      offEv();
    };
  }, [s, slot, def.cost]);
  const press = (e: PointerEvent) => {
    e.preventDefault();
    if (disabled) return;
    if (s.state.food < def.cost * 1000 || full || busy) {
      setShake((n) => n + 1);
      return;
    }
    s.deploy(slot);
    replayClass(ref.current, 'deploypop'); // squash → spring (ART_BIBLE §5.14 Deploy)
  };
  return (
    <button
      ref={ref}
      class={`card ${slot} ${full ? 'full' : ''} ${busy ? 'busy' : ''} ${shake ? (shake % 2 ? 'nopeA' : 'nopeB') : ''}`}
      data-testid={`card-${slot}`}
      aria-label={`${displayName(def.id)}, ${def.cost} Food`}
      onPointerDown={press}
    >
      <span class="card-portrait">
        <Portrait src={portraitUrl(def.age, slot)} fallback={ROLE_ICON[slot]} />
      </span>
      <span class={`card-name ${displayName(def.id).length > 11 ? 'long' : ''}`}>{displayName(def.id)}</span>
      {full ? (
        <span class="card-cost max t-display">MAX</span>
      ) : (
        <span class="card-cost">
          <Icon name="food" size={18} />
          {def.cost}
        </span>
      )}
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
  const [nope, setNope] = useState(0);
  useEffect(() => s.onEvents((ev) => {
    if (ev.some((e) => e.kind === 'stormcallNoTarget')) setNope((n) => n + 1);
  }), [s]);
  return (
    <button
      class={`ring storm-ring ${sc.ready ? 'ready' : ''} ${nope ? (nope % 2 ? 'nopeA' : 'nopeB') : ''}`}
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

function useBattleToasts(s: BattleSession) {
  useEffect(
    () =>
      s.onEvents((ev) => {
        for (const e of ev) {
          if (e.kind === 'rally') toast('ENEMY RALLY!', 'bad');
          else if (e.kind === 'wardBroken') toast('WARD BROKEN!', 'good');
          else if (e.kind === 'stormRising') toast(e.level === 1 ? 'STORM RISING' : `STORM RISING ${e.level}`, 'storm');
          else if (e.kind === 'stormcallCharged') toast('STORMCALL READY', 'storm', 1400);
        }
      }),
    [s],
  );
}

/**
 * Momentary banners (≤ 1.2 s, click-through, over the sky): the stage intro when the battle starts — "WARLORD!" on boss
 * stages — and the Warlord's entrance (GDD §1.5 "CHIEF GRUMBO APPROACHES!").
 */
function useBanners(s: BattleSession): BannerSpec | null {
  const [b, setB] = useState<BannerSpec | null>(null);
  useEffect(() => {
    let seq = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const show = (spec: Omit<BannerSpec, 'id'>, delay = 0) => {
      timers.push(
        setTimeout(() => {
          const id = ++seq;
          setB({ ...spec, id });
          uiSound('sheetOpen', { gain: 0.5 });
          timers.push(setTimeout(() => setB((cur) => (cur?.id === id ? null : cur)), BANNER_MS + 40));
        }, delay),
      );
    };
    const st = s.stage;
    // only for a battle that is just starting (debug fixtures fast-forward past it)
    if (s.state.tick < 4) {
      show(st.warlord ? { title: 'WARLORD!', sub: `Battle ${st.id} · ${stageTitle(st)}`, tone: 'red', icon: 'crown' } : { title: `BATTLE ${st.id}`, sub: stageTitle(st), tone: 'blue' }, 280);
    }
    const off = s.onEvents((ev) => {
      if (ev.some((e) => e.kind === 'warlordIntro')) show({ title: stageTitle(st).toUpperCase(), sub: 'APPROACHES!', tone: 'red', icon: 'crown' });
    });
    return () => {
      off();
      timers.forEach(clearTimeout);
    };
  }, [s]);
  return b;
}

/**
 * Battle Gold flies from where it was earned to the Gold pill (ART_BIBLE §5.11 coinPop), batched so a busy fight keeps
 * at most 12 coins in the air. The pill shows the Gold that has landed; Reduce Motion skips the flights.
 */
function useCoinFlights(s: BattleSession, pill: { current: HTMLDivElement | null }): CoinBatcher {
  const batch = useMemo(() => new CoinBatcher(12), [s]);
  const [, landed] = useState(0);
  useEffect(
    () =>
      s.onEvents((ev) => {
        if (reduceMotion()) return;
        for (const e of ev) {
          let value = 0;
          let x = 0;
          let h = 0;
          if (e.kind === 'death' && e.gold > 0) [value, x, h] = [e.gold, e.x, unitDef(e.def).role === 'warlord' ? 420 : 170];
          else if (e.kind === 'baseChunk' && e.gold > 0) {
            const w = e.source === 'warlord' ? s.curr.units.find((u) => u.role === 'warlord') : undefined;
            [value, x, h] = [e.gold, w ? w.x : 1060, w ? 300 : 250];
          }
          if (!value) continue;
          const from = worldToScreen(x, h);
          const f = batch.add(value, from.x, from.y, performance.now());
          if (!f) continue;
          const to = centerOf(pill.current?.querySelector('.icon')) ?? { x: 60, y: 30 };
          flyCoin(from, to, {
            style: 'pop',
            onLand: () => {
              if (batch.land(f.id)) {
                landed((n) => n + 1);
                uiSound('coinTick', { param: 0.7, gain: 0.6 });
              }
            },
          });
        }
      }),
    [s, batch],
  );
  return batch;
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
        <p class="sheet-copy" data-testid="pause-stage">
          Battle {s.stage.id} · <b>{stageTitle(s.stage)}</b>
        </p>
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
