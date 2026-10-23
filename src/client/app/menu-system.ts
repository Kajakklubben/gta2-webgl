export type MenuActionHandler = (action: string, menuId: string) => void;

export type MenuEntryDefinition =
  | {
      readonly kind: 'action';
      readonly id: string;
      readonly label: string;
      readonly action: string;
      readonly disabled?: boolean;
    }
  | {
      readonly kind: 'checkbox';
      readonly id: string;
      readonly label: string;
      readonly checked?: boolean;
    };

export interface MenuRenderDefinition {
  readonly title: string;
  readonly headerClass: string;
  readonly entries: readonly MenuEntryDefinition[];
  readonly entryContainerClass?: string;
  readonly entryContainerTag?: 'div' | 'ul';
  readonly back?: {
    readonly id: string;
    readonly label: string;
  };
}

export interface MenuDefinition {
  readonly id: string;
  readonly surface: HTMLElement;
  readonly trigger?: HTMLElement;
  readonly triggerId?: string;
  readonly initialFocus?: HTMLElement;
  readonly initialFocusId?: string;
  readonly render?: MenuRenderDefinition;
}

export interface MenuOpenOptions {
  readonly replace?: boolean;
  readonly focus?: HTMLElement;
}

export interface MenuSystemOptions {
  readonly onAction?: MenuActionHandler;
}

function isFocusable(element: HTMLElement) {
  if (element.hidden || element.getAttribute('aria-hidden') === 'true' || element.hasAttribute('disabled')) return false;
  if (element.closest('[hidden]')) return false;
  return element.tabIndex >= 0;
}

function focusableElements(surface: HTMLElement) {
  return [...surface.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]')]
    .filter(isFocusable);
}

export class MenuSystem {
  private readonly definitions = new Map<string, MenuDefinition>();
  private readonly keydownHandlers = new Map<HTMLElement, (event: KeyboardEvent) => void>();
  private readonly clickHandlers = new Map<HTMLElement, () => void>();
  private readonly renderedElements = new Map<string, Map<string, HTMLElement>>();
  private stack: string[] = [];
  private activeId: string | undefined;

  constructor(
    private readonly backdrop: HTMLElement,
    definitions: readonly MenuDefinition[],
    private readonly options: MenuSystemOptions = {},
  ) {
    for (const definition of definitions) this.renderDefinition(definition);
    for (const definition of definitions) this.register(definition);
    this.render();
  }

  register(definition: MenuDefinition) {
    if (this.definitions.has(definition.id)) throw new Error(`Menu is already registered: ${definition.id}`);
    const trigger = definition.trigger ?? this.elementById(definition.triggerId);
    const initialFocus = definition.initialFocus ?? this.elementById(definition.initialFocusId, definition.surface);
    const resolved: MenuDefinition = {
      ...definition,
      ...(trigger ? { trigger } : {}),
      ...(initialFocus ? { initialFocus } : {}),
    };
    this.definitions.set(definition.id, resolved);
    const keydown = (event: KeyboardEvent) => this.handleSurfaceKeydown(definition.surface, event);
    definition.surface.addEventListener('keydown', keydown);
    this.keydownHandlers.set(definition.surface, keydown);
    definition.surface.hidden = true;
    definition.surface.setAttribute('aria-hidden', 'true');
    trigger?.setAttribute('aria-expanded', 'false');
  }

  element<T extends HTMLElement>(menuId: string, elementId: string) {
    const definition = this.definitions.get(menuId);
    if (!definition) throw new Error(`Unknown menu: ${menuId}`);
    const element = this.renderedElements.get(menuId)?.get(elementId) ?? document.getElementById(elementId);
    if (!element || !definition.surface.contains(element)) throw new Error(`Missing menu element: ${elementId}`);
    return element as T;
  }

  open(id: string, options: MenuOpenOptions = {}) {
    const definition = this.definitions.get(id);
    if (!definition) throw new Error(`Unknown menu: ${id}`);
    if (options.replace || !this.activeId) {
      this.stack = [id];
    } else {
      const existingIndex = this.stack.indexOf(id);
      this.stack = existingIndex >= 0 ? this.stack.slice(0, existingIndex + 1) : [...this.stack, id];
    }
    this.render(options.focus ?? definition.initialFocus);
  }

  openRoot(id: string) {
    this.open(id, { replace: true });
  }

  back() {
    if (!this.activeId) return false;
    this.stack.pop();
    this.render();
    return true;
  }

  backIf(id: string) {
    if (this.activeId === id) return this.back();
    return this.dismiss(id);
  }

  dismiss(id: string) {
    const index = this.stack.indexOf(id);
    if (index < 0) return false;
    this.stack.splice(index, 1);
    this.render();
    return true;
  }

  closeAll() {
    if (!this.activeId && this.stack.length === 0) return false;
    this.stack = [];
    this.render();
    return true;
  }

  toggleRoot(id: string) {
    if (this.activeId === id) this.closeAll();
    else this.openRoot(id);
  }

  handleEscape() {
    return this.back();
  }

  isOpen(id?: string) {
    return id ? this.activeId === id : this.activeId !== undefined;
  }

  activeMenu() {
    return this.activeId;
  }

  dispose() {
    for (const [surface, keydown] of this.keydownHandlers) surface.removeEventListener('keydown', keydown);
    for (const [element, click] of this.clickHandlers) element.removeEventListener('click', click);
    this.keydownHandlers.clear();
    this.clickHandlers.clear();
  }

  private renderDefinition(definition: MenuDefinition) {
    if (!definition.render) return;
    const rendered = new Map<string, HTMLElement>();
    const { surface, render } = definition;
    surface.replaceChildren();

    const header = document.createElement('div');
    header.className = render.headerClass;
    const title = document.createElement('strong');
    title.textContent = render.title;
    header.append(title);
    if (render.back) {
      const back = document.createElement('button');
      back.id = render.back.id;
      back.className = 'menu-button';
      back.type = 'button';
      back.textContent = render.back.label;
      back.dataset['menuBack'] = 'true';
      back.addEventListener('click', () => this.backIf(definition.id));
      this.clickHandlers.set(back, () => this.backIf(definition.id));
      rendered.set(back.id, back);
      header.append(back);
    }
    surface.append(header);

    const container = document.createElement(render.entryContainerTag ?? 'div');
    if (render.entryContainerClass) container.className = render.entryContainerClass;
    if (render.entryContainerTag === 'ul') container.setAttribute('aria-label', `${render.title} panels`);
    for (const entry of render.entries) {
      const element = this.renderEntry(definition.id, entry, rendered);
      if (render.entryContainerTag === 'ul') {
        const item = document.createElement('li');
        item.append(element);
        container.append(item);
      } else {
        container.append(element);
      }
    }
    surface.append(container);
    this.renderedElements.set(definition.id, rendered);
  }

  private renderEntry(menuId: string, entry: MenuEntryDefinition, rendered: Map<string, HTMLElement>) {
    if (entry.kind === 'action') {
      const button = document.createElement('button');
      button.id = entry.id;
      button.className = 'menu-button';
      button.type = 'button';
      button.textContent = entry.label;
      button.disabled = entry.disabled ?? false;
      button.dataset['menuAction'] = entry.action;
      const click = () => this.options.onAction?.(entry.action, menuId);
      button.addEventListener('click', click);
      this.clickHandlers.set(button, click);
      rendered.set(entry.id, button);
      return button;
    }

    const label = document.createElement('label');
    label.className = 'menu-checkbox-field';
    const input = document.createElement('input');
    input.id = entry.id;
    input.className = 'menu-checkbox';
    input.type = 'checkbox';
    input.checked = entry.checked ?? false;
    label.append(input, ` ${entry.label}`);
    rendered.set(entry.id, input);
    return label;
  }

  private elementById(id: string | undefined, scope?: HTMLElement) {
    if (!id) return undefined;
    const element = scope?.querySelector<HTMLElement>(`#${id}`) ?? document.getElementById(id);
    return element ?? undefined;
  }

  private render(focusTarget?: HTMLElement) {
    const previousId = this.activeId;
    this.activeId = this.stack.at(-1);
    for (const definition of this.definitions.values()) {
      const active = definition.id === this.activeId;
      definition.surface.hidden = !active;
      definition.surface.setAttribute('aria-hidden', String(!active));
      definition.trigger?.setAttribute('aria-expanded', String(active));
    }
    this.backdrop.hidden = !this.activeId;
    this.backdrop.setAttribute('aria-hidden', String(!this.activeId));

    if (this.activeId && this.activeId !== previousId) {
      const definition = this.definitions.get(this.activeId)!;
      const target = focusTarget && definition.surface.contains(focusTarget) ? focusTarget : definition.initialFocus;
      const focusable = target && isFocusable(target) ? target : focusableElements(definition.surface)[0];
      focusable?.focus({ preventScroll: true });
      return;
    }

    if (!this.activeId && previousId) this.definitions.get(previousId)?.trigger?.focus({ preventScroll: true });
  }

  private handleSurfaceKeydown(surface: HTMLElement, event: KeyboardEvent) {
    if (this.activeId !== this.definitionIdFor(surface)) return;
    const arrow = event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === 'ArrowRight';
    if (!arrow) return;
    if (event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement) return;
    if (event.target instanceof HTMLInputElement && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) return;
    const controls = focusableElements(surface);
    if (controls.length < 2) return;
    event.preventDefault();
    const current = Math.max(0, controls.indexOf(document.activeElement as HTMLElement));
    const direction = event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 1;
    controls[(current + direction + controls.length) % controls.length]!.focus({ preventScroll: true });
  }

  private definitionIdFor(surface: HTMLElement) {
    for (const definition of this.definitions.values()) if (definition.surface === surface) return definition.id;
    return undefined;
  }
}

export function createMenuSystem(backdrop: HTMLElement, definitions: readonly MenuDefinition[], options?: MenuSystemOptions) {
  return new MenuSystem(backdrop, definitions, options);
}
