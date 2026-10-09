"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { DICT, type DictKey, type Lang } from "@/lib/i18n";

/* ---------- tema: dark (padrão) / light (opcional) ---------- */
type Theme = "dark" | "light";
const ThemeCtx = createContext<{ theme: Theme; toggle: () => void }>({
  theme: "dark",
  toggle: () => {},
});

function readStored(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() =>
    readStored("kb-theme") === "light" ? "light" : "dark"
  );
  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
    document.documentElement.style.colorScheme = theme === "light" ? "light" : "dark";
    try {
      localStorage.setItem("kb-theme", theme);
    } catch {
      /* ignora */
    }
  }, [theme]);
  const toggle = useCallback(
    () => setTheme((t) => (t === "dark" ? "light" : "dark")),
    []
  );
  const value = useMemo(() => ({ theme, toggle }), [theme, toggle]);
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  return useContext(ThemeCtx);
}

/* ---------- idioma: pt (padrão) / en / es ---------- */
const LangCtx = createContext<{
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (k: DictKey) => string;
}>({ lang: "pt", setLang: () => {}, t: (k) => DICT.pt[k] });

function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = readStored("kb-lang");
    return saved === "en" || saved === "es" ? saved : "pt";
  });
  useEffect(() => {
    document.documentElement.lang = lang === "pt" ? "pt-BR" : lang === "en" ? "en" : "es";
  }, [lang]);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    document.documentElement.lang = l === "pt" ? "pt-BR" : l === "en" ? "en" : "es";
    try {
      localStorage.setItem("kb-lang", l);
    } catch {
      /* ignora */
    }
  }, []);
  const t = useCallback((k: DictKey) => DICT[lang][k] ?? DICT.pt[k], [lang]);
  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <LangCtx.Provider value={value}>{children}</LangCtx.Provider>;
}

export function useLang() {
  return useContext(LangCtx);
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <LangProvider>{children}</LangProvider>
    </ThemeProvider>
  );
}
