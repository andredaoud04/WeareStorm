import '@fontsource/lilita-one/400.css';
import '@fontsource/nunito/800.css';
import '@fontsource/nunito/900.css';
import './ui/style/global.css';
import './ui/kit/kit.css';
import './ui/screens/screens.css';
import './ui/kit/motion.css';
import { render } from 'preact';
import { useEffect } from 'preact/hooks';
import { initAudio } from './app/audio';
import { session } from './app/battleController';
import { installDebug, loadScene } from './app/debug';
import { initFtue } from './app/ftue';
import { installMotion } from './app/motion';
import { boot, route, sheet } from './app/store';
import { relayoutWorld, startWorld } from './app/world';
import { CoachLayer } from './ui/kit/coach';
import { Toasts } from './ui/kit/kit';
import { Ages } from './ui/screens/Ages';
import { Army } from './ui/screens/Army';
import { BattleHud } from './ui/screens/BattleHud';
import { Hub, MainTabs } from './ui/screens/Hub';
import { Results } from './ui/screens/Results';
import { SettingsSheet } from './ui/screens/Sheets';
import { StormWipe } from './ui/screens/StormWipe';
import { Title } from './ui/screens/Title';
import { applyCssTokens, uiScale } from './ui/style/tokens';

applyCssTokens(document.documentElement);

function setScale() {
  const root = document.documentElement;
  root.style.setProperty('--u', String(uiScale(innerWidth)));
  // ?insets=top,bottom lets the screenshot matrix exercise notch layouts (Chromium reports 0 safe-area insets)
  const ins = new URLSearchParams(location.search).get('insets');
  if (ins) {
    const [t = 0, b = 0] = ins.split(',').map(Number);
    root.style.setProperty('--safe-top', `${t}px`);
    root.style.setProperty('--safe-bottom', `${b}px`);
  }
}
setScale();
addEventListener('resize', () => {
  setScale();
  relayoutWorld();
});

// Auto-pause when the app is hidden or loses focus (UX §0). An open Retreat confirm stays open.
function autoPause() {
  const s = session.value;
  if (!s || route.value !== 'battle' || s.ended$.value) return;
  s.savePending();
  s.paused = true;
  if (sheet.value !== 'retreat') sheet.value = 'pause';
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) autoPause();
});
addEventListener('blur', autoPause);
// iOS may kill a backgrounded tab without another event: save the battle's Gold on the way out.
addEventListener('pagehide', () => session.value?.savePending());
// iOS Safari only applies :active (the pressed look) when the page has a touch listener.
document.addEventListener('touchstart', () => {}, { passive: true });

boot();
installDebug();
installMotion();
initAudio();
initFtue();

function App() {
  const r = route.value;
  useEffect(() => {
    requestAnimationFrame(() => relayoutWorld());
  }, [r]);
  return (
    <div id="ui">
      {r === 'title' && <Title />}
      {r === 'hub' && <Hub />}
      {r === 'army' && <Army />}
      {r === 'ages' && <Ages />}
      {r === 'battle' && <BattleHud />}
      {r === 'battle' && <Results />}
      {(r === 'hub' || r === 'army' || r === 'ages') && <MainTabs />}
      {sheet.value === 'settings' && <SettingsSheet />}
      <Toasts />
      <CoachLayer />
      <div id="fx" class="fx-layer" aria-hidden="true" />
      <StormWipe />
    </div>
  );
}

render(<App />, document.getElementById('app')!);
void startWorld().then(() => loadScene());
