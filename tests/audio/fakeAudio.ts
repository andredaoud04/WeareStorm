/**
 * A minimal fake of the Web Audio graph for Node tests. It records what gets created and validates arguments the way
 * the real API does (non-finite values, exponential ramps to zero, double start), so voice bugs fail here instead
 * of throwing in a player's browser.
 */

function finite(name: string, ...v: number[]) {
  for (const x of v) if (!Number.isFinite(x)) throw new TypeError(`${name}: non-finite value ${x}`);
}

export class FakeParam {
  value: number;
  events: { type: string; v: number; t: number }[] = [];
  constructor(v = 0) {
    this.value = v;
  }
  setValueAtTime(v: number, t: number) {
    finite('setValueAtTime', v, t);
    this.events.push({ type: 'set', v, t });
    this.value = v;
    return this;
  }
  linearRampToValueAtTime(v: number, t: number) {
    finite('linearRamp', v, t);
    this.events.push({ type: 'lin', v, t });
    this.value = v;
    return this;
  }
  exponentialRampToValueAtTime(v: number, t: number) {
    finite('expRamp', v, t);
    if (v <= 0) throw new RangeError(`exponentialRampToValueAtTime: ${v} must be positive`);
    this.events.push({ type: 'exp', v, t });
    this.value = v;
    return this;
  }
  setTargetAtTime(v: number, t: number, c: number) {
    finite('setTarget', v, t, c);
    if (c < 0) throw new RangeError('timeConstant must be >= 0');
    this.events.push({ type: 'target', v, t });
    this.value = v;
    return this;
  }
  cancelScheduledValues(t: number) {
    finite('cancel', t);
    return this;
  }
}

export class FakeNode {
  inputs = 0;
  outputs: FakeNode[] = [];
  connect(n: FakeNode | FakeParam) {
    if (n instanceof FakeNode) {
      n.inputs++;
      this.outputs.push(n);
    }
    return n;
  }
  disconnect() {
    this.outputs = [];
  }
}

class FakeSource extends FakeNode {
  started: number | null = null;
  stopped: number | null = null;
  onended: (() => void) | null = null;
  start(t = 0) {
    finite('start', t);
    if (this.started !== null) throw new Error('InvalidStateError: start() called twice');
    this.started = t;
  }
  stop(t = 0) {
    finite('stop', t);
    if (this.started === null) throw new Error('InvalidStateError: stop() before start()');
    this.stopped = t;
  }
}

class FakeOsc extends FakeSource {
  type = 'sine';
  frequency = new FakeParam(440);
  detune = new FakeParam(0);
}
class FakeBufferSource extends FakeSource {
  buffer: unknown = null;
  loop = false;
  playbackRate = new FakeParam(1);
}
class FakeGain extends FakeNode {
  gain = new FakeParam(1);
}
class FakeBiquad extends FakeNode {
  type = 'lowpass';
  frequency = new FakeParam(350);
  Q = new FakeParam(1);
  gain = new FakeParam(0);
  detune = new FakeParam(0);
}
class FakePanner extends FakeNode {
  pan = new FakeParam(0);
}
class FakeComp extends FakeNode {
  threshold = new FakeParam(-24);
  knee = new FakeParam(30);
  ratio = new FakeParam(12);
  attack = new FakeParam(0.003);
  release = new FakeParam(0.25);
  reduction = 0;
}
class FakeShaper extends FakeNode {
  curve: Float32Array | null = null;
  oversample = 'none';
}
class FakeAnalyser extends FakeNode {
  fftSize = 2048;
  getFloatTimeDomainData(b: Float32Array) {
    b.fill(0);
  }
}

export class FakeAudioContext {
  currentTime = 0;
  sampleRate = 48000;
  state: 'running' | 'suspended' | 'closed' = 'running';
  destination = new FakeNode();
  created: Record<string, number> = {};
  sources: FakeSource[] = [];
  resumes = 0;

  private count(k: string) {
    this.created[k] = (this.created[k] ?? 0) + 1;
  }
  total(): number {
    return Object.values(this.created).reduce((a, b) => a + b, 0);
  }
  createOscillator() {
    this.count('oscillator');
    const o = new FakeOsc();
    this.sources.push(o);
    return o;
  }
  createBufferSource() {
    this.count('bufferSource');
    const o = new FakeBufferSource();
    this.sources.push(o);
    return o;
  }
  createGain() {
    this.count('gain');
    return new FakeGain();
  }
  createBiquadFilter() {
    this.count('biquad');
    return new FakeBiquad();
  }
  createStereoPanner() {
    this.count('panner');
    return new FakePanner();
  }
  createDynamicsCompressor() {
    this.count('compressor');
    return new FakeComp();
  }
  createWaveShaper() {
    this.count('waveShaper');
    return new FakeShaper();
  }
  createAnalyser() {
    this.count('analyser');
    return new FakeAnalyser();
  }
  createBuffer(channels: number, length: number, sampleRate: number) {
    this.count('buffer');
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { length, sampleRate, numberOfChannels: channels, duration: length / sampleRate, getChannelData: (c: number) => data[c]! };
  }
  resume() {
    this.resumes++;
    this.state = 'running';
    return Promise.resolve();
  }
  suspend() {
    this.state = 'suspended';
    return Promise.resolve();
  }
}

/** The fake, typed as the real thing for code under test. */
export function fakeCtx(): { fake: FakeAudioContext; ctx: BaseAudioContext } {
  const fake = new FakeAudioContext();
  return { fake, ctx: fake as unknown as BaseAudioContext };
}
