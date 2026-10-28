// ---------- Helpers ----------
const $ = (s, el = document) => el.querySelector(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const escapeHtml = (s) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const randHex = (n) => Array.from({ length: n }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
const fmt = (n) => n.toLocaleString("id-ID");

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
      wallet = "0x" + randHex(40); // wallet demo bila tidak ada extension
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
  ['<span class="p">you ›</span> token Nusantara ticker NUSA x @nusantara web nusantara.io', 40],
  ['<span class="k">zoza ›</span> memahami permintaan…', 18],
  ['  name    : Nusantara', 8],
  ['  ticker  : $NUSA', 8],
  ['  x       : @nusantara', 8],
  ['  website : nusantara.io', 8],
  ['  tax     : 3% → wallet pembuat', 8],
  ['  network : Robinhood Chain', 8],
  ['<span class="k">zoza ›</span> menyusun smart contract…', 18],
  ['<span class="k">zoza ›</span> deploy ke Robinhood Chain…', 18],
  ['<span class="ok">✓ token live dalam 3,2 detik</span>', 18],
];
async function runTerm() {
  const el = $("#heroTerm");
  for (;;) {
    el.innerHTML = "";
    for (const [line, speed] of termLines) {
      const row = document.createElement("div");
      el.appendChild(row);
      // ketik teks polos lalu ganti dengan versi berwarna
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
// Kreator cukup mengisi nama, ticker, X, dan website.
// Pajak tetap 3% dan seluruh fee mengalir ke wallet pembuat token.
const TAX = 3;
const SUPPLY = 1_000_000_000;
const FIELDS = ["name", "ticker", "x", "website"];
const QUESTIONS = {
  name: "Apa <b>nama</b> token yang ingin kamu ciptakan?",
  ticker: "Pilih <b>ticker</b>-nya (2–10 karakter), misalnya <code>NUSA</code>.",
  x: "Tautkan akun <b>X</b> proyekmu — <code>@handle</code> atau <code>x.com/handle</code>. Ketik <code>lewati</code> bila belum ada.",
  website: "Terakhir, alamat <b>website</b>-nya? Ketik <code>lewati</code> bila belum ada.",
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

const SKIP = /^(lewati|skip|tidak ada|ga ada|gak ada|belum ada|-)$/i;
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

// Ambil field dari kalimat bebas, mis.
// "buat token Nusantara ticker NUSA x @nusa web nusa.io"
function parsePrompt(text) {
  const out = {};
  let t = " " + text.trim() + " ";

  const xm = t.match(new RegExp("(?:\\b(?:x|twitter)\\s*:?\\s*)?" + X_URL.source, "i")) || t.match(/\s(?:x|twitter)(?:\s*:\s*|\s+)@?([A-Za-z0-9_]{1,15})\b/i) || t.match(/\s@([A-Za-z0-9_]{1,15})\b/);
  if (xm) {
    out.x = xm[1];
    t = t.replace(xm[0], " ");
  }
  const wm = t.match(/\b(?:website|web|situs|site)\s*:?\s*(\S+)/i) || t.match(URL_RE);
  if (wm) {
    const w = cleanWeb(wm[1]);
    if (w) out.website = w;
    t = t.replace(wm[0], " ");
  }
  const tm = t.match(/\b(?:ticker|simbol|symbol)\s*:?\s*\$?([A-Za-z0-9]{2,10})\b/i) || t.match(/\$([A-Za-z0-9]{2,10})\b/);
  if (tm) {
    out.ticker = cleanTicker(tm[1]);
    t = t.replace(tm[0], " ");
  }
  const nm = t.match(/\b(?:bernama|nama|token)\s+["“]?([A-Za-z0-9][A-Za-z0-9 \-]{0,30}?)["”]?\s*(?=\s*(?:,|\.|$)|\s+(?:dan|dengan|ticker|simbol|symbol|supply|x|twitter|web|website|situs)\b)/i);
  if (nm) out.name = nm[1].trim();

  // "ZetaCoin ZETA" → nama ZetaCoin, ticker ZETA
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

// Jawaban langsung atas pertanyaan agent
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

function renderPreview(tok, status = "Draft — menunggu konfirmasi", live = false) {
  const name = tok.name || "Token baru";
  const ticker = tok.ticker || "—";
  const pending = (f) => (f in tok ? tok[f] || "—" : "…");
  const rows = [
    ["Nama", tok.name || "…"],
    ["Ticker", tok.ticker ? "$" + tok.ticker : "…"],
    ["X", "x" in tok ? (tok.x ? "@" + tok.x : "—") : "…"],
    ["Website", pending("website")],
    ["Pajak beli & jual", TAX + "%"],
    ["Penerima fee", wallet ? shortAddr(wallet) : "Wallet pembuat"],
    ["Total supply", fmt(SUPPLY)],
    ["Jaringan", "Robinhood Chain"],
  ];
  if (tok.address) rows.push(["Alamat kontrak", tok.address.slice(0, 10) + "…" + tok.address.slice(-6)]);
  preview.innerHTML = `
    <div class="token-head">
      <div class="token-logo" style="background:${colorFor(ticker + name)}">${escapeHtml((tok.ticker || name).slice(0, 2).toUpperCase())}</div>
      <div><h3>${escapeHtml(name)}</h3><small>${tok.ticker ? "$" + escapeHtml(ticker) : "ticker belum diisi"}</small></div>
    </div>
    <dl class="kv">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${escapeHtml(String(v))}</dd></div>`).join("")}</dl>
    <div class="status ${live ? "live" : ""}">${status}</div>`;
}

async function askNext() {
  const f = nextMissing();
  if (f) {
    asking = f;
    renderPreview(draft, "Draft — melengkapi detail");
    return botSay(QUESTIONS[f]);
  }
  asking = null;
  ready = true;
  renderPreview(draft);
  const recipient = wallet ? `<code>${shortAddr(wallet)}</code>` : "wallet yang kamu gunakan untuk meluncurkan";
  const m = await botSay(
    `Cetak biru tokenmu siap:<br>
     • Nama: <b>${escapeHtml(draft.name)}</b><br>
     • Ticker: <b>$${escapeHtml(draft.ticker)}</b><br>
     • X: <b>${draft.x ? "@" + escapeHtml(draft.x) : "—"}</b><br>
     • Website: <b>${draft.website ? escapeHtml(draft.website) : "—"}</b><br>
     • Pajak: <b>${TAX}%</b> setiap beli & jual, seluruhnya mengalir ke ${recipient}<br>
     Luncurkan sekarang? Kamu masih bisa mengubah detail, mis. <code>ticker ABC</code>.
     <div class="actions"><button class="btn btn-primary" data-act="deploy">Luncurkan</button><button class="btn btn-ghost" data-act="cancel">Batal</button></div>`,
    900
  );
  m.querySelector('[data-act="deploy"]').onclick = () => handle("Luncurkan");
  m.querySelector('[data-act="cancel"]').onclick = () => handle("Batal");
}

async function handle(text) {
  addMsg(escapeHtml(text), "user");
  const lower = text.trim().toLowerCase();

  if (draft && /^(batal|cancel)\b/.test(lower)) {
    draft = null;
    asking = null;
    ready = false;
    return botSay("Baik, draft dibatalkan. Ceritakan token lain yang ingin kamu ciptakan.");
  }
  if (/^(ya|iya|ok|oke|yes|deploy|luncurkan|lanjut|gas)$/.test(lower)) {
    if (ready) return deploy();
    if (asking) return botSay("Sebentar, detailnya belum lengkap. " + QUESTIONS[asking]);
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
    draft = p; // "token ..." setelah ringkasan = token baru; "nama ..." = ubah nama
  } else if (found) {
    Object.assign(draft, p);
  } else if (asking) {
    const a = parseAnswer(asking, text);
    if (!Object.keys(a).length) return botSay("Sepertinya formatnya belum tepat. " + QUESTIONS[asking]);
    Object.assign(draft, a);
  } else {
    return botSay(
      "Untuk mengubah detail, gunakan mis. <code>nama Garuda</code>, <code>ticker GRD</code>, <code>x @garuda</code>, atau <code>web garuda.io</code>. Ketik <code>luncurkan</code> bila sudah sesuai."
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
    await botSay("Menautkan wallet terlebih dahulu…", 500);
    await connectWallet();
    if (!wallet) return botSay("Wallet belum tertaut. Silakan coba kembali.");
  }
  const steps = [
    "🧠 Menyusun smart contract dari arsitektur teraudit…",
    `💸 Mengarahkan pajak ${TAX}% ke wallet pembuat ${shortAddr(wallet)}…`,
    "🔗 Menyematkan tautan X dan website ke metadata token…",
    "✍️ Menunggu tanda tangan transaksi…",
    "🚀 Mengirim transaksi ke Robinhood Chain…",
  ];
  for (const s of steps) {
    renderPreview(tok, s.replace(/^\S+\s/, ""));
    await botSay(s, 650);
  }
  tok.address = "0x" + randHex(40);
  const tx = "0x" + randHex(64);
  renderPreview(tok, "● LIVE di Robinhood Chain (demo)", true);
  await botSay(
    `✅ <b>${escapeHtml(tok.name)}</b> ($${escapeHtml(tok.ticker)}) resmi hidup!<br>
     Kontrak: <code>${tok.address}</code><br>
     Tx: <code>${tx.slice(0, 18)}…</code><br>
     Pajak ${TAX}% dari setiap transaksi kini mengalir ke <code>${shortAddr(wallet)}</code>.<br>
     <small class="muted">*Ini simulasi — alamat & hash di atas bukan transaksi nyata.</small>`,
    900
  );
}

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

addMsg(`Selamat datang. Aku <b>Zoza</b> — agen yang mewujudkan gagasanmu menjadi token di <b>Robinhood Chain</b>. Cukup berikan <b>nama</b>, <b>ticker</b>, akun <b>X</b>, dan <b>website</b>; pajak ${TAX}% setiap transaksi akan mengalir langsung ke wallet-mu.`);
