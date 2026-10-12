'use client';
import { useSyncExternalStore } from 'react';
import translations from './translations.json';
export type Locale = 'zh' | 'en';
const key = 'voice-lab-ui-language';
const listeners = new Set<() => void>();
let current: Locale | undefined;
export function getLocale(): Locale {
  if (current) return current;
  if (typeof window === 'undefined') return 'zh';
  const query = new URLSearchParams(window.location.search).get('lang');
  let saved: string | null = null;
  try { saved = localStorage.getItem(key); } catch { /* Storage is optional. */ }
  current = query === 'en' || query === 'zh' ? query : saved === 'en' || saved === 'zh' ? saved : navigator.language.startsWith('zh') ? 'zh' : 'en';
  document.documentElement.lang = current === 'zh' ? 'zh-CN' : 'en';
  return current;
}
export function setLocale(locale: Locale) {
  current = locale;
  try { localStorage.setItem(key, locale); } catch { /* Storage is optional. */ }
  document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
  const url = new URL(window.location.href); url.searchParams.set('lang', locale);
  window.history.replaceState(null, '', url);
  listeners.forEach(listener => listener());
}
export function translate(text: string, locale: Locale): string {
  if (locale === 'zh') return text;
  return (translations as Record<string, string>)[text] || text;
}
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function useLocale() {
  const locale = useSyncExternalStore(subscribe, getLocale, () => 'zh' as Locale);
  return { locale, setLocale, t: (text: string) => translate(text, locale) };
}
