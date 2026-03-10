"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { translations, Language, Translations } from "@/lib/translations";

interface LanguageContextProps {
  language: Language;
  t: Translations;
  toggleLanguage: () => void;
}

const LanguageContext = createContext<LanguageContextProps | undefined>(undefined);

export const LanguageProvider = ({ children }: { children: React.ReactNode }) => {
  const [language, setLanguage] = useState<Language>("fr");

  useEffect(() => {
    const storedLang = localStorage.getItem("language") as Language;
    if (storedLang && (storedLang === "fr" || storedLang === "en")) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLanguage(storedLang);
    } else {
      const browserLang = navigator.language.startsWith("fr") ? "fr" : "en";
      setLanguage(browserLang);
    }
  }, []);

  const toggleLanguage = () => {
    setLanguage((prev) => {
      const newLang = prev === "fr" ? "en" : "fr";
      localStorage.setItem("language", newLang);
      return newLang;
    });
  };

  const t = translations[language];

  return (
    <LanguageContext.Provider value={{ language, t, toggleLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return {
    ...context,
    t: {
      ...context.t,
      interpolate: (str: string, params: Record<string, any>) => {
        return str.replace(/{(\w+)}/g, (_, key) => params[key] || '');
      }
    }
  };
};
