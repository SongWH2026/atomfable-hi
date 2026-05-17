(function () {
  const LANG = window.HI_PAGE_LANG === "zh" ? "zh" : "en";
  if (!window.HI_I18N || !window.HI_I18N[LANG]) {
    console.error("HI_I18N not loaded");
    return;
  }
  const S = window.HI_I18N[LANG];
  const SOURCE_MAP = S.sourceMap;
  const ENTRY_SOURCE_KEY = "hi-entry-source";

  let messages = [];
  let isPosting = false;

  const chatScroll = document.getElementById("chat-scroll");
  const msgStream = document.getElementById("msg-stream");
  const msgTotal = document.getElementById("msg-total");
  const headerSub = document.getElementById("header-sub");
  const streamLoading = document.getElementById("stream-loading");
  const streamEmpty = document.getElementById("stream-empty");
  const btnSend = document.getElementById("btn-send");
  const form = document.getElementById("guestbook-form");
  const contentEl = document.getElementById("content");
  const charCount = document.getElementById("char-count");
  const toast = document.getElementById("toast");
  const nickBar = document.getElementById("nick-bar");
  const nickDisplay = document.getElementById("nick-display");
  const nickInput = document.getElementById("nick");
  const entrySourceHint = document.getElementById("entry-source-hint");
  const NICK_STORAGE_KEY = "hi-display-nick";
  const CLIENT_TOKEN_KEY = "hi-client-token";
  const ADMIN_SECRET_KEY = "hi-admin-secret";
  const API_MESSAGES = "/api/messages";
  let toastTimer;
  let myClientToken = "";
  let adminUnlocked = false;

  function initStaticText() {
    if (headerSub) headerSub.textContent = S.headerCount(0);
    if (streamLoading) streamLoading.textContent = S.streamLoading;
    if (streamEmpty) streamEmpty.textContent = S.streamEmpty;
    const composeDock = document.querySelector(".compose-dock");
    if (composeDock) composeDock.setAttribute("aria-label", S.composeRegion);
    const nickLabel = document.querySelector(".compose-nick-label");
    if (nickLabel) nickLabel.textContent = S.nickLabel;
    const nickHint = document.querySelector(".nick-hint");
    if (nickHint) nickHint.textContent = S.nickHint;
    if (nickDisplay) nickDisplay.title = S.nickTitle;
    if (contentEl) contentEl.placeholder = S.contentPlaceholder;
    if (btnSend) {
      btnSend.textContent = S.btnSend;
      btnSend.setAttribute("aria-label", S.btnSend);
    }
    const composeStatus = document.getElementById("compose-status");
    if (composeStatus) composeStatus.textContent = S.composeStatus;
    const adminBtn = document.getElementById("btn-admin-toggle");
    if (adminBtn && !adminUnlocked) adminBtn.textContent = S.adminBtn;
  }

  function bindLangSwitch() {
    document.querySelectorAll("[data-set-lang]").forEach((link) => {
      const lang = link.getAttribute("data-set-lang") || "en";
      link.href = (lang === "zh" ? "/zh/" : "/") + location.search;
      link.addEventListener("click", () => {
        try {
          localStorage.setItem("hi-lang", lang);
        } catch (_) {}
      });
    });
  }

  function resolveSourceFromCode(code) {
    const key = (code || "").trim().toLowerCase();
    if (!key || !SOURCE_MAP[key]) return null;
    return { id: key, label: SOURCE_MAP[key].label, url: SOURCE_MAP[key].url };
  }

  function resolveSourceFromReferrer() {
    try {
      const ref = document.referrer;
      if (!ref) return null;
      const host = new URL(ref).hostname.replace(/^www\./, "");
      const R = S.sourceReferrer;
      if (host === "atomfable.com") {
        return ref.includes("/zh")
          ? { id: "referrer-main-zh", label: R.mainZh.label, url: R.mainZh.url }
          : { id: "referrer-main-en", label: R.mainEn.label, url: R.mainEn.url };
      }
      if (host === "base64.atomfable.com") {
        return { id: "referrer-base64", label: R.base64.label, url: R.base64.url };
      }
      if (host === "image.atomfable.com") {
        return { id: "referrer-image", label: R.image.label, url: R.image.url };
      }
    } catch (_) {}
    return null;
  }

  function detectEntrySource() {
    const fromParam = new URLSearchParams(location.search).get("from");
    return resolveSourceFromCode(fromParam) || resolveSourceFromReferrer();
  }

  function getCurrentSource() {
    try {
      const raw = sessionStorage.getItem(ENTRY_SOURCE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.url && parsed.label) return parsed;
      }
    } catch (_) {}
    return detectEntrySource();
  }

  function persistEntrySource(source) {
    if (!source) return;
    try {
      sessionStorage.setItem(ENTRY_SOURCE_KEY, JSON.stringify(source));
    } catch (_) {}
  }

  function updateEntrySourceHint() {
    const source = getCurrentSource();
    if (!source || !entrySourceHint) return;
    const label = escapeHtml(source.label);
    const url = escapeHtml(source.url);
    entrySourceHint.innerHTML = S.entrySourceHint(label, url);
    entrySourceHint.classList.remove("hidden");
  }

  function randomGuestNick() {
    const n = Math.floor(1000 + Math.random() * 9000);
    return `${S.nickPrefix}${n}`;
  }

  function syncNickUI(value) {
    const nick = (value || "").trim() || randomGuestNick();
    nickInput.value = nick;
    nickDisplay.textContent = nick;
  }

  function openNickEdit() {
    nickBar.classList.add("is-editing");
    nickInput.classList.add("is-open");
    nickInput.focus();
    nickInput.select();
  }

  function closeNickEdit(save) {
    if (save) {
      const trimmed = nickInput.value.trim();
      if (trimmed) {
        syncNickUI(trimmed);
        try {
          localStorage.setItem(NICK_STORAGE_KEY, trimmed);
        } catch (_) {}
      } else {
        syncNickUI(nickDisplay.textContent);
      }
    } else {
      syncNickUI(nickDisplay.textContent);
    }
    nickBar.classList.remove("is-editing");
    nickInput.classList.remove("is-open");
  }

  function getSendNick() {
    return nickInput.value.trim() || nickDisplay.textContent.trim() || randomGuestNick();
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatMessageTime(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    if (sameDay) return hm;
    return `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
  }

  function getClientToken() {
    try {
      let token = localStorage.getItem(CLIENT_TOKEN_KEY);
      if (
        token &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)
      ) {
        return token;
      }
      token = crypto.randomUUID();
      localStorage.setItem(CLIENT_TOKEN_KEY, token);
      return token;
    } catch (_) {
      return "";
    }
  }

  function mapApiMessage(row) {
    const token = myClientToken || getClientToken();
    myClientToken = token;
    const source =
      row.source_label && row.source_url
        ? { label: row.source_label, url: row.source_url }
        : null;
    return {
      id: row.id,
      floor: row.id,
      nick: row.nick,
      admin: Boolean(row.is_admin),
      mine: Boolean(token && row.client_token && row.client_token === token),
      content: row.content,
      time: formatMessageTime(row.created_at),
      source,
    };
  }

  function updateHeaderCount(n) {
    if (headerSub) headerSub.textContent = S.headerCount(n);
    if (msgTotal) msgTotal.textContent = String(n);
  }

  async function loadMessages() {
    streamLoading.classList.remove("hidden");
    try {
      const res = await fetch(API_MESSAGES);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("GET /api/messages failed", res.status, data);
        if (data.error === "server_not_configured") {
          showToast(S.toastNotConfiguredLoad);
        } else if (data.error === "wrong_key_role") {
          showToast(S.toastWrongKey);
        } else if (data.hint) {
          showToast(data.hint);
        } else {
          showToast(S.toastLoadFail);
        }
        messages = [];
        renderMessages(messages);
        return;
      }
      messages = (data.messages || []).map(mapApiMessage);
      renderMessages(messages);
    } catch (_) {
      showToast(S.toastNetLoad);
      messages = [];
      renderMessages(messages);
    } finally {
      streamLoading.classList.add("hidden");
    }
  }

  function scrollToBottom(smooth) {
    requestAnimationFrame(() => {
      chatScroll.scrollTo({
        top: chatScroll.scrollHeight,
        behavior: smooth ? "smooth" : "auto",
      });
    });
  }

  function renderSourcePrefix(m) {
    if (!m.source || !m.source.url || !m.source.label) return "";
    const label = escapeHtml(m.source.label);
    const url = escapeHtml(m.source.url);
    return S.fromPrefix(label, url);
  }

  function getAdminSecret() {
    try {
      return localStorage.getItem(ADMIN_SECRET_KEY) || "";
    } catch (_) {
      return "";
    }
  }

  function setAdminUnlocked(on) {
    adminUnlocked = Boolean(on && getAdminSecret());
    const btn = document.getElementById("btn-admin-toggle");
    if (btn) {
      btn.classList.toggle("is-on", adminUnlocked);
      btn.textContent = adminUnlocked ? S.adminBtnOn : S.adminBtn;
    }
    renderMessages(messages);
  }

  function promptAdminSecret() {
    if (adminUnlocked) {
      if (confirm(S.adminExitConfirm)) {
        try {
          localStorage.removeItem(ADMIN_SECRET_KEY);
        } catch (_) {}
        setAdminUnlocked(false);
        showToast(S.adminExitToast);
      }
      return;
    }
    const input = prompt(S.adminPrompt);
    if (input === null) return;
    const secret = input.trim();
    if (!secret) {
      showToast(S.adminSecretEmpty);
      return;
    }
    try {
      localStorage.setItem(ADMIN_SECRET_KEY, secret);
    } catch (_) {
      showToast(S.adminSecretSaveFail);
      return;
    }
    setAdminUnlocked(true);
    showToast(S.adminUnlockedToast);
  }

  async function deleteMessage(id) {
    if (!adminUnlocked) return;
    if (!confirm(S.adminDeleteConfirm(id))) return;
    const payload = {
      id,
      nick: getSendNick(),
      admin_secret: getAdminSecret(),
    };
    try {
      const res = await fetch(API_MESSAGES, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.error === "admin_forbidden") {
          showToast(S.adminSecretWrong);
          try {
            localStorage.removeItem(ADMIN_SECRET_KEY);
          } catch (_) {}
          setAdminUnlocked(false);
        } else if (data.error === "admin_nick_mismatch") {
          showToast(S.adminNickMismatch);
        } else if (data.error === "not_found") {
          showToast(S.adminNotFound);
          await loadMessages();
        } else {
          showToast(data.hint || S.adminDeleteFail);
        }
        return;
      }
      messages = messages.filter((m) => m.id !== id);
      renderMessages(messages);
      showToast(S.adminDeleted);
    } catch (_) {
      showToast(S.adminNetFail);
    }
  }

  function renderBubble(m) {
    const side = m.mine ? "is-mine" : "is-other";
    const adminCls = m.admin && !m.mine ? " is-admin" : "";
    const label = escapeHtml(m.nick);
    const sourcePrefix = renderSourcePrefix(m);
    const deleteBtn = adminUnlocked
      ? `<div class="msg-actions"><button type="button" class="msg-delete" data-delete-id="${m.id}">${S.deleteBtn}</button></div>`
      : "";
    return `
        <div class="msg-item" data-msg-id="${m.id}">
        <div class="msg-row ${side}${adminCls}" role="article" aria-label="${escapeHtml(m.nick)}: ${escapeHtml(m.content).slice(0, 24)}">
          <div class="msg-wrap">
            <div class="msg-label">${sourcePrefix}${label} · #${m.floor}</div>
            <div class="bubble">${escapeHtml(m.content)}</div>
              <time class="msg-time">${escapeHtml(m.time)}</time>
              ${deleteBtn}
            </div>
          </div>
          <hr class="msg-divider" />
        </div>`;
  }

  function renderMessages(list) {
    if (!list.length) {
      msgStream.innerHTML = "";
      streamEmpty.classList.add("is-visible");
      updateHeaderCount(0);
      return;
    }
    streamEmpty.classList.remove("is-visible");
    msgStream.innerHTML = list.map(renderBubble).join("");
    updateHeaderCount(list.length);
    scrollToBottom(false);
  }

  function showToast(text) {
    toast.textContent = text;
    toast.hidden = false;
    toast.classList.add("is-show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove("is-show");
      toast.hidden = true;
      toast.textContent = "";
    }, 2400);
  }

  function autoGrowTextarea() {
    contentEl.style.height = "auto";
    const minH = parseFloat(getComputedStyle(contentEl).minHeight) || 72;
    contentEl.style.height = `${Math.max(minH, Math.min(contentEl.scrollHeight, 144))}px`;
  }

  initStaticText();
  bindLangSwitch();

  (function initNick() {
    const current =
      (nickDisplay && nickDisplay.textContent.trim()) ||
      (nickInput && nickInput.value.trim()) ||
      "";
    if (current) {
      syncNickUI(current);
      return;
    }
    try {
      const saved = localStorage.getItem(NICK_STORAGE_KEY);
      if (saved && saved.trim()) {
        syncNickUI(saved.trim());
        return;
      }
    } catch (_) {}
    syncNickUI(randomGuestNick());
  })();

  if (nickBar) {
    nickBar.addEventListener("click", (e) => {
      if (e.target === nickInput || nickInput.contains(e.target)) return;
      e.preventDefault();
      openNickEdit();
    });
  } else if (nickDisplay) {
    nickDisplay.addEventListener("click", openNickEdit);
  }
  nickInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      closeNickEdit(true);
    } else if (e.key === "Escape") {
      closeNickEdit(false);
    }
  });
  nickInput.addEventListener("blur", () => closeNickEdit(true));

  (function initEntrySource() {
    const detected = detectEntrySource();
    if (detected) persistEntrySource(detected);
    updateEntrySourceHint();
  })();

  myClientToken = getClientToken();
  if (getAdminSecret()) {
    adminUnlocked = true;
    const adminBtn = document.getElementById("btn-admin-toggle");
    if (adminBtn) {
      adminBtn.classList.add("is-on");
      adminBtn.textContent = S.adminBtnOn;
    }
  }
  document.getElementById("btn-admin-toggle")?.addEventListener("click", promptAdminSecret);
  msgStream.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-delete-id]");
    if (!btn) return;
    const id = Number(btn.getAttribute("data-delete-id"));
    if (Number.isInteger(id) && id > 0) deleteMessage(id);
  });
  loadMessages();

  contentEl.addEventListener("input", () => {
    charCount.textContent = String(contentEl.value.length);
    autoGrowTextarea();
  });

  contentEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (isPosting) return;
    const text = contentEl.value.trim();
    if (!text) {
      showToast(S.toastEmptyContent);
      contentEl.focus();
      return;
    }
    const source = getCurrentSource();
    const payload = {
      nick: getSendNick(),
      content: text,
      client_token: myClientToken || getClientToken(),
      source_label: source ? source.label : null,
      source_url: source ? source.url : null,
    };

    isPosting = true;
    btnSend.disabled = true;
    try {
      const res = await fetch(API_MESSAGES, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("POST /api/messages failed", res.status, data);
        if (data.error === "rate_limited") {
          showToast(S.toastRateLimit);
        } else if (data.error === "turnstile_failed") {
          showToast(S.toastTurnstile);
        } else if (data.error === "server_not_configured") {
          showToast(S.toastNotConfigured);
        } else if (data.error === "wrong_key_role") {
          showToast(S.toastWrongKey);
        } else if (data.hint) {
          showToast(data.hint);
        } else if (data.error === "insert_failed") {
          showToast(S.toastInsertFail);
        } else {
          showToast(S.toastSendFail);
        }
        return;
      }
      const row = data.message;
      if (row) {
        messages = [...messages, mapApiMessage(row)];
        renderMessages(messages);
      } else {
        await loadMessages();
      }
      contentEl.value = "";
      charCount.textContent = "0";
      contentEl.style.height = "";
      autoGrowTextarea();
      scrollToBottom(true);
      showToast(S.toastPosted);
    } catch (_) {
      showToast(S.toastNetSend);
    } finally {
      isPosting = false;
      btnSend.disabled = false;
    }
  });

  window.addEventListener("load", () => {
    autoGrowTextarea();
  });
})();
