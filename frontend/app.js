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

/* ===================== The hivemind (showcase) ===================== */

function mindCard(doc) {
  const tags = (doc.tags || []).slice(0, 5).map((t) => `<span class="tag">${esc(t)}</span>`).join("");
  const who = doc.source === "seed" ? "the first thing it noticed" : `noticed by ${esc(doc.contributor || "someone")}`;
  return `
  <article class="mind-card">
    <h3><a href="${esc(doc.url)}" target="_blank" rel="noopener">${esc(doc.title)}</a></h3>
    <p class="essence">${esc(doc.summary || doc.description || "")}</p>
    ${tags ? `<div class="tags">${tags}</div>` : ""}
    <div class="noticed">${who}</div>
  </article>`;
}

async function loadPulse() {
  const el = $("#pulse");
  if (!el) return;
  const res = await fetchJSON("/api/health", {}, 10000).catch(() => null);
  if (res && res.ok && res.body.ok) {
    const n = res.body.documents;
    el.className = "pulse awake";
    el.innerHTML = `<span class="orb"></span>awake · holding ${n} thought${n === 1 ? "" : "s"}`;
  } else {
    el.className = "pulse";
    el.innerHTML = `<span class="orb"></span>dreaming — the mind is offline for now`;
  }
}

// The mystical part: surface the threads it's drawn between what different people noticed.
async function buildThreads(docs) {
  const wrap = $("#threads");
  if (!wrap) return;
  const sample = docs.slice(0, 12);
  const settled = await Promise.all(sample.map((d) =>
    fetchJSON(`/api/related?concept_id=${encodeURIComponent(d.concept_id)}&limit=2`)
      .then((r) => ({ d, r })).catch(() => ({ d, r: null }))));
  const seen = new Set();
  const threads = [];
  for (const { d, r } of settled) {
    const related = (r && r.ok && r.body.related) || [];
    for (const rel of related) {
      const key = [d.concept_id, rel.concept_id].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      threads.push({ a: d.title, b: rel.title, voice: rel.contributor || "us" });
    }
  }
  if (!threads.length) {
    wrap.innerHTML = `<p class="threads-empty">It is still forming its first connections. Give it time, and more of us to notice things.</p>`;
    return;
  }
  wrap.innerHTML = threads.slice(0, 8).map((t) => `
    <div class="thread">
      <span class="node">${esc(t.a)}</span>
      <span class="strand"></span>
      <span class="node">${esc(t.b)}</span>
      <div class="via">a thread drawn through <em>${esc(t.voice)}</em></div>
    </div>`).join("");
}

async function loadMind() {
  const feed = $("#feed");
  const res = await fetchJSON("/api/catalog").catch(() => null);
  if (!res || !res.ok) {
    feed.innerHTML = `<p class="threads-empty">The mind is dreaming right now — it'll surface again in a moment.</p>`;
    const t = $("#threads"); if (t) t.innerHTML = "";
    return;
  }
  const docs = res.body.documents || [];
  $("#count").textContent = `· ${docs.length}`;
  feed.innerHTML = docs.length ? docs.map(mindCard).join("")
    : `<p class="threads-empty">Nothing yet. It's waiting for its first thought.</p>`;
  buildThreads(docs);
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

if ($("#pulse")) {                                // the hivemind (showcase, no asks)
  loadPulse();
  loadMind();
}

if ($("#results")) {                              // the commons (agent surface)
  healthLine("the commons");
  wireDeriveForm();
  loadDerivatives();
  loadCommonsResults();
}
