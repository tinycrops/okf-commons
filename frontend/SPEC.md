# OKF Mini — "Summarize & Close" — SPEC

A deliberately tiny browser extension. **One button: it summarizes the current tab into our
shared OKF memory, then closes the tab.** Nothing else. No options to learn, no DOM scraping,
no local server to run — the heavy lifting (fetching the page, compressing it into an Open
Knowledge Format concept) happens on the backend.

This is the friend-onboarding version of the full Tab-OKF extension. Build it in two minutes,
or hand this spec to your coding agent and let it build it.

---

## What it does

1. You're on a page you'd otherwise leave open "to deal with later."
2. You click the toolbar button (or press **Ctrl+Shift+S**).
3. The extension sends that page's URL to the OKF Commons backend, which fetches it,
   compresses it into a concept (title, summary, *why it mattered*, tags), and folds it into
   the shared hivemind.
4. The tab closes. A ✓ flashes on the icon. The thing is remembered; your screen is clean.

That's the whole product. The reward is the **close**, not the hoard.

## Design choices (why it's this small)

- **No content script / no scraping.** The backend fetches the URL itself, so the extension
  needs no `scripting` permission and no host access to the pages you visit.
- **Server-side summarize.** Works for any public web page. (Tradeoff: pages behind a login
  or rendered entirely by JavaScript may summarize poorly — that's what the full extension's
  DOM capture is for. Fine for articles, repos, docs, threads.)
- **One endpoint.** Everything routes through `POST /api/contribute`, which is already
  public, rate-limited, and SSRF-guarded.

---

## The endpoint contract

```
POST https://ath-ms-7a73.tail6017fa.ts.net/okf/api/contribute
Content-Type: application/json

{
  "url": "https://...",          // required — the page to bank (public http/https only)
  "contributor": "your name",    // optional — the "voice" the hivemind credits
  "intent": "why this matters"   // optional — strongest signal, but omitted in the mini version
}
```

Returns **202 Accepted** instantly (it summarizes in the background). Rate limit: ~5 banks
per minute. The banked concept shows up at <https://tinycrops.github.io/okf-commons/brain.html>.

---

## The three files

### `manifest.json`
```json
{
  "manifest_version": 3,
  "name": "OKF Mini — Summarize & Close",
  "version": "1.0.0",
  "description": "Bank the current tab into your shared OKF memory, then close it.",
  "permissions": ["activeTab", "storage"],
  "host_permissions": ["https://ath-ms-7a73.tail6017fa.ts.net/*"],
  "background": { "service_worker": "background.js" },
  "action": { "default_title": "Bank & close this tab (Ctrl+Shift+S)" },
  "options_page": "options.html",
  "commands": {
    "bank-and-close": {
      "suggested_key": { "default": "Ctrl+Shift+S" },
      "description": "Bank & close the current tab"
    }
  }
}
```

### `background.js`
```js
const BACKEND = "https://ath-ms-7a73.tail6017fa.ts.net/okf";

async function badge(text, color) {
  await chrome.action.setBadgeBackgroundColor({ color: color || "#c9821f" });
  await chrome.action.setBadgeText({ text });
}

async function bank(tab) {
  if (!tab || !tab.url || !/^https?:/i.test(tab.url)) return;
  const { contributor } = await chrome.storage.sync.get("contributor");
  await badge("…");
  try {
    const r = await fetch(BACKEND + "/api/contribute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: tab.url, contributor: contributor || "" }),
    });
    if (r.ok) {            // 202 — accepted
      await badge("✓", "#3f9e57");
      await chrome.tabs.remove(tab.id);
    } else {
      await badge("!", "#c2533f");   // e.g. 429 rate-limited — slow down, don't close
    }
  } catch (e) {
    await badge("x", "#c2533f");      // backend unreachable — tab stays open, nothing lost
  }
  setTimeout(() => badge(""), 2500);
}

// Toolbar click
chrome.action.onClicked.addListener(bank);

// Keyboard shortcut
chrome.commands.onCommand.addListener(async (cmd) => {
  if (cmd !== "bank-and-close") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  bank(tab);
});
```

### `options.html`
```html
<!doctype html>
<meta charset="utf-8" />
<title>OKF Mini</title>
<style>
  body{font:15px system-ui;margin:32px;max-width:420px;color:#23201b}
  input{width:100%;padding:9px;border:1px solid #ccc;border-radius:8px;font-size:15px}
  button{margin-top:12px;padding:9px 16px;border:0;border-radius:8px;background:#c9821f;color:#fff;font-weight:600;cursor:pointer}
  .ok{color:#3f9e57;margin-left:10px}
</style>
<h2>OKF Mini</h2>
<p>Your name is credited as the "voice" on everything you bank. Optional.</p>
<input id="name" placeholder="your name" />
<div><button id="save">Save</button><span id="ok" class="ok"></span></div>
<script>
  chrome.storage.sync.get("contributor", ({ contributor }) => {
    document.getElementById("name").value = contributor || "";
  });
  document.getElementById("save").onclick = () => {
    chrome.storage.sync.set({ contributor: document.getElementById("name").value.trim() }, () => {
      document.getElementById("ok").textContent = "saved ✓";
    });
  };
</script>
```

---

## Install (2 minutes, Chrome / Edge / Brave)

1. Make a new folder, e.g. `okf-mini/`. Put the three files above inside it.
2. Go to `chrome://extensions`.
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** → select the `okf-mini/` folder.
5. (Optional) Click the extension's **Details → Extension options** and set your name.
6. Pin the icon. Now: on any page, click it (or press **Ctrl+Shift+S**) to bank & close.

That's it. Everything you bank appears in the shared hivemind at
<https://tinycrops.github.io/okf-commons/>.

## Notes
- Needs the OKF Commons backend to be running (it's hosted on the maintainer's machine via
  Tailscale Funnel). If it's asleep you'll see an `x` badge and the tab stays open — nothing
  is lost.
- Want the *why* captured too, plus offline DOM capture for login/JS pages? That's the full
  Tab-OKF extension — ask the maintainer.
