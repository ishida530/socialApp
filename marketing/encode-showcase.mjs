// Encodes the raw Playwright recordings from .marketing-raw/ into the landing assets in
// public/landing/showcase/ (2026-10-03): trimmed to the marked window, 24 fps, no audio,
// WebM VP9 + MP4 H.264 (faststart), WebP posters. Mobile clips are cropped to 390x693.
//   node marketing/encode-showcase.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import ffmpegPath from 'ffmpeg-static';

const RAW = path.resolve('.marketing-raw');
const OUT = path.resolve('public/landing/showcase');
mkdirSync(OUT, { recursive: true });

const BUDGET = { desktop: 1.5 * 1024 * 1024, mobile: 700 * 1024 };

function ffmpeg(args) {
  execFileSync(ffmpegPath, ['-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
}

for (const file of readdirSync(RAW).filter((name) => name.endsWith('.json'))) {
  const id = file.replace(/\.json$/, '');
  const variant = id.endsWith('-mobile') ? 'mobile' : 'desktop';
  const { raw, start, end } = JSON.parse(readFileSync(path.join(RAW, file), 'utf8'));
  const crop = variant === 'mobile' ? 'crop=390:693:0:0,' : '';
  const filter = `${crop}fps=24`;
  // Output-side seeking: frame-accurate (input-side -ss jumps back to the previous keyframe, and the
  // raw VP8 recordings have few of them).
  const window = ['-i', raw, '-ss', String(Math.max(0, start)), '-to', String(end)];

  ffmpeg([...window, '-vf', filter, '-an', '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', variant === 'mobile' ? '40' : '38', '-row-mt', '1', '-deadline', 'good', path.join(OUT, `${id}.webm`)]);
  ffmpeg([...window, '-vf', filter, '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', variant === 'mobile' ? '30' : '28', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(OUT, `${id}.mp4`)]);
  ffmpeg(['-i', path.join(RAW, `${id}.png`), '-vf', variant === 'mobile' ? 'crop=390:693:0:0' : 'null', '-c:v', 'libwebp', '-quality', '78', path.join(OUT, `${id}.webp`)]);

  for (const ext of ['webm', 'mp4', 'webp']) {
    const size = statSync(path.join(OUT, `${id}.${ext}`)).size;
    const limit = ext === 'webp' ? 120 * 1024 : BUDGET[variant];
    console.log(`${id}.${ext}`.padEnd(28), `${(size / 1024).toFixed(0)} KB`, size > limit ? '  OVER BUDGET' : '');
  }
}
