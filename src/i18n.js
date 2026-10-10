// RevoMail is English-only. These helpers are kept so existing call sites keep working.
export function translate(text) {
  return text;
}

export function translateUI() {
  document.documentElement.lang = "en";
}
