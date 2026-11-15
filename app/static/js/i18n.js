/**
 * VitalWatch - Tiny i18n Helper & Language Switcher
 * Feature #11: Multilingual Interface
 */
const I18N_SUPPORTED = {
  en: "English",
  hi: "हिन्दी",
  as: "অসমীয়া",
  bn: "বাংলা",
  mni: "ꯃꯤꯇꯩꯂꯣꯟ",
  lus: "Mizo"
};

const I18N_CACHE = {};
let currentLang = localStorage.getItem("vitalwatch_lang") || "en";

function t(key) {
  if (!key) return "";
  const langData = I18N_CACHE[currentLang];
  if (langData && langData[key]) return langData[key];
  const enData = I18N_CACHE["en"];
  if (enData && enData[key]) return enData[key];
  return key;
}

async function loadLocale(code) {
  if (I18N_CACHE[code]) return I18N_CACHE[code];
  try {
    const res = await fetch(`/static/locales/${code}.json`);
    if (res.ok) {
      const data = await res.json();
      I18N_CACHE[code] = data;
      return data;
    }
  } catch (e) {
    console.warn(`[i18n] Could not load ${code} locale:`, e);
  }
  return null;
}

function updateDOMTranslations() {
  document.body.classList.add("i18n-transitioning");

  // Update static elements with data-i18n
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    if (key) {
      const val = t(key);
      if (val) el.textContent = val;
    }
  });

  // Update input placeholders with data-i18n-placeholder
  document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (key) {
      const val = t(key);
      if (val) el.placeholder = val;
    }
  });

  // Update document title if applicable
  const appTitle = t("page_overview");
  if (appTitle && document.title) {
    document.title = `VitalWatch - ${t("page_" + (window.currentActiveTab || "overview")) || appTitle}`;
  }

  // Dispatch custom event for dynamic components
  window.dispatchEvent(new CustomEvent("languageChanged", { detail: { lang: currentLang } }));

  setTimeout(() => {
    document.body.classList.remove("i18n-transitioning");
  }, 220);
}

async function setLanguage(code) {
  if (!I18N_SUPPORTED[code]) code = "en";
  currentLang = code;
  localStorage.setItem("vitalwatch_lang", code);
  document.documentElement.lang = code;

  // Always ensure English is loaded for fallback
  if (!I18N_CACHE["en"]) await loadLocale("en");
  await loadLocale(code);

  // Update switcher labels & active classes
  const labelEl = document.getElementById("lang-switcher-current-label");
  if (labelEl) labelEl.textContent = I18N_SUPPORTED[code];

  document.querySelectorAll(".lang-dropdown-option").forEach(opt => {
    const optLang = opt.getAttribute("data-lang");
    if (optLang === code) opt.classList.add("active");
    else opt.classList.remove("active");
  });

  updateDOMTranslations();
}

// Initialise language switcher dropdown
function initLanguageSwitcher() {
  const btn = document.getElementById("lang-switcher-btn");
  const menu = document.getElementById("lang-switcher-menu");
  if (!btn || !menu) return;

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.classList.toggle("open");
  });

  menu.querySelectorAll(".lang-dropdown-option").forEach(opt => {
    opt.addEventListener("click", (e) => {
      e.stopPropagation();
      const code = opt.getAttribute("data-lang");
      setLanguage(code);
      menu.classList.remove("open");
    });
  });

  document.addEventListener("click", (e) => {
    if (!menu.contains(e.target) && !btn.contains(e.target)) {
      menu.classList.remove("open");
    }
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  initLanguageSwitcher();
  await setLanguage(currentLang);
});

// Expose globally
window.t = t;
window.setLanguage = setLanguage;
window.I18N_SUPPORTED = I18N_SUPPORTED;
