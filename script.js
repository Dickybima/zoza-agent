// ---------- Helpers ----------
const $ = (s, el = document) => el.querySelector(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const escapeHtml = (s) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const randHex = (n) => Array.from({ length: n }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
const fmt = (n) => n.toLocaleString("en-US");

$("#year").textContent = new Date().getFullYear();

// ---------- Nav ----------
$("#navToggle").addEventListener("click", () => $("#navLinks").classList.toggle("open"));
$("#navLinks").addEventListener("click", (e) => {
  if (e.target.tagName === "A") $("#navLinks").classList.remove("open");
});

// ---------- Wallet ----------
let wallet = null;
const connectBtn = $("#connectBtn");
async function connectWallet() {
  try {
    if (window.ethereum) {
      const [acc] = await window.ethereum.request({ method: "eth_requestAccounts" });
      wallet = acc;
    } else {
      wallet = "0x" + randHex(40); // demo wallet when no extension is installed
    }
  } catch {
    return null;
  }
  connectBtn.textContent = wallet.slice(0, 6) + "…" + wallet.slice(-4);
  return wallet;
}
connectBtn.addEventListener("click", connectWallet);

// ---------- Hero terminal ----------
const termLines = [
  ['<span class="p">you ›</span> token Test ticker TEST x @test web test.io', 40],
  ['<span class="k">zoza ›</span> understanding intent…', 18],
  ['  name    : Test', 8],
  ['  ticker  : $TEST', 8],
  ['  x       : @test', 8],
  ['  website : test.io', 8],
  ['  tax     : 3% (2% creator · 1% protocol)', 8],
  ['  network : Robinhood Chain', 8],
  ['<span class="k">zoza ›</span> composing smart contract…', 18],
  ['<span class="k">zoza ›</span> deploying to Robinhood Chain…', 18],
  ['<span class="ok">✓ token live in 3.2 seconds</span>', 18],
];
async function runTerm() {
  const el = $("#heroTerm");
  for (;;) {
    el.innerHTML = "";
    for (const [line, speed] of termLines) {
      const row = document.createElement("div");
      el.appendChild(row);
      // type plain text, then swap in the highlighted version
      const plain = line.replace(/<[^>]+>/g, "");
      for (let i = 1; i <= plain.length; i++) {
        row.innerHTML = escapeHtml(plain.slice(0, i)) + '<span class="caret"></span>';
        await sleep(speed);
      }
      row.innerHTML = line;
      await sleep(250);
    }
    await sleep(3500);
  }
}
runTerm();

// ---------- Counters & reveal ----------
const io = new IntersectionObserver(
  (entries) =>
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      en.target.classList.add("in");
      io.unobserve(en.target);
    }),
  { threshold: 0.15 }
);
document.querySelectorAll(".card, .steps li, .phase, .faq details, .network-text, .cta").forEach((el) => {
  el.classList.add("reveal");
  io.observe(el);
});
document.querySelectorAll("[data-count]").forEach((el) => {
  const target = +el.dataset.count;
  const start = performance.now();
  const tick = (t) => {
    const p = Math.min(1, (t - start) / 1600);
    el.textContent = fmt(Math.round(target * (1 - Math.pow(1 - p, 3))));
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

// ---------- Agent ----------
// Creators only provide a name, ticker, X account, and website.
// Fixed 3% tax: 2% to the token creator's wallet, 1% protocol fee.
const CREATOR_FEE = 2;
const PROTOCOL_FEE = 1;
const TAX = CREATOR_FEE + PROTOCOL_FEE;
const SUPPLY = 1_000_000_000;
const FIELDS = ["name", "ticker", "x", "website"];
const QUESTIONS = {
  name: "What would you like to <b>name</b> your token?",
  ticker: "Choose a <b>ticker</b> (2–10 characters), e.g. <code>LBTY</code>.",
  x: "Link your project’s <b>X</b> account — <code>@handle</code> or <code>x.com/handle</code>. Type <code>skip</code> if you don’t have one yet.",
  website: "Finally, what’s the <b>website</b>? Type <code>skip</code> if you don’t have one yet.",
};

const log = $("#chatLog");
const preview = $("#preview");
let draft = null;
let asking = null;
let ready = false;

function addMsg(html, who = "bot") {
  const m = document.createElement("div");
  m.className = "msg " + who;
  m.innerHTML = html;
  log.appendChild(m);
  log.scrollTop = log.scrollHeight;
  return m;
}
async function botSay(html, delay = 700) {
  const t = addMsg('<span class="typing"><span></span><span></span><span></span></span>');
  await sleep(delay);
  t.innerHTML = html;
  log.scrollTop = log.scrollHeight;
  return t;
}

const SKIP = /^(skip|none|n\/a|na|no|not yet|-)$/i;
const X_URL = /(?:https?:\/\/)?(?:www\.)?(?:x|twitter)\.com\/@?([A-Za-z0-9_]{1,15})\/?/i;
const URL_RE = /\b((?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s,]*)?)/i;

const cleanTicker = (v) => v.replace(/^\$/, "").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 10);
const cleanX = (v) => {
  const m = v.match(X_URL) || v.match(/@?([A-Za-z0-9_]{1,15})$/);
  return m ? m[1] : null;
};
const cleanWeb = (v) => {
  const m = v.match(URL_RE);
  return m ? m[1].replace(/^https?:\/\//i, "").replace(/\/$/, "") : null;
};

// Extract fields from free-form text, e.g.
// "create token Liberty ticker LBTY x @liberty web liberty.io"
function parsePrompt(text) {
  const out = {};
  let t = " " + text.trim() + " ";

  const xm = t.match(new RegExp("(?:\\b(?:x|twitter)\\s*:?\\s*)?" + X_URL.source, "i")) || t.match(/\s(?:x|twitter)(?:\s*:\s*|\s+)@?([A-Za-z0-9_]{1,15})\b/i) || t.match(/\s@([A-Za-z0-9_]{1,15})\b/);
  if (xm) {
    out.x = xm[1];
    t = t.replace(xm[0], " ");
  }
  const wm = t.match(/\b(?:website|web|site|url)\s*:?\s*(\S+)/i) || t.match(URL_RE);
  if (wm) {
    const w = cleanWeb(wm[1]);
    if (w) out.website = w;
    t = t.replace(wm[0], " ");
  }
  const tm = t.match(/\b(?:ticker|symbol)\s*:?\s*\$?([A-Za-z0-9]{2,10})\b/i) || t.match(/\$([A-Za-z0-9]{2,10})\b/);
  if (tm) {
    out.ticker = cleanTicker(tm[1]);
    t = t.replace(tm[0], " ");
  }
  const nm = t.match(/\b(?:token\s+(?:named|called)|named|called|name|token)\s+["“]?([A-Za-z0-9][A-Za-z0-9 \-]{0,30}?)["”]?\s*(?=\s*(?:,|\.|$)|\s+(?:and|with|ticker|symbol|supply|x|twitter|web|website|site|url)\b)/i);
  if (nm) out.name = nm[1].trim();

  // "ZetaCoin ZETA" → name ZetaCoin, ticker ZETA
  if (out.name && !out.ticker) {
    const parts = out.name.split(/\s+/);
    const last = parts[parts.length - 1];
    if (parts.length > 1 && /^[A-Z0-9]{2,10}$/.test(last)) {
      out.ticker = last;
      out.name = parts.slice(0, -1).join(" ");
    }
  }
  return out;
}

// Direct answer to the agent's current question
function parseAnswer(field, text) {
  const v = text.trim();
  if ((field === "x" || field === "website") && SKIP.test(v)) return { [field]: null };
  if (field === "name") return v.length <= 32 ? { name: v.replace(/^["“]|["”]$/g, "") } : {};
  if (field === "ticker") {
    const tk = cleanTicker(v);
    return tk.length >= 2 ? { ticker: tk } : {};
  }
  if (field === "x") {
    const x = cleanX(v);
    return x ? { x } : {};
  }
  if (field === "website") {
    const w = cleanWeb(v);
    return w ? { website: w } : {};
  }
  return {};
}

const nextMissing = () => FIELDS.find((f) => !(f in draft));
const shortAddr = (a) => a.slice(0, 6) + "…" + a.slice(-4);

function colorFor(s) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `linear-gradient(135deg, hsl(${h} 90% 65%), hsl(${(h + 70) % 360} 85% 55%))`;
}

function renderPreview(tok, status = "Draft — awaiting confirmation", live = false) {
  const name = tok.name || "New token";
  const ticker = tok.ticker || "—";
  const pending = (f) => (f in tok ? tok[f] || "—" : "…");
  const rows = [
    ["Name", tok.name || "…"],
    ["Ticker", tok.ticker ? "$" + tok.ticker : "…"],
    ["X", "x" in tok ? (tok.x ? "@" + tok.x : "—") : "…"],
    ["Website", pending("website")],
    ["Buy & sell tax", TAX + "%"],
    [`Creator fee (${CREATOR_FEE}%)`, wallet ? shortAddr(wallet) : "Creator wallet"],
    [`Protocol fee (${PROTOCOL_FEE}%)`, "Protocol"],
    ["Total supply", fmt(SUPPLY)],
    ["Network", "Robinhood Chain"],
  ];
  if (tok.address) rows.push(["Contract address", tok.address.slice(0, 10) + "…" + tok.address.slice(-6)]);
  preview.innerHTML = `
    <div class="token-head">
      <div class="token-logo" style="background:${colorFor(ticker + name)}">${escapeHtml((tok.ticker || name).slice(0, 2).toUpperCase())}</div>
      <div><h3>${escapeHtml(name)}</h3><small>${tok.ticker ? "$" + escapeHtml(ticker) : "ticker pending"}</small></div>
    </div>
    <dl class="kv">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${escapeHtml(String(v))}</dd></div>`).join("")}</dl>
    <div class="status ${live ? "live" : ""}">${status}</div>`;
}

async function askNext() {
  const f = nextMissing();
  if (f) {
    asking = f;
    renderPreview(draft, "Draft — gathering details");
    return botSay(QUESTIONS[f]);
  }
  asking = null;
  ready = true;
  renderPreview(draft);
  const recipient = wallet ? `<code>${shortAddr(wallet)}</code>` : "the wallet you launch from";
  const m = await botSay(
    `Your token blueprint is ready:<br>
     • Name: <b>${escapeHtml(draft.name)}</b><br>
     • Ticker: <b>$${escapeHtml(draft.ticker)}</b><br>
     • X: <b>${draft.x ? "@" + escapeHtml(draft.x) : "—"}</b><br>
     • Website: <b>${draft.website ? escapeHtml(draft.website) : "—"}</b><br>
     • Tax: <b>${TAX}%</b> on every buy & sell — <b>${CREATOR_FEE}%</b> flows to ${recipient}, <b>${PROTOCOL_FEE}%</b> as a protocol fee<br>
     Launch now? You can still refine any detail, e.g. <code>ticker ABC</code>.
     <div class="actions"><button class="btn btn-primary" data-act="deploy">Launch</button><button class="btn btn-ghost" data-act="cancel">Cancel</button></div>`,
    900
  );
  m.querySelector('[data-act="deploy"]').onclick = () => handle("Launch");
  m.querySelector('[data-act="cancel"]').onclick = () => handle("Cancel");
}

async function handle(text) {
  addMsg(escapeHtml(text), "user");
  const lower = text.trim().toLowerCase();

  if (draft && /^(cancel|stop|abort)\b/.test(lower)) {
    draft = null;
    asking = null;
    ready = false;
    return botSay("Understood — draft discarded. Tell me about the next token you’d like to create.");
  }
  if (/^(yes|y|ok|okay|deploy|launch|confirm|go|let'?s go)$/.test(lower)) {
    if (ready) return deploy();
    if (asking) return botSay("Almost there — a few details are still missing. " + QUESTIONS[asking]);
  }

  const p = parsePrompt(text);
  const found = Object.keys(p).length > 0;

  if (!draft) {
    if (!found) {
      draft = {};
      Object.assign(draft, parseAnswer("name", text));
      if (!draft.name) {
        draft = null;
        return botSay(QUESTIONS.name);
      }
    } else draft = p;
  } else if (p.name && ready && /\btoken\b/i.test(text)) {
    draft = p; // "token ..." after the summary starts a new token; "name ..." renames
  } else if (found) {
    Object.assign(draft, p);
  } else if (asking) {
    const a = parseAnswer(asking, text);
    if (!Object.keys(a).length) return botSay("That format doesn’t look quite right. " + QUESTIONS[asking]);
    Object.assign(draft, a);
  } else {
    return botSay(
      "To refine a detail, try <code>name Liberty</code>, <code>ticker LBTY</code>, <code>x @liberty</code>, or <code>web liberty.io</code>. Type <code>launch</code> when you’re ready."
    );
  }

  ready = false;
  return askNext();
}

async function deploy() {
  const tok = draft;
  draft = null;
  ready = false;
  if (!wallet) {
    await botSay("Connecting your wallet first…", 500);
    await connectWallet();
    if (!wallet) return botSay("Wallet not connected. Please try again.");
  }
  const steps = [
    "🧠 Composing your smart contract from audited architecture…",
    `💸 Routing the ${CREATOR_FEE}% creator fee to ${shortAddr(wallet)} and ${PROTOCOL_FEE}% to the protocol…`,
    "🔗 Embedding your X and website links in token metadata…",
    "✍️ Awaiting your transaction signature…",
    "🚀 Broadcasting to Robinhood Chain…",
  ];
  for (const s of steps) {
    renderPreview(tok, s.replace(/^\S+\s/, ""));
    await botSay(s, 650);
  }
  tok.address = "0x" + randHex(40);
  const tx = "0x" + randHex(64);
  renderPreview(tok, "● LIVE on Robinhood Chain (demo)", true);
  publishToExplore({ ...tok, creator: wallet, tx, createdAt: Date.now() });
  const done = await botSay(
    `✅ <b>${escapeHtml(tok.name)}</b> ($${escapeHtml(tok.ticker)}) is officially live!<br>
     Contract: <code>${tok.address}</code><br>
     Tx: <code>${tx.slice(0, 18)}…</code><br>
     Of the ${TAX}% tax on every trade, ${CREATOR_FEE}% now flows to <code>${shortAddr(wallet)}</code> and ${PROTOCOL_FEE}% goes to the protocol.<br>
     <div class="actions"><a class="btn btn-ghost" href="#explore">View in Explore →</a></div>
     <small class="muted">*This is a simulation — the address and hash above are not real transactions.</small>`,
    900
  );
  done.querySelector('a[href="#explore"]').onclick = () => (exploreSearch.value = "", renderExplore(tok.address));
}

// ---------- Explore ----------
// Every token launched through the agent is published here automatically.
// The demo keeps the feed in localStorage; in production this would be
// read from the launch contract's events on Robinhood Chain.
const STORE_KEY = "zoza.tokens.v1";
const exploreGrid = $("#exploreGrid");
const exploreSearch = $("#exploreSearch");
const exploreSort = $("#exploreSort");
const exploreCount = $("#exploreCount");
let freshAddress = null;

function loadTokens() {
  try {
    const list = JSON.parse(localStorage.getItem(STORE_KEY) || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}
let tokens = loadTokens();

function publishToExplore(tok) {
  tokens.push(tok);
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(tokens));
  } catch {}
  renderExplore(tok.address);
}

function timeAgo(ts) {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return "just now";
  const units = [["d", 86400], ["h", 3600], ["m", 60]];
  for (const [u, n] of units) if (s >= n) return Math.floor(s / n) + u + " ago";
}

function tokenCard(t) {
  const x = t.x ? `<a href="https://x.com/${encodeURIComponent(t.x)}" target="_blank" rel="noopener noreferrer">𝕏 @${escapeHtml(t.x)}</a>` : "";
  const web = t.website ? `<a href="https://${encodeURI(t.website)}" target="_blank" rel="noopener noreferrer">🌐 Website</a>` : "";
  return `
    <article class="token-card ${t.address === freshAddress ? "fresh" : ""}" data-address="${t.address}">
      ${t.address === freshAddress ? '<span class="badge">NEW</span>' : ""}
      <div class="token-head">
        <div class="token-logo" style="background:${colorFor(t.ticker + t.name)}">${escapeHtml(t.ticker.slice(0, 2))}</div>
        <div style="min-width:0"><h3>${escapeHtml(t.name)}</h3><small>$${escapeHtml(t.ticker)}</small></div>
      </div>
      <dl class="token-meta">
        <div><dt>Contract</dt><dd>${shortAddr(t.address)}</dd></div>
        <div><dt>Creator</dt><dd>${shortAddr(t.creator)}</dd></div>
        <div><dt>Tax</dt><dd>${TAX}% · ${CREATOR_FEE}% creator</dd></div>
        <div><dt>Launched</dt><dd>${timeAgo(t.createdAt)}</dd></div>
      </dl>
      <div class="token-links">${x}${web}<button type="button" data-copy="${t.address}">Copy contract</button></div>
    </article>`;
}

function renderExplore(highlight) {
  if (highlight) freshAddress = highlight;
  const q = exploreSearch.value.trim().toLowerCase();
  let list = tokens.filter((t) => !q || [t.name, t.ticker, t.address].some((v) => v.toLowerCase().includes(q)));
  const sort = exploreSort.value;
  list.sort((a, b) => (sort === "az" ? a.name.localeCompare(b.name) : sort === "old" ? a.createdAt - b.createdAt : b.createdAt - a.createdAt));

  exploreCount.hidden = tokens.length === 0;
  exploreCount.textContent = tokens.length;

  if (!tokens.length) {
    exploreGrid.innerHTML = `<div class="explore-empty"><p>No tokens yet. The first launch through Zoza will appear here.</p><a href="#agent" class="btn btn-primary">Launch the first one →</a></div>`;
  } else if (!list.length) {
    exploreGrid.innerHTML = `<div class="explore-empty"><p>No tokens match “${escapeHtml(q)}”.</p></div>`;
  } else {
    exploreGrid.innerHTML = list.map(tokenCard).join("");
  }
}

exploreSearch.addEventListener("input", () => renderExplore());
exploreSort.addEventListener("change", () => renderExplore());
exploreGrid.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-copy]");
  if (!btn) return;
  try {
    await navigator.clipboard.writeText(btn.dataset.copy);
    btn.textContent = "Copied ✓";
  } catch {
    btn.textContent = btn.dataset.copy;
  }
  setTimeout(() => (btn.textContent = "Copy contract"), 1600);
});
// keep other open tabs in sync and refresh the "x ago" labels
window.addEventListener("storage", (e) => {
  if (e.key === STORE_KEY) {
    tokens = loadTokens();
    renderExplore();
  }
});
setInterval(() => renderExplore(), 60_000);
renderExplore();

$("#chatForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const v = $("#chatInput").value.trim();
  if (!v) return;
  $("#chatInput").value = "";
  handle(v);
});
$("#chips").addEventListener("click", (e) => {
  if (e.target.tagName === "BUTTON") handle(e.target.textContent);
});

addMsg(`Welcome. I’m <b>Zoza</b> — the agent that turns your ideas into tokens on <b>Robinhood Chain</b>. Just share a <b>name</b>, <b>ticker</b>, <b>X</b> account, and <b>website</b>. Of the ${TAX}% tax on every trade, ${CREATOR_FEE}% flows straight to your wallet.`);
