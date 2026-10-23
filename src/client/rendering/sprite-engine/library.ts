import type { PedSpriteSet, Style } from '../../../shared/engine/loader/style-parser';
import type { Pixels } from '../../../shared/engine/assets/pixels';
import { SCR_PICKUP_SPRITE_MODELS } from '../../../shared/engine/loader/scr';
import { WEAPONS } from '../../../shared/domain/combat/weapons';
import { cars, effects, weapons } from '../sprite';
import { spriteFrameBlend } from './frame-interpolation';

type SpriteCategory = 'player' | 'cars' | 'weapons' | 'objects' | 'code';
interface SpriteVariant { title: string; frames: Pixels[] }
interface SpriteEntry {
  title: string;
  usage: string;
  category: SpriteCategory;
  frames: Pixels[];
  frameMs: number;
  variants?: SpriteVariant[] | undefined;
}

type CodeAnimationRange = { title: string; usage: string; category: SpriteCategory; start: number; count: number; frames?: readonly number[]; frameMs: number };
const carFireSmall = effects.sequence('car-fire-small');
const carFireLarge = effects.sequence('car-fire-large');
const carFireWreck = effects.sequence('car-fire-wreck');
const bloodBurst = effects.sequence('blood-burst');
const impactBurst = effects.sequence('impact-burst');
const waterSplash = effects.sequence('water-splash');
const electricArc = effects.sequence('electric-arc');

const codeAnimationRanges: CodeAnimationRange[] = [
  { title: 'Pistol projectile', usage: 'Source model 265 emitted by pistol and dual-pistol fire', category: 'weapons', ...weapons.WEAPON_PROJECTILE_RANGES[0]!, frameMs: 55 },
  { title: 'Machine-gun projectile', usage: 'Source model 254 emitted by SMG, silenced gun, and car SMG', category: 'weapons', ...weapons.WEAPON_PROJECTILE_RANGES[1]!, frameMs: 55 },
  { title: 'Flamethrower fire', usage: 'Flamethrower stream and flame segments', category: 'weapons', ...weapons.CODE_OBJECT_RANGES[weapons.CODE_OBJECT_MODELS.FlamethrowerFire]!, frameMs: 55 },
  { title: 'Rocket projectile', usage: 'Rocket launcher flight sprite (code object model 128)', category: 'weapons', ...weapons.CODE_OBJECT_RANGES[weapons.CODE_OBJECT_MODELS.RocketBullet]!, frameMs: 90 },
  { title: 'Molotov projectile', usage: 'Thrown molotov bottle animation (code object model 138)', category: 'weapons', ...weapons.CODE_OBJECT_RANGES[weapons.CODE_OBJECT_MODELS.MovingMolotov]!, frameMs: 90 },
  { title: 'Grenade projectile', usage: 'Thrown grenade animation (code object model 183)', category: 'weapons', ...weapons.CODE_OBJECT_RANGES[weapons.CODE_OBJECT_MODELS.Grenade]!, frameMs: 90 },
  { title: 'Shotgun projectile', usage: 'Source model 192 / shared 259 code-object frame', category: 'weapons', ...weapons.WEAPON_PROJECTILE_RANGES[10]!, frameMs: 55 },
  { title: 'Electro baton projectile', usage: 'Source model 277 emitted by electro-shock', category: 'weapons', ...weapons.WEAPON_PROJECTILE_RANGES[12]!, frameMs: 60 },
  { title: 'Oil slick', usage: `Vehicle oil slick pickup/sprite model 216; deployed source object model ${weapons.SOURCE_OBJECT_MODELS.oilSlick}`, category: 'weapons', ...weapons.CODE_OBJECT_RANGES[weapons.CODE_OBJECT_MODELS.OilSlick]!, frameMs: 90 },
  { title: 'Land mine', usage: `Vehicle land-mine pickup/sprite model 217; deployed source object model ${weapons.SOURCE_OBJECT_MODELS.carMine}`, category: 'weapons', ...weapons.CODE_OBJECT_RANGES[weapons.CODE_OBJECT_MODELS.LandMine]!, frameMs: 90 },
  { title: 'Car fire · small', usage: 'Car_BC source object car_fire_level1_12 at the 16000 damage threshold', category: 'weapons', ...carFireSmall, frameMs: 140 },
  { title: 'Car fire · large', usage: 'Car_BC source object car_fire_level2_13 at the 25000 damage threshold', category: 'weapons', ...carFireLarge, frameMs: 140 },
  { title: 'Car fire · burned-out wreck', usage: 'Car_BC source object car_fire_4 attached after the 50-tick wreck countdown', category: 'weapons', ...carFireWreck, frameMs: 140 },
  { title: 'Blood burst', usage: 'Particle_8::EmitBloodBurst: six state-1 particles from def112+16', category: 'code', ...bloodBurst, frameMs: 55 },
  { title: 'Impact burst', usage: 'Particle_8::EmitImpactParticles: six state-7 particles from def112+127', category: 'code', ...impactBurst, frameMs: 55 },
  { title: 'Water splash', usage: 'Particle_8::EmitWaterSplash: six state-35 particles from def112+132', category: 'code', ...waterSplash, frameMs: 55 },
  { title: 'Electric arc particles', usage: 'Particle_8::EmitElectricArcParticle: short state-37 sprites from def112+175', category: 'code', ...electricArc, frameMs: 55 },
  { title: 'Explosion', usage: 'Grenade, molotov, rocket, mine, and scripted explosion frames', category: 'weapons', ...effects.EXPLOSION_RANGES.small, frameMs: 42 },
];

function framesFromCode(style: Style, start: number, count: number, frameIds?: readonly number[]) {
  const ids = frameIds ?? Array.from({ length: count }, (_, index) => start + index);
  return ids.map(id => style.sprites.codeObjects[id]?.[0]).filter((frame): frame is Pixels => !!frame);
}

export class SpriteLibrary {
  private readonly category = document.querySelector<HTMLSelectElement>('#sprite-category')!;
  private readonly search = document.querySelector<HTMLInputElement>('#sprite-search')!;
  private readonly entrySelect = document.querySelector<HTMLSelectElement>('#sprite-entry')!;
  private readonly previous = document.querySelector<HTMLButtonElement>('#sprite-prev')!;
  private readonly next = document.querySelector<HTMLButtonElement>('#sprite-next')!;
  private readonly position = document.querySelector<HTMLSpanElement>('#sprite-position')!;
  private readonly variants = document.querySelector<HTMLElement>('#sprite-variants')!;
  private readonly interpolate = document.querySelector<HTMLInputElement>('#sprite-interpolate')!;
  private readonly preview = document.querySelector<HTMLCanvasElement>('#sprite-preview')!;
  private readonly interpolatedPreview = document.querySelector<HTMLCanvasElement>('#sprite-preview-interpolated')!;
  private readonly interpolatedContext = this.interpolatedPreview.getContext('2d')!;
  private readonly blendState = document.querySelector<HTMLOutputElement>('#sprite-blend-state')!;
  private readonly title = document.querySelector<HTMLElement>('#sprite-title')!;
  private readonly usage = document.querySelector<HTMLElement>('#sprite-usage')!;
  private readonly context = this.preview.getContext('2d')!;
  private readonly entries: SpriteEntry[];
  private visible: number[] = [];
  private selected = 0;
  private variantEntry = -1;
  private variantIndex = 0;
  private request = 0;
  private readonly imageData = new Map<Pixels, ImageData>();
  private readonly sourceCanvases = new Map<Pixels, HTMLCanvasElement>();

  constructor(style: Style, carNames: ReadonlyMap<number, string> = new Map()) {
    this.entries = this.buildEntries(style, carNames);
    this.category.onchange = () => this.refreshList();
    this.search.oninput = () => this.refreshList();
    this.entrySelect.onchange = () => { this.selected = Math.max(0, this.entrySelect.selectedIndex); this.showSelected(); };
    this.previous.onclick = () => this.move(-1);
    this.next.onclick = () => this.move(1);
    addEventListener('keydown', this.keydown, true);
    this.refreshList();
    this.request = requestAnimationFrame(this.paint);
  }

  private buildEntries(style: Style, carNames: ReadonlyMap<number, string>) {
    const entries: SpriteEntry[] = [];
    const add = (title: string, usage: string, category: SpriteCategory, frames: Pixels[], frameMs = 100, variants?: SpriteVariant[]) => {
      if (frames.length) entries.push({ title, usage, category, frames, frameMs, variants });
    };
    const player = style.sprites.player;
    add('Player · unarmed walking', 'Char_B4 state 0: eight-frame unarmed walking loop', 'player', player.walking, 100);
    add('Player · unarmed running', 'Char_B4 state 1: eight-frame unarmed running loop', 'player', player.running, 67);
    add('Player · idle', 'Char_B4 state 2: four-frame standing loop', 'player', player.idleFrames, 300);
    add('Player · armed running', 'Char_B4 state 1: eight-frame armed running loop', 'player', player.armedRunning, 67);
    add('Player · armed walking', 'Eight-frame movement animation while holding a weapon', 'player', player.armedWalking, 100);
    add('Player · firing pose', 'Authored character pose used while firing firearms', 'player', player.firing, 160);
    add('Player · throwing', 'Eight-frame moving grenade and molotov throw animation', 'player', player.throwing, 100);
    add('Player · throwing idle', 'Eight-frame stationary grenade and molotov throw animation', 'player', player.throwingIdle, 100);
    add('Player · jumping', 'Char_B4 state 5: takeoff, airborne, and landing sequence', 'player', player.jumping, 100);
    add('Player · entering car', 'Char_B4 state 6: ped walks through the selected door', 'player', player.entering, 100);
    add('Player · exiting car', 'Char_B4 state 7: reverse door sequence and return to walking', 'player', player.exiting, 100);
    add('Player · pulled from car', 'Char_B4 state 8: pulled-out door pose', 'player', player.pulledOut, 1000);
    add('Player · falling', 'Char_B4 states 11/12: normal and lethal fall sequence', 'player', player.falling, 67);
    add('Player · dead', 'Char_B4 state 10/13/14: terminal dead pose', 'player', player.dead, 1000);
    add('Player · lying', 'Char_B4 state 15: lying down sequence', 'player', player.lying, 133);
    add('Player · lying reverse', 'Char_B4 state 16: reverse lying sequence', 'player', player.lyingReverse, 133);
    add('Player · electrocuted', 'Char_B4 state 17: five-frame electrocuted sequence', 'player', player.electrocuted, 133);
    const addPedSet = (name: string, ped: PedSpriteSet) => {
      add(`${name} · walking`, 'Char_B4 state 0 unarmed walking sequence', 'player', ped.walking, 100);
      add(`${name} · running`, 'Char_B4 state 1 unarmed running sequence', 'player', ped.running, 67);
      add(`${name} · armed walking`, 'Char_B4 state 0 armed walking sequence', 'player', ped.armedWalking, 100);
      add(`${name} · armed running`, 'Char_B4 state 1 armed running sequence', 'player', ped.armedRunning, 67);
      add(`${name} · firing`, 'Char_B4 state 3 firing pose', 'player', ped.firing, 1000);
      add(`${name} · falling`, 'Char_B4 state 11/12 fall sequence', 'player', ped.falling, 67);
    };
    addPedSet('Civilian', style.sprites.civilian);
    addPedSet('Police', style.sprites.cop);

    for (const [model, frames] of Object.entries(style.sprites.cars)) {
      const damage = style.sprites.carDamage[Number(model)] ?? [];
      const paints = style.sprites.carPaints[Number(model)] ?? frames;
      const baseFrame = paints[0] ?? frames[0];
      const variants: SpriteVariant[] = [];
      if (baseFrame) variants.push({ title: 'Base sprite', frames: [baseFrame] });
      for (let index = 1; index < paints.length; index++) {
        const paintFrame = paints[index];
        if (paintFrame) variants.push({ title: `Paint/remap ${index + 1}`, frames: [paintFrame] });
      }
      for (const [index, frame] of damage.entries()) variants.push({ title: cars.CAR_DAMAGE_SLOT_NAMES[index] ?? `DELX state ${index}`, frames: [frame] });
      // The chassis itself uses the authored DELX dent frame through all
      // three live damage phases. Fire and explosion are attached code-object
      // effects, while the final phase swaps to CARI.wreck; expose those
      // source states as explicit library buttons so the loaded art can be
      // audited without starting a match.
      if (damage[0]) {
        variants.push({ title: 'Lifecycle · dented', frames: [damage[0]] });
        variants.push({ title: 'Lifecycle · burning', frames: [damage[0]] });
        variants.push({ title: 'Lifecycle · exploding', frames: [damage[0]] });
      }
      const carInfo = style.cars.find(car => car.model === Number(model));
      const wreckGraphic = carInfo?.wreck;
      let wreckModel: number | undefined;
      if (typeof wreckGraphic === 'number' && cars.hasWreckModel(wreckGraphic)) wreckModel = cars.resolveWreckModel(wreckGraphic);
      let wreckFrames: Pixels[] = [];
      if (wreckModel !== undefined) wreckFrames = style.sprites.cars[wreckModel] ?? [];
      if (wreckFrames?.[0]) variants.push({ title: 'Lifecycle · burned-out wreck', frames: [wreckFrames[0]] });
      const animationRanges: [string, number, number][] = [
        ['Right front door animation', 7, 11],
        ['Right rear door / FBI light animation', 11, 15],
        ['Left front door animation', 24, 28],
        ['Left rear door animation', 28, 32],
      ];
      for (const [title, start, end] of animationRanges) {
        const animation = damage.slice(start, end);
        if (animation.length > 1) variants.push({ title, frames: animation });
      }
      const hasVariants = paints.length > 1 || damage.length > 0;
      const name = carNames.get(Number(model));
      let label = `model ${model}`;
      if (name) label = `${name} (model ${model})`;
      let usage = 'Authored car sprite rotated to follow traffic direction';
      let entryVariants: SpriteVariant[] | undefined;
      if (hasVariants) {
        usage = `Authored ${name ?? `model ${model}`} sprite with paint remaps and decoded DELX/DELS rendering states`;
        entryVariants = variants;
      }
      add(`Traffic car · ${label}`, usage, 'cars', frames, 130, entryVariants);
    }
    for (const [model, frames] of Object.entries(style.sprites.objects)) add(`Map object · model ${model}`, 'Decorative level object loaded from the map-object sprite bank', 'objects', frames, 140);

    const usedCodeSprites = new Set<number>();
    for (const range of codeAnimationRanges) {
      const ids = range.frames ?? Array.from({ length: range.count }, (_, index) => range.start + index);
      const frames = framesFromCode(style, range.start, range.count, range.frames);
      for (const id of ids) if (style.sprites.codeObjects[id]) usedCodeSprites.add(id);
      add(range.title, range.usage, range.category, frames, range.frameMs);
    }
    for (const [weapon, start] of SCR_PICKUP_SPRITE_MODELS) {
      const frames = framesFromCode(style, start, 8);
      for (let index = 0; index < 8; index++) if (style.sprites.codeObjects[start + index]) usedCodeSprites.add(start + index);
      add(`Pickup · ${WEAPONS[weapon]?.name ?? `weapon ${weapon}`}`, `SCR COLLECT pickup used to acquire ${WEAPONS[weapon]?.name ?? 'this weapon'}`, 'weapons', frames, 120);
    }
    for (const id of Object.keys(style.sprites.codeObjects).map(Number).sort((a, b) => a - b)) {
      if (usedCodeSprites.has(id)) continue;
      const frame = style.sprites.codeObjects[id]?.[0];
      if (frame) add(`Code object · ${id}`, 'Decoded STY code-object sprite with no mapped gameplay animation', 'code', [frame], 1000);
    }
    return entries;
  }

  private refreshList() {
    const category = this.category.value as SpriteCategory | 'all';
    const query = this.search.value.trim().toLowerCase();
    this.visible = this.entries.map((entry, index) => ({ entry, index })).filter(({ entry }) =>
      (category === 'all' || entry.category === category) && (!query || `${entry.title} ${entry.usage} ${entry.variants?.map((variant) => variant.title).join(' ') ?? ''}`.toLowerCase().includes(query)),
    ).map(({ index }) => index);
    this.selected = Math.min(this.selected, Math.max(0, this.visible.length - 1));
    this.entrySelect.replaceChildren(...this.visible.map(index => new Option(this.entries[index]!.title, String(index))));
    this.entrySelect.disabled = !this.visible.length;
    this.previous.disabled = !this.visible.length;
    this.next.disabled = !this.visible.length;
    this.showSelected();
  }

  private move(delta: number) {
    if (!this.visible.length) return;
    this.selected = (this.selected + delta + this.visible.length) % this.visible.length;
    this.showSelected();
  }

  private showSelected() {
    const entryIndex = this.visible[this.selected];
    let entry: SpriteEntry | undefined;
    if (entryIndex !== undefined) entry = this.entries[entryIndex];
    if (!entry) {
      this.variantEntry = -1;
      this.variantIndex = 0;
      this.variants.replaceChildren();
      this.variants.hidden = true;
      this.position.textContent = 'No sprites found'; this.title.textContent = 'No matching sprites'; this.usage.textContent = ''; this.blendState.value = '0'; this.blendState.textContent = '0% blend'; this.context.clearRect(0, 0, this.preview.width, this.preview.height); this.interpolatedContext.clearRect(0, 0, this.interpolatedPreview.width, this.interpolatedPreview.height); return;
    }
    if (this.variantEntry !== entryIndex) {
      this.variantEntry = entryIndex!;
      this.variantIndex = 0;
    }
    const activeVariant = entry.variants?.[this.variantIndex];
    const activeFrames = activeVariant?.frames ?? entry.frames;
    this.entrySelect.selectedIndex = this.selected;
    let variantLabel = '';
    if (activeVariant) variantLabel = `${activeVariant.title} · `;
    let frameSuffix = 's';
    if (activeFrames.length === 1) frameSuffix = '';
    this.position.textContent = `${this.selected + 1} / ${this.visible.length} · ${variantLabel}${activeFrames.length} frame${frameSuffix}`;
    let title = entry.title;
    if (activeVariant && activeVariant.title !== 'Base sprite') title = `${entry.title} · ${activeVariant.title}`;
    this.title.textContent = title;
    this.usage.textContent = entry.usage;
    this.renderVariants(entry);
  }

  private renderVariants(entry: SpriteEntry) {
    const variants = entry.variants;
    if (!variants?.length) {
      this.variants.replaceChildren();
      this.variants.hidden = true;
      return;
    }
    this.variantIndex = Math.max(0, Math.min(this.variantIndex, variants.length - 1));
    this.variants.hidden = false;
    this.variants.replaceChildren(...variants.map((variant, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = variant.title;
      button.setAttribute('aria-pressed', String(index === this.variantIndex));
      if (index === 0) button.title = 'Clear the selected car variation';
      else button.title = `Toggle ${variant.title.toLowerCase()}`;
      button.onclick = () => {
        if (index === this.variantIndex && index !== 0) this.variantIndex = 0;
        else this.variantIndex = index;
        this.renderVariants(entry);
        this.showSelected();
      };
      return button;
    }));
  }

  private paint = (now: number) => {
    const entryIndex = this.visible[this.selected];
    let entry: SpriteEntry | undefined;
    if (entryIndex !== undefined) entry = this.entries[entryIndex];
    if (entry) {
      const frames = entry.variants?.[this.variantIndex]?.frames ?? entry.frames;
      const blend = spriteFrameBlend(now, entry.frameMs, frames.length);
      const frame = frames[blend.frameIndex];
      const nextFrame = frames[blend.nextFrameIndex];
      if (!frame || !nextFrame) { this.request = requestAnimationFrame(this.paint); return; }
      this.context.clearRect(0, 0, this.preview.width, this.preview.height);
      this.interpolatedContext.clearRect(0, 0, this.interpolatedPreview.width, this.interpolatedPreview.height);
      this.context.imageSmoothingEnabled = false;
      this.interpolatedContext.imageSmoothingEnabled = false;
      const blendFrames = this.interpolate.checked && frames.length > 1;
      let maxWidth = frame.width;
      if (blendFrames) maxWidth = Math.max(frame.width, nextFrame.width);
      let maxHeight = frame.height;
      if (blendFrames) maxHeight = Math.max(frame.height, nextFrame.height);
      const scale = Math.max(1, Math.floor(Math.min((this.preview.width - 24) / maxWidth, (this.preview.height - 24) / maxHeight)));
      const draw = (context: CanvasRenderingContext2D, source: Pixels, alpha: number) => {
        const image = this.imageData.get(source) ?? new ImageData(new Uint8ClampedArray(source.data), source.width, source.height);
        this.imageData.set(source, image);
        let temporary = this.sourceCanvases.get(source);
        if (!temporary) { temporary = document.createElement('canvas'); temporary.width = source.width; temporary.height = source.height; temporary.getContext('2d')!.putImageData(image, 0, 0); this.sourceCanvases.set(source, temporary); }
        const width = source.width * scale, height = source.height * scale;
        context.globalAlpha = alpha;
        context.drawImage(temporary, (this.preview.width - width) / 2, (this.preview.height - height) / 2, width, height);
      };
      draw(this.context, frame, 1);
      let frameAlpha = 1;
      if (blendFrames) frameAlpha = 1 - blend.mix;
      draw(this.interpolatedContext, frame, frameAlpha);
      if (blendFrames && blend.mix > 0) draw(this.interpolatedContext, nextFrame, blend.mix);
      this.context.globalAlpha = 1;
      this.interpolatedContext.globalAlpha = 1;
      if (blendFrames) {
        this.blendState.value = String(Math.round(blend.mix * 100));
        this.blendState.textContent = `${Math.round(blend.mix * 100)}% blend`;
      } else {
        this.blendState.value = '0';
        this.blendState.textContent = 'off';
      }
    }
    this.request = requestAnimationFrame(this.paint);
  };

  private readonly keydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); location.href = '/'; return; }
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { event.preventDefault(); event.stopPropagation(); this.move(-1); }
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); event.stopPropagation(); this.move(1); }
  };

  dispose() {
    cancelAnimationFrame(this.request);
    removeEventListener('keydown', this.keydown, true);
  }
}
