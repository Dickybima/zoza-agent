// Vercel Serverless Function: stores a creator's token logo in Vercel Blob and
// returns its public URL, which goes into the token's on-chain metadata. The
// launch factory caps that field at 512 bytes, so the image itself can't live
// on-chain; the browser crops and shrinks it to a 512×512 image before upload.
// Needs a Blob store connected to the project (BLOB_READ_WRITE_TOKEN).
import { createHash } from "node:crypto";
import { put } from "@vercel/blob";

const MAX_BYTES = 1024 * 1024;
const MAX_URL = 512;

// identify the image from its first bytes rather than trusting the header
function sniff(buf) {
  if (buf.length > 8 && buf[0] === 0x89 && buf.toString("ascii", 1, 4) === "PNG") return ["png", "image/png"];
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return ["jpg", "image/jpeg"];
  if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return ["webp", "image/webp"];
  if (buf.length > 6 && buf.toString("ascii", 0, 4) === "GIF8") return ["gif", "image/gif"];
  return null;
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BYTES) return null;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("allow", "POST");
    return res.status(405).json({ error: "POST an image" });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({ error: "Logo uploads aren’t set up on this site yet." });
  }

  const body = await readBody(req);
  if (!body) return res.status(413).json({ error: "That image is over 1 MB." });
  const kind = sniff(body);
  if (!kind) return res.status(415).json({ error: "Use a PNG, JPG, WEBP or GIF image." });

  try {
    // named by content, so the same image is stored once
    const hash = createHash("sha256").update(body).digest("hex").slice(0, 32);
    const blob = await put(`logos/${hash}.${kind[0]}`, body, {
      access: "public",
      contentType: kind[1],
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 31536000,
    });
    if (blob.url.length > MAX_URL) return res.status(500).json({ error: "Logo link is too long for on-chain metadata." });
    return res.status(200).json({ url: blob.url });
  } catch {
    return res.status(502).json({ error: "Couldn’t store the logo. Please try again." });
  }
}
