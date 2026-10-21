import { staticAssetUrl } from './assets';

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
  constructor(private readonly volume = 0.28) {}
  play(event: keyof typeof files) {
    let interval = 180;
    if (event === 'shot') interval = 70;
    this.playFile(event, files[event]!, interval);
  }
  playShot(weapon: number) {
    let interval = 85;
    if (weapon === 1 || weapon === 7) interval = 55;
    this.playFile(`shot:${weapon}`, weaponFiles[weapon] ?? files['shot']!, interval);
  }
  private playFile(key: string, path: string, interval: number) {
    const now = performance.now(), previous = this.last.get(key) ?? -Infinity;
    if (now - previous < interval) return;
    this.last.set(key, now);
    let sound = this.sounds.get(key);
    if (!sound) {
      sound = new Audio(staticAssetUrl(path).toString()); sound.preload = 'auto'; sound.volume = this.volume; this.sounds.set(key, sound);
    }
    sound.currentTime = 0;
    void sound.play().catch(() => undefined);
  }
  dispose() { for (const sound of this.sounds.values()) { sound.pause(); sound.src = ''; } this.sounds.clear(); }
}
