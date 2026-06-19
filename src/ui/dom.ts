type Attrs = Record<string, string | number | boolean | EventListener | null | undefined>;
type Child = Node | string | null | undefined;

/** Tiny hyperscript-style element helper. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: Child[] | Child = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else if (key === "class") {
      node.className = String(value);
    } else if (key === "html") {
      node.innerHTML = String(value);
    } else {
      node.setAttribute(key, String(value));
    }
  }
  const kids = Array.isArray(children) ? children : [children];
  for (const child of kids) {
    if (child == null) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function clear(node: HTMLElement): void {
  node.replaceChildren();
}

export function mount(node: HTMLElement, ...children: Child[]): void {
  clear(node);
  for (const child of children) {
    if (child == null) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}
