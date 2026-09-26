import { de } from './locales/de';
import { en } from './locales/en';

export type Lang = 'de' | 'en';
export type LangSetting = Lang | 'auto';
export type MessageKey = keyof typeof de;

const STORAGE_KEY = 'trackswap.lang';
const dictionaries: Record<Lang, Record<MessageKey, string>> = { de, en };

function readSetting(): LangSetting {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'de' || v === 'en') return v;
  } catch {
    /* storage unavailable (private mode) */
  }
  return 'auto';
}

/** Browser language: German for any de-* locale, English otherwise. */
export function detectLang(): Lang {
  const langs = typeof navigator !== 'undefined' ? (navigator.languages?.length ? navigator.languages : [navigator.language]) : [];
  for (const l of langs) {
    const code = l?.toLowerCase() ?? '';
    if (code.startsWith('de')) return 'de';
    if (code.startsWith('en')) return 'en';
  }
  return 'en';
}

class I18n {
  setting = $state<LangSetting>(readSetting());
  lang = $derived<Lang>(this.setting === 'auto' ? detectLang() : this.setting);

  set(setting: LangSetting): void {
    this.setting = setting;
    try {
      if (setting === 'auto') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, setting);
    } catch {
      /* storage unavailable */
    }
  }

  /** Locale for number formatting. */
  get locale(): string {
    return this.lang === 'de' ? 'de-CH' : 'en-US';
  }
}

export const i18n = new I18n();

/** Translates a key and fills {placeholders}. Reactive when used in templates or $derived. */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const text = dictionaries[i18n.lang][key] ?? de[key] ?? key;
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m));
}
