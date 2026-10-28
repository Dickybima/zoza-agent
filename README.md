# Zoza

Website landing page untuk **Zoza** — AI agent pembuat token yang dibangun di atas jaringan **Robinhood Chain**.

## Isi

- Hero dengan animasi terminal agent
- Fitur, cara kerja, info Robinhood Chain, roadmap, FAQ
- **Demo agent interaktif**: cukup berikan nama, ticker, akun X, dan website (mis. `token Nusantara ticker NUSA x @nusantara web nusantara.io`). Pajak tetap 3% beli & jual: 2% ke wallet pembuat token, 1% biaya protokol. Zoza menyusun ringkasan lalu mensimulasikan peluncuran.

> Demo bersifat simulasi — tidak ada transaksi on-chain yang dikirim.

## Menjalankan

Situs statis tanpa build step. Buka `index.html` langsung, atau:

```bash
python3 -m http.server 8000
# lalu buka http://localhost:8000
```

Bisa langsung di-host di GitHub Pages, Vercel, atau Netlify.
