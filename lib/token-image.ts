// AI artwork for a token, generated from its name (e.g. "Moon Cat" → a cat
// mascot) by Pollinations' free text-to-image endpoint, which needs no API
// key. The URL is deterministic for a name + seed, so it also serves as the
// token's logo link stored on-chain; a new seed restyles the artwork.
export function tokenImageUrl(name: string, seed: number) {
  const subject = name.trim();
  const prompt =
    `${subject} memecoin mascot logo, a cute ${subject} character as the hero, ` +
    "centered, bold flat vector illustration, vibrant colors, plain dark background, no text, no letters";
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=512&height=512&seed=${seed}&nologo=true&model=flux`;
}

export const newImageSeed = () => Math.floor(Math.random() * 1_000_000);
