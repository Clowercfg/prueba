/**
 * SISTEMA DE IDIOMAS (i18n).
 *
 * - Diccionarios centralizados en src/locales/es.json y src/locales/en.json
 *   (claves planas separadas por puntos, interpolación {param}).
 * - Plurales: una clave puede contener "singular|plural" y se elige la parte
 *   según el parámetro `n` (n === 1 → singular).
 * - La preferencia se persiste en localStorage y por defecto se usa "en".
 * - `useT()` devuelve una función reactiva (se re-renderiza al cambiar idioma);
 *   `t()` global sirve para código no-React (usa el estado actual).
 */
import { useCallback } from "react";
import { create } from "zustand";
import esDict from "../data/locales/es.json";
import enDict from "../data/locales/en.json";

export type Lang = "es" | "en";

const STORAGE_KEY = "granja-inmersiva-lang-v1";

type Dict = Record<string, unknown>;

function lookup(dict: Dict, key: string): string | null {
  let cur: unknown = dict;
  for (const part of key.split(".")) {
    if (cur && typeof cur === "object") cur = (cur as Dict)[part];
    else return null;
  }
  return typeof cur === "string" ? cur : null;
}

export type TParams = Record<string, string | number>;

export function translateFor(lang: Lang, key: string, params?: TParams): string {
  const dict = lang === "es" ? esDict : enDict;
  const fallback = lang === "es" ? enDict : esDict;
  let value = lookup(dict as Dict, key) ?? lookup(fallback as Dict, key) ?? key;

  if (params && typeof params.n === "number") {
    const parts = value.split("|");
    value = params.n === 1 ? (parts[0] ?? value) : (parts[1] ?? value);
  }
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      value = value.split(`{${k}}`).join(String(v));
    }
  }
  return value;
}

/** Etiqueta de locale BCP47 para formatear fechas/números según el idioma. */
export function localeFor(lang: Lang): string {
  return lang === "es" ? "es-ES" : "en-US";
}

function detectInitial(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "es" || saved === "en") return saved;
    return "en";
  } catch {
    return "en";
  }
}

interface LanguageStore {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, params?: TParams) => string;
}

export const useLanguageStore = create<LanguageStore>((set, get) => ({
  lang: detectInitial(),
  setLang: (l) => {
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* sin persistencia disponible */
    }
    set({ lang: l });
  },
  t: (key, params) => translateFor(get().lang, key, params),
}));

/** Función de traducción reactiva para componentes. */
export function useT(): (key: string, params?: TParams) => string {
  const lang = useLanguageStore((s) => s.lang);
  return useCallback((key, params) => translateFor(lang, key, params), [lang]);
}

/** Traducción global para código no-React. */
export function t(key: string, params?: TParams): string {
  return useLanguageStore.getState().t(key, params);
}
