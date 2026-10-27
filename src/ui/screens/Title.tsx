import { startBattle } from '../../app/battleController';
import { go, save } from '../../app/store';
import { Nimbus } from '../kit/coach';
import { Icon } from '../kit/icons';

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
        <span class="logo-nimbus" aria-hidden="true">
          <Nimbus size={74} />
        </span>
        <div class="logo-we t-display">WE ARE</div>
        <div class="logo-storm t-display">
          ST
          <span class="logo-bolt">
            <Icon name="bolt" size={74} />
          </span>
          RM
        </div>
      </div>
      <div class="tap t-display">TAP TO PLAY</div>
    </div>
  );
}
