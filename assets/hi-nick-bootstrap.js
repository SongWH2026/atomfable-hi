(function () {
  const display = document.getElementById("nick-display");
  const input = document.getElementById("nick");
  if (!display) return;

  const lang = window.HI_PAGE_LANG === "zh" ? "zh" : "en";
  const prefix = lang === "zh" ? "路过的热心网友" : "Passerby";
  const storageKey = "hi-display-nick";

  function randomNick() {
    const n = Math.floor(1000 + Math.random() * 9000);
    return `${prefix}${n}`;
  }

  let nick = "";
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved && saved.trim()) nick = saved.trim();
  } catch (_) {}

  if (!nick) nick = randomNick();

  display.textContent = nick;
  if (input) input.value = nick;
})();
