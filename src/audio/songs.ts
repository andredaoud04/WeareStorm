import type { AgeId } from '../contracts';
import type { SongDef } from './music';

/**
 * Per-Age music as data (GDD §3.1 music moods). Each song is a 16-step-per-bar pattern sheet; intensity levels add
 * layers: 0 = hub and menus (thin), 1 = battle (drums in), 2 = Storm Rising / Warlord (arp, busier percussion).
 * Ages without a song yet fall back to Stone.
 *
 * Token grammar (16 per bar): `.` rest, `-` tie, note names (`C5`, `F#4`, `Bb3`), chord degrees on chord tracks
 * (`1 3 5 8`, `T` = triad), drum hits (`x` normal, `X` accent, `o` ghost). Suffix `!` accents a note, `?` softens it.
 */

/**
 * Stone Age: "Bouncy marimba and log drums, 112 bpm, major". Sixteen bars in C major (I–V–vi–IV, a cadence at bar 8,
 * a vi–IV–I–V answer, and a V turnaround in bar 16 so the loop has no seam), with a light shuffle on the off-beats.
 */
export const STONE_SONG: SongDef = {
  id: 'stone',
  bpm: 112,
  swing: 0.22,
  bars: 16,
  key: 0,
  scale: [0, 2, 4, 5, 7, 9, 11],
  transpose: 0,
  chords: ['C', 'G', 'Am', 'F', 'C', 'G', 'F', 'C', 'Am', 'F', 'C', 'G', 'C', 'G', 'F', 'G'],
  tracks: [
    {
      id: 'lead',
      inst: 'marimba',
      gain: 0.62,
      levels: [0, 2],
      bars: [
        'E5 . G5 . C6 . G5 . A5 . G5 . E5 . . .',
        'D5 . G5 . B5 . G5 . D5 . . B4 D5 . . .',
        'C5 . E5 . A5 . E5 . C6 . B5 . A5 . E5 .',
        'F5 . A5 . C6 . A5 . G5 . F5 . E5 . D5 .',
        'E5 . G5 . C6 . G5 . E6 . D6 . C6 . . .',
        'B5 . D6 . B5 . G5 . A5 . B5 . D6 . . .',
        'C6 . A5 . F5 . A5 . C6 . D6 . C6 . A5 .',
        'G5 . E5 . C5 . . . G5 . C6 . . . . .',
        'A5 . . A5 . . G5 . E5 . . . C5 . D5 .',
        'F5 . . F5 . . E5 . C5 . . . A4 . C5 .',
        'E5 . . E5 . . G5 . C6 . . . G5 . E5 .',
        'D5 . . D5 . . B4 . G4 . A4 . B4 . D5 .',
        'E5 . G5 . C6 . G5 . A5 . G5 . E5 . . .',
        'D5 . G5 . B5 . G5 . D6 . . B5 D6 . . .',
        'F5 . A5 . C6 . A5 . F6 . E6 . D6 . C6 .',
        'B5 . . . G5 . . . F5 . D5 . B4 C5 D5 .',
      ],
    },
    {
      id: 'bass',
      inst: 'bass',
      gain: 0.55,
      levels: [0, 2],
      chordRoot: 36,
      loop: ['1 . . 1 . . 5 . 1 . . 8 . . 5 .'],
      fills: {
        3: '1 . . 1 . . 5 . 8 . 5 . 3 . 5 .',
        7: '1 . . 1 . . 5 . 8 . 5 . 3 . 5 .',
        11: '1 . . 1 . . 5 . 8 . 5 . 3 . 5 .',
        15: '1 . . 1 . . 5 . 1 . 3 . 5 . 8 .',
      },
    },
    { id: 'shaker8', inst: 'shaker', gain: 0.3, levels: [0, 1], loop: ['o . x . o . x . o . x . o . x .'] },
    { id: 'comp', inst: 'marimba', gain: 0.2, levels: [1, 2], chordRoot: 60, loop: ['. . T . . . T . . . T . . . T .'] },
    {
      id: 'logs',
      inst: 'logDrum',
      gain: 0.42,
      levels: [1, 2],
      loop: ['C4 . . G3 . . C4 . . . G3 . C4 . G3 .', 'C4 . . G3 . . C4 . D4 . C4 . G3 . . .'],
      fills: {
        3: 'C4 . G3 . C4 . G3 . D4 C4 G3 . D4 C4 G3 G3',
        7: 'C4 . G3 . C4 . G3 . D4 C4 G3 . D4 C4 G3 G3',
        11: 'C4 . G3 . C4 . G3 . D4 C4 G3 . D4 C4 G3 G3',
        15: 'C4 C4 G3 . D4 D4 C4 . E4 D4 C4 G3 E4 D4 C4 G3',
      },
    },
    { id: 'kick', inst: 'kick', gain: 0.5, levels: [1, 2], loop: ['X . . . . . . . x . . . . . x .'], fills: { 15: 'X . . . . . . . x . . . x . x x' } },
    { id: 'clap', inst: 'clap', gain: 0.25, levels: [1, 2], loop: ['. . . . x . . . . . . . x . . .'] },
    { id: 'snare', inst: 'snare', gain: 0.18, levels: [2, 2], loop: ['. . . . x . . . . . . . x . . o'] },
    { id: 'shaker16', inst: 'shaker', gain: 0.3, levels: [2, 2], loop: ['o o x o o o x o o o x o o o x o'] },
    { id: 'arp', inst: 'pluck', gain: 0.16, levels: [2, 2], chordRoot: 72, loop: ['1 . 5 . 8 . 5 . 3 . 5 . 8 . 5 .'] },
  ],
};

/** Age → song. Add the other Ages' songs here as data (M2 SYS stream). */
export const SONGS: Partial<Record<AgeId, SongDef>> = { stone: STONE_SONG };

export function songFor(age: AgeId): SongDef {
  return SONGS[age] ?? STONE_SONG;
}
