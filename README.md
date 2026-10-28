# Zoza

Website landing page untuk **Zoza** — AI agent pembuat token yang dibangun di atas jaringan **Robinhood Chain**.

## Isi

- Hero dengan animasi terminal agent
- Fitur, cara kerja, info Robinhood Chain, roadmap, FAQ
- **Demo agent interaktif**: ketik perintah bahasa natural (mis. `buat token Nusantara simbol NUSA supply 100 juta pajak 2%`) dan Zoza akan menyusun ringkasan token lalu mensimulasikan deploy.

> Demo bersifat simulasi — tidak ada transaksi on-chain yang dikirim.

## Menjalankan

Situs statis tanpa build step. Buka `index.html` langsung, atau:

```bash
python3 -m http.server 8000
# lalu buka http://localhost:8000
```

Bisa langsung di-host di GitHub Pages, Vercel, atau Netlify.
