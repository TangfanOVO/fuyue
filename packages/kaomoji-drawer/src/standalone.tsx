import { createRoot, type Root } from "react-dom/client";
import styles from "./styles.css";
import { KaomojiDrawer } from "./kaomoji-drawer.js";
import { createLocalKaomojiRepository } from "./repository.js";
import type { KaomojiCatalogOptions, KaomojiRepository } from "./types.js";

type StandaloneTarget = Element | string;

export type StandaloneMountOptions = {
  input?: HTMLInputElement | HTMLTextAreaElement | string;
  onInsert?: (value: string) => void;
  repository?: KaomojiRepository;
  storageKey?: string;
  title?: string;
  catalog?: KaomojiCatalogOptions | false;
};

export type StandaloneController = {
  repository: KaomojiRepository;
  unmount(): void;
};

const roots = new WeakMap<Element, Root>();

function resolveElement<T extends Element>(target: T | string | undefined): T | null {
  if (!target) return null;
  return typeof target === "string" ? document.querySelector<T>(target) : target;
}

function ensureStyles() {
  if (document.querySelector("style[data-fuyue-kaomoji]")) return;
  const style = document.createElement("style");
  style.dataset.fuyueKaomoji = "";
  style.textContent = styles;
  document.head.append(style);
}

function insertIntoField(field: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const start = field.selectionStart ?? field.value.length;
  const end = field.selectionEnd ?? start;
  field.setRangeText(value, start, end, "end");
  field.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
  field.focus();
}

export function mount(target: StandaloneTarget, options: StandaloneMountOptions = {}): StandaloneController {
  const host = resolveElement(target);
  if (!host) throw new Error("Fuyue Kaomoji mount target was not found.");
  ensureStyles();
  roots.get(host)?.unmount();
  const repository = options.repository ?? createLocalKaomojiRepository(options.storageKey);
  const onInsert = options.onInsert ?? ((value: string) => {
    const input = resolveElement<HTMLInputElement | HTMLTextAreaElement>(options.input);
    if (input) insertIntoField(input, value);
    host.dispatchEvent(new CustomEvent("fuyue-kaomoji-insert", { bubbles: true, detail: { value } }));
  });
  const root = createRoot(host);
  roots.set(host, root);
  root.render(<KaomojiDrawer repository={repository} onInsert={onInsert} title={options.title} catalog={options.catalog} />);
  return {
    repository,
    unmount() {
      if (roots.get(host) !== root) return;
      root.unmount();
      roots.delete(host);
    },
  };
}

const standalone = { mount, createLocalKaomojiRepository };
Object.assign(globalThis, { FuyueKaomoji: standalone });
