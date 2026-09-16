/**
 * 產生 PWA / iOS 主畫面圖示。
 * 只需要在改圖時執行一次：npm run icons
 */
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public/icons");

/** @param {number} pad 圖案內縮比例，maskable 需要較大安全邊距 */
const svg = (size, pad) => {
  const s = size;
  const inner = s * (1 - pad * 2);
  const x = s * pad;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#34d399"/>
      <stop offset="55%" stop-color="#10b981"/>
      <stop offset="100%" stop-color="#38bdf8"/>
    </linearGradient>
  </defs>
  <rect width="${s}" height="${s}" fill="url(#bg)"/>
  <g transform="translate(${x} ${x}) scale(${inner / 100})">
    <!-- 掃把柄 -->
    <rect x="46" y="8" width="8" height="46" rx="4" fill="#fff7ed"/>
    <!-- 掃把束口 -->
    <rect x="34" y="50" width="32" height="14" rx="6" fill="#fb923c"/>
    <!-- 掃把毛 -->
    <path d="M32 64 L68 64 L78 94 L22 94 Z" fill="#fde68a"/>
    <path d="M40 64 L40 94 M50 64 L50 94 M60 64 L60 94"
          stroke="#f59e0b" stroke-width="3" stroke-linecap="round"/>
  </g>
</svg>`;
};

await mkdir(outDir, { recursive: true });

const targets = [
  { file: "icon-192.png", size: 192, pad: 0.16 },
  { file: "icon-512.png", size: 512, pad: 0.16 },
  { file: "icon-512-maskable.png", size: 512, pad: 0.24 },
  { file: "apple-touch-icon.png", size: 180, pad: 0.14 },
];

for (const { file, size, pad } of targets) {
  const buffer = await sharp(Buffer.from(svg(size, pad))).png().toBuffer();
  await writeFile(path.join(outDir, file), buffer);
  console.log(`✓ ${file} (${size}x${size})`);
}
