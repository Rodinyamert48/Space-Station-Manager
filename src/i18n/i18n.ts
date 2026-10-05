import { en } from './en';
import { tr } from './tr';

export type TKey = keyof typeof en;
export type Language = 'en' | 'tr';
export type TParams = Record<string, string | number>;

const DICTS: Record<Language, Record<TKey, string>> = { en, tr };
let current: Language = 'en';
const listeners = new Set<() => void>();

export function detectLanguage(): Language {
  const nav = typeof navigator !== 'undefined' ? navigator.language : 'en';
  return nav.toLowerCase().startsWith('tr') ? 'tr' : 'en';
}

export function setLanguage(lang: Language): void {
  if (lang === current) return;
  current = lang;
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
  for (const fn of listeners) fn();
}

export function getLanguage(): Language {
  return current;
}

export function onLanguageChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Translates a key and substitutes `{name}` placeholders. */
export function t(key: TKey, params?: TParams): string {
  const template = DICTS[current][key] ?? en[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = params[name];
    if (value === undefined) return `{${name}}`;
    // Parameters may themselves be translation keys (e.g. a module name inside a notification).
    if (typeof value === 'string' && value.includes('.') && value in en) return DICTS[current][value as TKey];
    return String(value);
  });
}

/** For keys built from data ids (e.g. `module.${type}.name`). Throws in dev if the key is missing. */
export function tk(key: string, params?: TParams): string {
  if (!(key in en)) {
    if (import.meta.env?.DEV) throw new Error(`Missing translation key: ${key}`);
    return key;
  }
  return t(key as TKey, params);
}
