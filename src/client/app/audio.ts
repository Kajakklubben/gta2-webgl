import { staticAssetUrl } from './assets';
import { sourceAudioMix, type AudioSpatialization } from './audio-spatial';

const files: Record<string, string> = {
  shot: 'Audio/Vocals/Pistolp.wav',
  pickup: 'Audio/Vocals/Health.wav',
  enter: 'Audio/Vocals/CarJacker.wav',
  wasted: 'Audio/Vocals/Wasted.wav',
  explosion: 'Audio/Vocals/Molotovs.wav',
};
const weaponFiles = [
  'Pistolp.wav', 'MacGun.wav', 'FlameT.wav', 'RocketL.wav', 'Molotovs.wav',
  'SilentMG.wav', 'OilSlick.wav', 'VehMacgun.wav', 'Grenades.wav', 'Electro.wav',
  'Shotgun.wav', 'VehMines.wav', 'Electro.wav', 'DualPist.wav',
  'VehBomb.wav', 'RocketL.wav', 'VehMacgun.wav', 'FlameT.wav', 'VehMacgun.wav', 'VehBomb2.wav',
].map(file => `Audio/Vocals/${file}`);

export class AudioBus {
  private readonly sounds = new Map<string, HTMLAudioElement>();
  private readonly last = new Map<string, number>();
  private readonly routes = new Map<string, AudioRoute>();
  private audioContext: AudioContext | null | undefined;
  constructor(private readonly volume = 0.28) {}
  play(event: keyof typeof files, spatialization?: AudioSpatialization) {
    let interval = 180;
    if (event === 'shot') interval = 70;
    this.playFile(event, files[event]!, interval, spatialization);
  }
  playShot(weapon: number, spatialization?: AudioSpatialization) {
    let interval = 85;
    if (weapon === 1 || weapon === 7) interval = 55;
    this.playFile(`shot:${weapon}`, weaponFiles[weapon] ?? files['shot']!, interval, spatialization);
  }
  private playFile(key: string, path: string, interval: number, spatialization?: AudioSpatialization) {
    const mix = spatialization ? sourceAudioMix(spatialization) : undefined;
    if (mix && mix.volume <= 0) return;
    const now = performance.now(), previous = this.last.get(key) ?? -Infinity;
    if (now - previous < interval) return;
    this.last.set(key, now);
    let sound = this.sounds.get(key);
    if (!sound) {
      sound = new Audio(staticAssetUrl(path).toString()); sound.preload = 'auto'; this.sounds.set(key, sound);
    }
    const route = this.ensureRoute(key, sound, spatialization !== undefined);
    if (route) {
      route.gain.gain.value = this.volume * (mix?.volume ?? 1);
      if (route.panner) route.panner.pan.value = mix?.pan ?? 0;
      sound.volume = 1;
      if (this.audioContext?.state === 'suspended') void this.audioContext.resume().catch(() => undefined);
    } else {
      sound.volume = this.volume * (mix?.volume ?? 1);
    }
    sound.currentTime = 0;
    void sound.play().catch(() => undefined);
  }
  private ensureRoute(key: string, sound: HTMLAudioElement, spatial: boolean): AudioRoute | undefined {
    const existing = this.routes.get(key);
    if (existing || !spatial) return existing;
    const context = this.getAudioContext();
    if (!context) return undefined;
    try {
      const source = context.createMediaElementSource(sound);
      const gain = context.createGain();
      const pannerFactory = (context as AudioContext & { createStereoPanner?: () => StereoPannerNode }).createStereoPanner;
      const panner = pannerFactory?.call(context);
      source.connect(gain);
      if (panner) {
        gain.connect(panner);
        panner.connect(context.destination);
      } else {
        gain.connect(context.destination);
      }
      const route = { source, gain, panner };
      this.routes.set(key, route);
      return route;
    } catch {
      // MediaElementSource can be unavailable in restricted/private browser
      // contexts. Keep the HTMLAudioElement path fully functional.
      return undefined;
    }
  }
  private getAudioContext(): AudioContext | undefined {
    if (this.audioContext !== undefined) return this.audioContext ?? undefined;
    const runtime = globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext };
    const constructor = typeof AudioContext === 'function' ? AudioContext : runtime.webkitAudioContext;
    if (!constructor) {
      this.audioContext = null;
      return undefined;
    }
    try {
      this.audioContext = new constructor();
    } catch {
      this.audioContext = null;
    }
    return this.audioContext ?? undefined;
  }
  dispose() {
    for (const sound of this.sounds.values()) { sound.pause(); sound.src = ''; }
    for (const route of this.routes.values()) {
      route.source.disconnect(); route.gain.disconnect(); route.panner?.disconnect();
    }
    this.routes.clear(); this.sounds.clear();
    if (this.audioContext) void this.audioContext.close().catch(() => undefined);
    this.audioContext = null;
  }
}

interface AudioRoute {
  readonly source: MediaElementAudioSourceNode;
  readonly gain: GainNode;
  readonly panner?: StereoPannerNode;
}

export { SOURCE_AUDIO_PAN_HALF_WIDTH, SOURCE_EVENT_AUDIO_MAX_DISTANCE, SOURCE_WEAPON_AUDIO_MAX_DISTANCE } from './audio-spatial';
