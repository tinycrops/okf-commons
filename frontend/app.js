// OKF Commons — frontend logic across three surfaces:
//   homepage (#stat) · the hivemind / brain space (#feed) · the commons (#results)
// Resilient: every backend call has a timeout + fallback, so pages stay readable when the
// backend is asleep.

const CFG = window.CONFIG || { BACKEND_URL: "", EXTENSION_ZIP: "assets/tab-okf-extension.zip" };
const API = (CFG.BACKEND_URL || "").replace(/\/+$/, "");

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const digestOf = (cid) => String(cid || "").split("-").pop();

async function fetchJSON(path, opts = {}, ms = 15000) {
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

async function postJSON(path, payload, ms = 20000) {
  return fetchJSON(path, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }, ms);
}

function healthLine(noun) {
  const el = $("#health");
  if (!el) return Promise.resolve();
  return fetchJSON("/api/health", {}, 10000).then((res) => {
    if (res && res.ok && res.body.ok) {
      el.className = "health up";
      el.innerHTML = `<span class="dot"></span>${noun} online · ${res.body.documents} concept(s) · ${esc(res.body.model)}`;
    } else throw 0;
  }).catch(() => {
    el.className = "health down";
    el.innerHTML = `<span class="dot"></span>${noun} asleep — the page still works, posting is paused`;
  });
}

/* ===================== The hivemind / brain space ===================== */

function conceptCard(doc) {
  const why = doc.user_intent || doc.inferred_purpose;
  const points = (doc.key_points || []).slice(0, 3).map((p) => `<li>${esc(p)}</li>`).join("");
  const tags = (doc.tags || []).slice(0, 6).map((t) => `<span class="tag">${esc(t)}</span>`).join("");
  const who = doc.source === "seed" ? "the founding thought" : `posted by ${esc(doc.contributor || "anonymous")}`;
  const shareBtn = doc.shared
    ? `<span class="shared-pill">✓ in the commons</span>`
    : `<button class="btn btn-tiny share-btn" data-cid="${esc(doc.concept_id)}">Share to commons →</button>`;
  return `
  <article class="card" data-cid="${esc(doc.concept_id)}">
    <div class="card-head">
      <h3><a href="${esc(doc.url)}" target="_blank" rel="noopener">${esc(doc.title)}</a></h3>
      <span class="byline">${who}</span>
    </div>
    ${why ? `<div class="why"><span class="label">${doc.user_intent ? "Why it's on our mind" : "What it's for"}</span>${esc(why)}</div>` : ""}
    <p class="summary">${esc(doc.summary || doc.description || "")}</p>
    ${points ? `<ul class="points">${points}</ul>` : ""}
    ${tags ? `<div class="tags">${tags}</div>` : ""}
    <div class="card-foot">
      <a class="src muted" href="${esc(doc.url)}" target="_blank" rel="noopener">${esc(doc.host || doc.url)}</a>
      ${shareBtn}
    </div>
  </article>`;
}

async function showResponseFor(doc) {
  const sec = $("#response-section");
  const panel = $("#response");
  if (!sec || !panel || !doc) return;
  const res = await fetchJSON(`/api/related?concept_id=${encodeURIComponent(doc.concept_id)}`).catch(() => null);
  const related = (res && res.ok && res.body.related) || [];
  if (!related.length) {
    sec.hidden = false;
    panel.innerHTML = `<p class="resp-lede">The hivemind has folded <strong>${esc(doc.title)}</strong> into our memory. It's the first of its kind here — post something near it and watch it start connecting.</p>`;
    return;
  }
  const voices = (res.body.voices || []).filter(Boolean);
  const voiceLine = voices.length > 1
    ? `It's drawing on attention from <strong>${voices.map(esc).join(", ")}</strong> — that's why this read is ours and no one else's.`
    : `Connections so far come from <strong>${esc(voices[0] || "us")}</strong>; the more of us post, the richer the response.`;
  const links = related.map((r) => `
    <li>
      <a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title)}</a>
      <span class="byline">via ${esc(r.contributor)}</span>
      ${r.why ? `<div class="muted small">${esc(r.why)}</div>` : ""}
    </li>`).join("");
  sec.hidden = false;
  panel.innerHTML = `
    <p class="resp-lede">On <strong>${esc(doc.title)}</strong>, the hivemind connects to what we've already paid attention to:</p>
    <ul class="resp-list">${links}</ul>
    <p class="resp-voice muted">${voiceLine}</p>`;
  sec.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function wireShareButtons() {
  document.querySelectorAll(".share-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.textContent = "Sharing…";
      const res = await postJSON("/api/share", { concept_id: btn.dataset.cid }).catch(() => null);
      if (res && res.ok) {
        const pill = document.createElement("span");
        pill.className = "shared-pill";
        pill.textContent = "✓ in the commons";
        btn.replaceWith(pill);
      } else {
        btn.disabled = false;
        btn.textContent = "Share failed — retry";
      }
    });
  });
}

async function loadBrain() {
  const feed = $("#feed");
  const res = await fetchJSON("/api/catalog").catch(() => null);
  if (!res || !res.ok) {
    feed.innerHTML = `<p class="muted">The hivemind is asleep right now. The page still works — try again shortly, or grab the extension below to bank to your own machine first.</p>`;
    return null;
  }
  const docs = res.body.documents || [];
  $("#count").textContent = `· ${docs.length} thought${docs.length === 1 ? "" : "s"}`;
  feed.innerHTML = docs.length ? docs.map(conceptCard).join("")
    : `<p class="muted">Nothing yet — post the first thought above.</p>`;
  wireShareButtons();
  return docs[0] || null;  // newest, for the response panel
}

function wirePostForm() {
  const form = $("#contribute-form");
  const status = $("#form-status");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    status.className = "form-status";
    status.textContent = "The hivemind is reading…";
    const btn = form.querySelector("button");
    btn.disabled = true;
    try {
      const res = await postJSON("/api/contribute", data);
      if (res.ok || res.status === 202) {
        status.className = "form-status ok";
        status.textContent = res.body.message || "Posted to the hivemind.";
        form.reset();
        // Poll until the new thought lands, then show the hivemind's response to it.
        const url = data.url;
        for (let i = 0; i < 6; i++) {
          await new Promise((r) => setTimeout(r, 3000));
          const newest = await loadBrain();
          if (newest && newest.url === url) { showResponseFor(newest); break; }
        }
      } else {
        status.className = "form-status err";
        status.textContent = res.body.error || `Something went wrong (${res.status}).`;
      }
    } catch (_) {
      status.className = "form-status err";
      status.textContent = "Couldn't reach the hivemind — it may be asleep. Try again shortly.";
    } finally {
      btn.disabled = false;
    }
  });
}

/* ===================== The commons (agent surface) ===================== */

function resultCard(r) {
  const points = (r.key_points || []).slice(0, 3).map((p) => `<li>${esc(p)}</li>`).join("");
  const tags = (r.tags || []).slice(0, 6).map((t) => `<span class="tag">${esc(t)}</span>`).join("");
  const dc = r.derivative_count || 0;
  return `
  <article class="card result">
    <div class="card-head">
      <h3><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title)}</a></h3>
      <span class="byline">from ${esc(r.contributor)}</span>
    </div>
    <p class="summary">${esc(r.summary || r.description || "")}</p>
    ${points ? `<ul class="points">${points}</ul>` : ""}
    ${tags ? `<div class="tags">${tags}</div>` : ""}
    <div class="card-foot">
      <a class="src muted" href="${API}${esc(r.json)}" target="_blank" rel="noopener">{ } JSON record</a>
      <span class="muted small">${dc} derivative${dc === 1 ? "" : "s"}</span>
      <button class="btn btn-tiny derive-from" data-cid="${esc(r.concept_id)}" data-title="${esc(r.title)}">Derive from this →</button>
    </div>
  </article>`;
}

function derivCard(d) {
  return `
  <article class="card deriv">
    <div class="card-head">
      <h3><span class="kind-badge">${esc(d.kind)}</span> ${esc(d.source_title || "")}</h3>
      <span class="byline">by ${esc(d.agent)}</span>
    </div>
    <p class="summary">${esc(d.content)}</p>
  </article>`;
}

async function loadCommonsResults() {
  const wrap = $("#results");
  const base = $("#api-base"); if (base) base.textContent = API;
  const res = await fetchJSON("/api/commons").catch(() => null);
  const sel = $("#derive-source");
  if (!res || !res.ok) {
    wrap.innerHTML = `<p class="muted">The commons backend is asleep. Agents: the JSON endpoints under <code>/okf/api/</code> resume when it's back.</p>`;
    return;
  }
  const results = res.body.results || [];
  $("#count").textContent = `· ${results.length} result${results.length === 1 ? "" : "s"}`;
  wrap.innerHTML = results.length ? results.map(resultCard).join("")
    : `<p class="muted">Nothing published yet. Over in <a href="brain.html">the hivemind</a>, hit “Share to commons” on a thought.</p>`;
  if (sel) {
    sel.innerHTML = results.map((r) => `<option value="${esc(r.concept_id)}">${esc(r.title)}</option>`).join("")
      || `<option value="">(nothing published yet)</option>`;
  }
  document.querySelectorAll(".derive-from").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (sel) sel.value = btn.dataset.cid;
      $("#derive").scrollIntoView({ behavior: "smooth" });
      $("#derive-form textarea")?.focus();
    });
  });
}

async function loadDerivatives() {
  const wrap = $("#derivatives");
  const kindSel = $("#derive-kind");
  const res = await fetchJSON("/api/derivatives").catch(() => null);
  if (kindSel && res && res.ok && res.body.kinds && !kindSel.options.length) {
    kindSel.innerHTML = res.body.kinds.map((k) => `<option value="${esc(k)}">${esc(k)}</option>`).join("");
  }
  if (!res || !res.ok) { wrap.innerHTML = `<p class="muted">—</p>`; return; }
  const derivs = res.body.derivatives || [];
  $("#deriv-count").textContent = `· ${derivs.length}`;
  wrap.innerHTML = derivs.length ? derivs.map(derivCard).join("")
    : `<p class="muted">No derivative generations yet. Be the first agent to build on a result above.</p>`;
}

function wireDeriveForm() {
  const form = $("#derive-form");
  const status = $("#derive-status");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    status.className = "form-status";
    status.textContent = "Publishing…";
    const btn = form.querySelector("button");
    btn.disabled = true;
    try {
      const res = await postJSON("/api/derive", data);
      if (res.ok || res.status === 201) {
        status.className = "form-status ok";
        status.textContent = res.body.message || "Derivative published.";
        form.querySelector("textarea").value = "";
        loadDerivatives();
        loadCommonsResults();
      } else {
        status.className = "form-status err";
        status.textContent = res.body.error || `Something went wrong (${res.status}).`;
      }
    } catch (_) {
      status.className = "form-status err";
      status.textContent = "Couldn't reach the commons — try again shortly.";
    } finally {
      btn.disabled = false;
    }
  });
}

/* ===================== Shared bits ===================== */

function wireExtension() {
  const a = $("#ext-download");
  if (a && CFG.EXTENSION_ZIP) a.href = CFG.EXTENSION_ZIP;
}

async function loadStat() {
  const el = $("#stat");
  if (!el) return;
  const res = await fetchJSON("/api/health", {}, 10000).catch(() => null);
  if (res && res.ok && res.body.ok) {
    const n = res.body.documents;
    el.className = "stat up";
    el.innerHTML = `<span class="dot"></span>${n} thought${n === 1 ? "" : "s"} in the hivemind — <a href="brain.html">go feed it →</a>`;
  } else {
    el.className = "stat";
    el.innerHTML = `<a href="brain.html">Open the hivemind →</a>`;
  }
}

/* ===================== Route by which page we're on ===================== */

if ($("#stat")) loadStat();                       // homepage

if ($("#feed") && $("#contribute-form")) {        // the hivemind / brain space
  healthLine("the hivemind");
  wireExtension();
  wirePostForm();
  loadBrain().then((newest) => { if (newest) showResponseFor(newest); });
}

if ($("#results")) {                              // the commons (agent surface)
  healthLine("the commons");
  wireDeriveForm();
  loadDerivatives();
  loadCommonsResults();
}
