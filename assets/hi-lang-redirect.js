(function () {
  const LANG_KEY = "hi-lang";
  const path = location.pathname.replace(/\/index\.html$/i, "").replace(/\/$/, "") || "/";
  const isZhPath = path === "/zh";
  const tail = location.search + location.hash;

  function goZh() {
    if (!isZhPath) location.replace("/zh/" + tail);
  }
  function goEn() {
    if (isZhPath) location.replace("/" + tail);
  }
  function saveLang(lang) {
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch (_) {}
  }

  const from = new URLSearchParams(location.search).get("from");

  // 主站带 from= 时优先（覆盖之前手动切换记住的语言）
  if (from === "main-zh") {
    saveLang("zh");
    goZh();
    return;
  }
  if (from === "main-en") {
    saveLang("en");
    goEn();
    return;
  }

  try {
    const ref = document.referrer;
    if (ref) {
      const u = new URL(ref);
      if (u.hostname.replace(/^www\./, "") === "atomfable.com") {
        if (u.pathname.startsWith("/zh")) {
          saveLang("zh");
          goZh();
          return;
        }
        saveLang("en");
        goEn();
        return;
      }
    }
  } catch (_) {}

  let saved;
  try {
    saved = localStorage.getItem(LANG_KEY);
  } catch (_) {}

  if (saved === "zh") {
    goZh();
    return;
  }
  if (saved === "en") {
    goEn();
    return;
  }

  saveLang("en");
  goEn();
})();
