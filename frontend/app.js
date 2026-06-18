// OKF Commons — frontend logic. Resilient: every backend call has a timeout + fallback,
// so the page is still readable and shareable when the backend is asleep.

const CFG = window.CONFIG || { BACKEND_URL: "", EXTENSION_ZIP: "assets/tab-okf-extension.zip" };
const API = (CFG.BACKEND_URL || "").replace(/\/+$/, "");

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function fetchJSON(path, opts = {}, ms = 9000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(API + path, { ...opts, signal: ctrl.signal });
    const body = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, body };
  } finally {
    clearTimeout(t);
  }
}

function cardHTML(doc, { founding = false } = {}) {
  const cls = founding ? "founding-card" : `card ${doc.source === "seed" ? "seed" : ""}`;
  const tag = founding ? "" : "";
  const why = doc.user_intent || doc.inferred_purpose;
  const points = (doc.key_points || []).slice(0, founding ? 6 : 3)
    .map((p) => `<li>${esc(p)}</li>`).join("");
  const tags = (doc.tags || []).slice(0, 6).map((t) => `<span class="tag">${esc(t)}</span>`).join("");
  const who = doc.contributor && doc.contributor !== "ath" ? `banked by ${esc(doc.contributor)}` :
              doc.source === "seed" ? "founding concept" : `banked by ${esc(doc.contributor || "anonymous")}`;
  return `
  <article class="${cls}">
    <div class="card-head">
      <h3><a href="${esc(doc.url)}" target="_blank" rel="noopener">${esc(doc.title)}</a></h3>
      <span class="byline">${who}</span>
    </div>
    ${why ? `<div class="why"><span class="label">${doc.user_intent ? "Why it was kept" : "Inferred purpose"}</span>${esc(why)}</div>` : ""}
    <p class="summary">${esc(doc.summary || doc.description || "")}</p>
    ${points ? `<ul class="points">${points}</ul>` : ""}
    ${tags ? `<div class="tags">${tags}</div>` : ""}
    <p class="src muted"><a href="${esc(doc.url)}" target="_blank" rel="noopener">${esc(doc.host || doc.url)}</a></p>
  </article>`;
}

async function loadCommons() {
  const feed = $("#feed");
  const founding = $("#founding-card");
  const res = await fetchJSON("/api/catalog").catch(() => null);
  if (!res || !res.ok) {
    founding.classList.remove("skeleton");
    founding.innerHTML = cardHTML({
      title: "Zeigarnik effect", url: "https://en.wikipedia.org/wiki/Zeigarnik_effect",
      host: "en.wikipedia.org", source: "seed", contributor: "ath",
      inferred_purpose: "Reference for the Zeigarnik effect — the founding concept of this commons.",
      summary: "The commons backend is asleep right now, so this is the cached founding concept. Contributions reopen when it's back.",
      key_points: ["Unfinished or interrupted tasks may be remembered better than completed ones."],
      tags: ["psychology", "memory"],
    }, { founding: true });
    feed.innerHTML = `<p class="muted">The commons backend is offline at the moment. The page is still here — try again shortly, or grab the extension below to bank to your own machine.</p>`;
    return;
  }
  const docs = res.body.documents || [];
  $("#count").textContent = `· ${docs.length} concept${docs.length === 1 ? "" : "s"}`;
  // The founding/seed concept gets the hero slot; everything else flows into the feed newest-first.
  const seed = docs.find((d) => d.source === "seed") || docs[docs.length - 1];
  founding.classList.remove("skeleton");
  founding.outerHTML = cardHTML(seed, { founding: true });
  const rest = docs.filter((d) => d.concept_id !== seed.concept_id);
  feed.innerHTML = rest.length ? rest.map((d) => cardHTML(d)).join("")
    : `<p class="muted">No community contributions yet — be the first to bank a page above.</p>`;
}

async function loadHealth() {
  const el = $("#health");
  const res = await fetchJSON("/api/health", {}, 6000).catch(() => null);
  if (res && res.ok && res.body.ok) {
    el.className = "health up";
    el.innerHTML = `<span class="dot"></span>commons online · ${res.body.documents} concept(s) · compressing with ${esc(res.body.model)}`;
  } else {
    el.className = "health down";
    el.innerHTML = `<span class="dot"></span>commons backend asleep — the page still works, contributions are paused`;
  }
}

function wireForm() {
  const form = $("#contribute-form");
  const status = $("#form-status");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    status.className = "form-status";
    status.textContent = "Banking…";
    const btn = form.querySelector("button");
    btn.disabled = true;
    try {
      const res = await fetchJSON("/api/contribute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }, 12000);
      if (res.ok || res.status === 202) {
        status.className = "form-status ok";
        status.textContent = res.body.message || "Banked into the commons.";
        form.reset();
        setTimeout(loadCommons, 4000);
        setTimeout(loadCommons, 9000);
      } else {
        status.className = "form-status err";
        status.textContent = res.body.error || `Something went wrong (${res.status}).`;
      }
    } catch (_) {
      status.className = "form-status err";
      status.textContent = "Couldn't reach the commons — it may be asleep. Try again shortly.";
    } finally {
      btn.disabled = false;
    }
  });
}

function wireExtension() {
  const a = $("#ext-download");
  if (a && CFG.EXTENSION_ZIP) a.href = CFG.EXTENSION_ZIP;
}

loadHealth();
loadCommons();
wireForm();
wireExtension();
