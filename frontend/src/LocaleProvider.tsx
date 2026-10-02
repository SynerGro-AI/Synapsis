import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  I18nContext,
  LOCALES,
  type I18nContextValue,
  type Locale,
  translate,
} from "./i18n";

function isLocale(value: string | null): value is Locale {
  return value !== null && (LOCALES as readonly string[]).includes(value);
}

function detectLocale(languages: readonly string[]): Locale {
  for (const language of languages) {
    const normalized = language.replace("_", "-").toLowerCase();
    if (normalized.startsWith("pt")) return "pt-BR";
    if (normalized.startsWith("nl")) return "nl";
    if (normalized.startsWith("fr")) return "fr";
    if (normalized.startsWith("de")) return "de";
    if (normalized.startsWith("en")) return "en";
  }
  return "en";
}

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem("synapsis.locale");
    if (isLocale(saved)) return saved;
  } catch (error) {
    console.warn("Could not read the saved language preference.", error);
  }
  return detectLocale(typeof navigator === "undefined" ? [] : navigator.languages);
}

export default function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [lessonLocale, setLessonLocale] = useState<Locale>(() => {
    try {
      const saved = localStorage.getItem("synapsis.lesson-locale");
      if (isLocale(saved)) return saved;
    } catch (error) {
      console.warn("Could not read the saved lesson language preference.", error);
    }
    return initialLocale();
  });

  useEffect(() => {
    document.documentElement.lang = locale;
    try {
      localStorage.setItem("synapsis.locale", locale);
    } catch (error) {
      console.warn("Could not save the language preference.", error);
    }
  }, [locale]);

  useEffect(() => {
    try {
      localStorage.setItem("synapsis.lesson-locale", lessonLocale);
    } catch (error) {
      console.warn("Could not save the lesson language preference.", error);
    }
  }, [lessonLocale]);

  const value = useMemo<I18nContextValue>(() => {
    const t: I18nContextValue["t"] = (key, values) =>
      translate(locale, key, values);
    return { locale, setLocale, lessonLocale, setLessonLocale, t };
  }, [locale, lessonLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
