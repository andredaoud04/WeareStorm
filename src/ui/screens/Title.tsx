import { startBattle } from '../../app/battleController';
import { go, save } from '../../app/store';
import { logoUrl } from '../skin';

/** Title (UX §1). A brand-new player taps straight into Battle 1: no menus before the first fight (GDD FTUE). */
export function Title() {
  const start = () => {
    if (save.value.stats.battles === 0) {
      startBattle(1);
      go('battle');
    } else go('hub');
  };
  return (
    <div class="title-screen" onClick={start} data-testid="title">
      <div class="title-veil" />
      <div class="logo">
        <img class="logo-mark" src={logoUrl(save.value.armyAge)} alt="Stormglass" draggable={false} />
      </div>
      <div class="tap t-display">TAP TO PLAY</div>
    </div>
  );
}
