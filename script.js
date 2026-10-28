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
  ['<span class="p">you ›</span> buat token Nusantara, simbol NUSA, supply 100 juta', 40],
  ['<span class="k">zoza ›</span> memahami permintaan…', 18],
  ['  name    : Nusantara', 8],
  ['  symbol  : NUSA', 8],
  ['  supply  : 100.000.000', 8],
  ['  network : Pons V2', 8],
  ['<span class="k">zoza ›</span> menyusun smart contract…', 18],
  ['<span class="k">zoza ›</span> deploy ke Pons V2…', 18],
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
document.querySelectorAll(".card, .steps li, .phase, .faq details, .pons-text, .cta").forEach((el) => {
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
const log = $("#chatLog");
const preview = $("#preview");
let draft = null;

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

const MULT = { ribu: 1e3, rb: 1e3, k: 1e3, juta: 1e6, jt: 1e6, m: 1e6, million: 1e6, miliar: 1e9, milyar: 1e9, b: 1e9, billion: 1e9, triliun: 1e12, t: 1e12 };

function parseNumber(str) {
  const m = str.match(/([\d.,]+)\s*(ribu|rb|juta|jt|miliar|milyar|triliun|million|billion|[kmbt])?\b/i);
  if (!m) return null;
  let raw = m[1];
  // "1.000.000" atau "1,000,000" → ribuan; "1,5" atau "1.5" → desimal
  if (/^\d{1,3}([.,]\d{3})+$/.test(raw)) raw = raw.replace(/[.,]/g, "");
  else raw = raw.replace(",", ".");
  const n = parseFloat(raw);
  if (isNaN(n)) return null;
  return Math.round(n * (m[2] ? MULT[m[2].toLowerCase()] : 1));
}

function parsePrompt(text) {
  const t = text.trim();
  const out = {};

  const sym = t.match(/(?:simbol|symbol|ticker|\$)\s*:?\s*\$?([A-Za-z0-9]{2,10})/i);
  if (sym) out.symbol = sym[1].toUpperCase();

  const sup = t.match(/(?:supply|suplai|jumlah|total)\s*:?\s*([\d.,]+\s*(?:ribu|rb|juta|jt|miliar|milyar|triliun|million|billion|[kmbt])?)/i);
  if (sup) out.supply = parseNumber(sup[1]);

  const tax = t.match(/(?:pajak|tax|fee)\s*:?\s*([\d.,]+)\s*%/i);
  if (tax) out.tax = parseFloat(tax[1].replace(",", "."));

  const burn = t.match(/burn\s*:?\s*([\d.,]+)\s*%/i);
  if (burn) out.burn = parseFloat(burn[1].replace(",", "."));

  // Nama: setelah "token"/"bernama"/"nama", berhenti di kata kunci berikutnya
  const name = t.match(/(?:bernama|nama|token)\s+(?:komunitas\s+|bernama\s+)?["“]?([A-Za-z0-9][A-Za-z0-9 \-]{0,30}?)["”]?\s*(?=,|\.|$|\b(?:simbol|symbol|ticker|supply|suplai|jumlah|total|pajak|tax|fee|burn|dengan)\b)/i);
  if (name) out.name = name[1].trim();

  // Bila tidak ada simbol tapi nama ada dan diikuti kata kapital (mis. "ZetaCoin ZETA")
  if (out.name && !out.symbol) {
    const parts = out.name.split(/\s+/);
    const last = parts[parts.length - 1];
    if (parts.length > 1 && /^[A-Z0-9]{2,10}$/.test(last)) {
      out.symbol = last;
      out.name = parts.slice(0, -1).join(" ");
    }
  }
  // Nama huruf kapital semua (mis. "GARUDA") dipakai sebagai simbol juga
  if (out.name && !out.symbol && /^[A-Z0-9]{2,10}$/.test(out.name)) {
    out.symbol = out.name;
    out.name = out.name.charAt(0) + out.name.slice(1).toLowerCase();
  }
  if (out.name && !out.symbol) out.symbol = out.name.replace(/[^A-Za-z]/g, "").slice(0, 4).toUpperCase();
  return out;
}

function colorFor(s) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `linear-gradient(135deg, hsl(${h} 90% 65%), hsl(${(h + 70) % 360} 85% 55%))`;
}

function renderPreview(tok, status = "Draft — menunggu konfirmasi", live = false) {
  const rows = [
    ["Nama", tok.name],
    ["Simbol", tok.symbol],
    ["Total supply", fmt(tok.supply)],
    ["Decimals", "18"],
    ["Pajak transaksi", (tok.tax ?? 0) + "%"],
    ["Burn per transaksi", (tok.burn ?? 0) + "%"],
    ["Jaringan", "Pons V2"],
  ];
  if (tok.address) rows.push(["Alamat kontrak", tok.address.slice(0, 10) + "…" + tok.address.slice(-6)]);
  preview.innerHTML = `
    <div class="token-head">
      <div class="token-logo" style="background:${colorFor(tok.symbol)}">${escapeHtml(tok.symbol.slice(0, 2))}</div>
      <div><h3>${escapeHtml(tok.name)}</h3><small>$${escapeHtml(tok.symbol)}</small></div>
    </div>
    <dl class="kv">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${escapeHtml(String(v))}</dd></div>`).join("")}</dl>
    <div class="status ${live ? "live" : ""}">${status}</div>`;
}

async function handle(text) {
  addMsg(escapeHtml(text), "user");
  const lower = text.toLowerCase();

  if (draft && /^(ya|iya|ok|oke|yes|deploy|lanjut|gas)\b/.test(lower)) return deploy();
  if (draft && /^(batal|tidak|no|cancel)\b/.test(lower)) {
    draft = null;
    return botSay("Oke, draft dibatalkan. Ceritakan token lain yang ingin kamu buat 🙂");
  }

  const p = parsePrompt(text);
  // Nama baru = token baru; selain itu perbarui draft yang ada
  if (p.name) draft = p;
  else if (draft) Object.assign(draft, Object.fromEntries(Object.entries(p).filter(([, v]) => v != null)));
  else if (p.symbol) draft = p;

  if (!draft) {
    return botSay(
      "Aku belum menangkap detail tokennya. Coba sebutkan <b>nama</b>, <b>simbol</b>, dan <b>supply</b>, misalnya:<br><code>buat token Nusantara simbol NUSA supply 100 juta</code>"
    );
  }
  if (!draft.supply) {
    renderPreview({ ...draft, supply: 0 }, "Draft — supply belum diisi");
    return botSay(`Siap, token <b>${escapeHtml(draft.name || draft.symbol)}</b> ($${escapeHtml(draft.symbol)}). Berapa total supply yang kamu inginkan?`);
  }
  if (!draft.name) draft.name = draft.symbol;
  if ((draft.tax ?? 0) > 25) {
    draft.tax = 25;
    await botSay("⚠️ Pajak di atas 25% berisiko dianggap scam oleh trader, jadi aku batasi ke 25%.");
  }

  renderPreview(draft);
  const m = await botSay(
    `Ini ringkasan tokenmu di Pons V2:<br>
     • Nama: <b>${escapeHtml(draft.name)}</b><br>
     • Simbol: <b>$${escapeHtml(draft.symbol)}</b><br>
     • Supply: <b>${fmt(draft.supply)}</b><br>
     • Pajak: <b>${draft.tax ?? 0}%</b> · Burn: <b>${draft.burn ?? 0}%</b><br>
     Lanjut deploy? Kamu juga bisa mengubah parameter, mis. <code>pajak 1%</code>.
     <div class="actions"><button class="btn btn-primary" data-act="deploy">Deploy</button><button class="btn btn-ghost" data-act="cancel">Batal</button></div>`,
    900
  );
  m.querySelector('[data-act="deploy"]').onclick = () => handle("Deploy");
  m.querySelector('[data-act="cancel"]').onclick = () => handle("Batal");
}

async function deploy() {
  const tok = draft;
  draft = null;
  if (!wallet) {
    await botSay("Menghubungkan wallet terlebih dahulu…", 500);
    await connectWallet();
    if (!wallet) return botSay("Wallet tidak terhubung. Coba lagi ya.");
  }
  const steps = [
    "🧠 Menyusun smart contract dari template teraudit…",
    "🔍 Menjalankan pengecekan keamanan…",
    "✍️ Menunggu tanda tangan transaksi…",
    "🚀 Mengirim transaksi ke jaringan Pons V2…",
  ];
  for (const s of steps) {
    renderPreview(tok, s.replace(/^\S+\s/, ""));
    await botSay(s, 650);
  }
  tok.address = "0x" + randHex(40);
  const tx = "0x" + randHex(64);
  renderPreview(tok, "● LIVE di Pons V2 (demo)", true);
  await botSay(
    `✅ <b>${escapeHtml(tok.name)}</b> ($${escapeHtml(tok.symbol)}) berhasil diluncurkan!<br>
     Kontrak: <code>${tok.address}</code><br>
     Tx: <code>${tx.slice(0, 18)}…</code><br>
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

addMsg("Halo! Aku <b>Zoza</b> 👋 AI agent pembuat token di jaringan <b>Pons V2</b>. Ceritakan token seperti apa yang ingin kamu luncurkan.");
