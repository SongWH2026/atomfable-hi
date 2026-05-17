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

  const from = new URLSearchParams(location.search).get("from");
  if (from === "main-zh") {
    try {
      localStorage.setItem(LANG_KEY, "zh");
    } catch (_) {}
    goZh();
    return;
  }
  if (from === "main-en") {
    try {
      localStorage.setItem(LANG_KEY, "en");
    } catch (_) {}
    goEn();
    return;
  }

  try {
    const ref = document.referrer;
    if (ref) {
      const u = new URL(ref);
      if (u.hostname.replace(/^www\./, "") === "atomfable.com") {
        if (u.pathname.startsWith("/zh")) {
          try {
            localStorage.setItem(LANG_KEY, "zh");
          } catch (_) {}
          goZh();
          return;
        }
        try {
          localStorage.setItem(LANG_KEY, "en");
        } catch (_) {}
        goEn();
        return;
      }
    }
  } catch (_) {}

  try {
    localStorage.setItem(LANG_KEY, "en");
  } catch (_) {}
  goEn();
})();
