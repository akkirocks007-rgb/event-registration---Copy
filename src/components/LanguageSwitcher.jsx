import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';

const LANGUAGES = [
  { code: 'en', label: 'English',   flag: '🇬🇧', dir: 'ltr' },
  { code: 'hi', label: 'हिंदी',     flag: '🇮🇳', dir: 'ltr' },
  { code: 'ar', label: 'العربية',   flag: '🇸🇦', dir: 'rtl' },
];

const LanguageSwitcher = () => {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  // Resolve current language — fall back to 'en' if detector returns a variant like 'en-US'
  const resolvedCode = LANGUAGES.find(l => l.code === i18n.language)?.code
    ?? LANGUAGES.find(l => i18n.language?.startsWith(l.code))?.code
    ?? 'en';
  const currentLang = LANGUAGES.find(l => l.code === resolvedCode) ?? LANGUAGES[0];

  const changeLanguage = (lang) => {
    i18n.changeLanguage(lang.code);
    setOpen(false);
  };

  useEffect(() => {
    document.documentElement.dir = currentLang.dir;
  }, [currentLang]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div className="fixed bottom-6 right-6 z-50" ref={containerRef}>
      <div className="relative">
        {/* Trigger button */}
        <button
          onClick={() => setOpen(prev => !prev)}
          aria-label="Switch language"
          aria-expanded={open}
          className="flex items-center gap-2 px-4 py-2.5 bg-black/60 backdrop-blur-xl border border-white/10 rounded-full text-xs font-black text-white hover:bg-white/10 transition-all shadow-2xl"
        >
          <Globe className="w-4 h-4 text-primary" />
          <span>{currentLang.flag}</span>
          <span>{currentLang.label}</span>
        </button>

        {/* Dropdown */}
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.95 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="absolute bottom-full right-0 mb-3 bg-zinc-900 border border-white/10 p-2 rounded-2xl shadow-2xl min-w-[160px] space-y-1"
            >
              {LANGUAGES.map(lang => {
                const isActive = lang.code === resolvedCode;
                return (
                  <button
                    key={lang.code}
                    onClick={() => changeLanguage(lang)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-[10px] font-bold transition-all ${
                      isActive
                        ? 'bg-primary/20 text-primary'
                        : 'text-zinc-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span>{lang.flag}</span>
                      <span>{lang.label}</span>
                    </span>
                    {isActive && (
                      <div className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                    )}
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default LanguageSwitcher;
