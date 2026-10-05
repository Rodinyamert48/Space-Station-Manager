export type Child = Node | string | number | null | undefined | false;

export interface Props {
  class?: string;
  text?: string | number;
  title?: string;
  attrs?: Record<string, string>;
  dataset?: Record<string, string>;
  style?: Partial<Record<string, string>>;
  onClick?: (e: MouseEvent) => void;
}

/** Tiny element factory used by all UI components. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props | null = null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    if (props.class) el.className = props.class;
    if (props.text !== undefined) el.textContent = String(props.text);
    if (props.title) el.title = props.title;
    if (props.attrs) for (const [k, v] of Object.entries(props.attrs)) el.setAttribute(k, v);
    if (props.dataset) for (const [k, v] of Object.entries(props.dataset)) el.dataset[k] = v;
    if (props.style) for (const [k, v] of Object.entries(props.style)) if (v !== undefined) el.style.setProperty(k, v);
    if (props.onClick) (el as HTMLElement).addEventListener('click', props.onClick);
  }
  append(el, children);
  return el;
}

export function append(el: Element, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/** Sets text only when it changed (avoids layout work in frequently refreshed HUD elements). */
export function setText(el: Element, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

export function toggleClass(el: Element, cls: string, on: boolean): void {
  if (el.classList.contains(cls) !== on) el.classList.toggle(cls, on);
}

export function button(label: string | Node, onClick: (e: MouseEvent) => void, cls = 'btn', title?: string): HTMLButtonElement {
  const b = h('button', { class: cls, title, attrs: { type: 'button' } }, label);
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick(e);
  });
  return b;
}
