import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import enTranslation from './locales/en.json';
import hiTranslation from './locales/hi.json';
import arTranslation from './locales/ar.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        translation: {
          // Legacy flat keys preserved for backward compatibility
          "welcome": "Welcome",
          "login": "Login",
          "register": "Register Now",
          "event_details": "Event Overview",
          "get_tickets": "Secure Your Access",
          "full_name": "Full Name",
          "email_address": "Email Address",
          "complete_registration": "Finalize Registration",
          "role_select": "Select Your Role",
          "otp_verify": "Verify Identity",
          "payment": "Secure Checkout",
          // Namespaced keys from locale files
          ...enTranslation,
        }
      },
      hi: {
        translation: {
          // Legacy flat keys preserved for backward compatibility
          "welcome": "स्वागत है",
          "login": "लॉगिन करें",
          "register": "अभी पंजीकरण करें",
          "event_details": "ईवेंट विवरण",
          "get_tickets": "अपनी पहुँच सुरक्षित करें",
          "full_name": "पूरा नाम",
          "email_address": "ईमेल पता",
          "complete_registration": "पंजीकरण पूरा करें",
          "role_select": "अपनी भूमिका चुनें",
          "otp_verify": "पहचान सत्यापित करें",
          "payment": "सुरक्षित चेकआउट",
          // Namespaced keys from locale files
          ...hiTranslation,
        }
      },
      ar: {
        translation: {
          // Legacy flat keys preserved for backward compatibility
          "welcome": "مرحباً",
          "login": "تسجيل الدخول",
          "register": "سجل الآن",
          "event_details": "نظرة عامة على الحدث",
          "get_tickets": "تأمين وصولك",
          "full_name": "الاسم الكامل",
          "email_address": "البريد الإلكتروني",
          "complete_registration": "إنهاء التسجيل",
          "role_select": "اختر دورك",
          "otp_verify": "التحقق من الهوية",
          "payment": "الدفع الآمن",
          // Namespaced keys from locale files
          ...arTranslation,
        }
      }
    },
    supportedLngs: ['en', 'hi', 'ar'],
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    },
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
    },
  });

export default i18n;
