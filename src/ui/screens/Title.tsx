import { color, motion } from '../style/tokens';

/** Placeholder title for the scaffold; the final animated title arrives with the Stone art slice (BUILD_PLAN 1D/1E). */
export function Title({ onStart }: { onStart: () => void }) {
  return (
    <div
      class="safe"
      onPointerUp={onStart}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 28,
        background: `linear-gradient(180deg, #6EC6F5 0%, #BFE6FA 55%, #FFE6B0 100%)`,
        position: 'fixed',
        inset: 0,
      }}
    >
      <h1 class="display" style={{ margin: 0, fontSize: 52, lineHeight: 1, color: color.paper, textAlign: 'center' }}>
        WE ARE
        <br />
        <span style={{ color: color.gold400, fontSize: 64 }}>STORM</span>
      </h1>
      <div
        class="display"
        style={{
          fontSize: 24,
          color: color.paper,
          animation: `breathe 1.6s ${motion.easeOut} infinite`,
        }}
      >
        TAP TO PLAY
      </div>
      <style>{`@keyframes breathe { 0%,100% { transform: scale(1); opacity: 1 } 50% { transform: scale(1.06); opacity: .85 } }`}</style>
    </div>
  );
}
