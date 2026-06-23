import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { DICT, type Lang } from "./dictionaries";

export type { Lang };
export const LANGS: { value: Lang; label: string }[] = [
  { value: "en", label: "EN" },
  { value: "ru", label: "RU" },
  { value: "uz", label: "UZ" },
];

// Module-level mirror of the active language so non-React helpers (money
// formatting) can localize without prop-drilling. Kept in sync by LangProvider.
let _lang: Lang = (localStorage.getItem("parfume_lang") as Lang) || "en";
export const getLang = (): Lang => _lang;

export type TVars = Record<string, string | number>;

export function translate(lang: Lang, key: string, vars?: TVars): string {
  let s = (DICT[lang] && DICT[lang][key]) || DICT.en[key] || key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return s;
}

interface LangCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, vars?: TVars) => string;
}

const Ctx = createContext<LangCtx | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(_lang);

  const setLang = useCallback((l: Lang) => {
    _lang = l;
    localStorage.setItem("parfume_lang", l);
    setLangState(l);
  }, []);

  const t = useCallback(
    (key: string, vars?: TVars) => translate(lang, key, vars),
    [lang],
  );

  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}

export function useI18n(): LangCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useI18n must be used within LangProvider");
  return ctx;
}

// Convenience hook returning just the translate function.
export const useT = () => useI18n().t;
