#!/usr/bin/env node
/**
 * Re-runnable fifth-round audio processor.
 *
 * Source preparation (CC0 files are not shipped inside public/audio):
 *   afconvert -f WAVE -d LEI16@48000 peugeot107-interior.mp3 peugeot107-interior.wav
 *   afconvert -f WAVE -d LEI16@48000 tire-screech.mp3 tire-screech.wav
 *   afconvert -f WAVE -d LEI16@48000 gravel-bike.mp3 gravel-bike.wav
 *   afconvert -f WAVE -d LEI16@48000 metal-thud2.wav metal-thud2.wav
 *   afconvert -f WAVE -d LEI16@48000 metal-thud3.wav metal-thud3.wav
 *
 * Put the decoded files in ./public/audio/source (or set AUDIO_SOURCE_DIR),
 * then run: node scripts/process-audio-round5.mjs
 * Product files are 48 kHz mono 16-bit WAV; loops use zero-crossing endpoints
 * plus a 1 ms de-click. Sources/licences are listed in docs/audio-round5.md.
 */
import fs from 'node:fs';
import path from 'node:path';

const rate = 48000;
const sourceDir = process.env.AUDIO_SOURCE_DIR || path.join(process.cwd(), 'public/audio/source');

function readWav(file) {
  const b = fs.readFileSync(file);
  let p = 12, data = null, channels = 1, bits = 16;
  while (p < b.length) {
    const id = b.toString('ascii', p, p + 4);
    const size = b.readUInt32LE(p + 4);
    if (id === 'fmt ') { channels = b.readUInt16LE(p + 10); bits = b.readUInt16LE(p + 22); }
    if (id === 'data') data = b.subarray(p + 8, p + 8 + size);
    p += 8 + size + (size & 1);
  }
  const n = data.length / (bits / 8) / channels;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = data.readInt16LE(i * 2) / 32768;
  return out;
}
function writeWav(file, samples) {
  const n = samples.length;
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  fs.writeFileSync(file, b);
}
const cut = (s, a, b) => s.slice(Math.floor(a * rate), Math.min(s.length, Math.floor(b * rate)));
const dc = s => { let m = 0; for (const v of s) m += v; m /= s.length; const o = new Float32Array(s.length); for (let i = 0; i < s.length; i++) o[i] = s[i] - m; return o; };
const norm = (s, peak = .8) => { let p = 0; for (const v of s) p = Math.max(p, Math.abs(v)); const g = p > 1e-6 ? peak / p : 1; const o = new Float32Array(s.length); for (let i = 0; i < s.length; i++) o[i] = s[i] * g; return o; };
const compress = (s, threshold = .42, ratio = 2.4) => { const o = new Float32Array(s.length); for (let i = 0; i < s.length; i++) { const a = Math.abs(s[i]); o[i] = a <= threshold ? s[i] : Math.sign(s[i]) * (threshold + (a - threshold) / ratio); } return o; };
function zeroCross(s, center, search = 9000) {
  let best = center, bestD = search + 1;
  for (let i = Math.max(2, center - search); i < Math.min(s.length - 2, center + search); i++) {
    const a = s[i - 1], b = s[i];
    if ((a <= 0 && b > 0) || (a >= 0 && b < 0)) {
      const nearest = Math.abs(a) < Math.abs(b) ? i - 1 : i;
      const d = Math.abs(i - center);
      if (d < bestD) { bestD = d; best = nearest; }
    }
  }
  return best;
}
function zeroLoop(s) {
  const start = zeroCross(s, Math.min(800, Math.floor(s.length * .02)));
  const end = zeroCross(s, s.length - Math.min(800, Math.floor(s.length * .02)));
  return s.slice(start, end);
}
function loop(src, start, end, name, peak = .8) {
  let s = zeroLoop(dc(cut(src, start, end)));
  s = compress(s);
  s = norm(s, peak);
  s[0] = 0; s[s.length - 1] = 0;
  const deClick = Math.max(2, Math.floor(rate * .001));
  for (let i = 0; i < deClick && i < s.length; i++) {
    const g = Math.sin((i / deClick) * Math.PI / 2);
    s[i] *= g; s[s.length - 1 - i] *= g;
  }
  writeWav(path.join('public/audio', name), s);
  console.log(name, (s.length / rate).toFixed(3) + 's', 'seam', Math.abs(s[0] - s[s.length - 1]).toFixed(5));
}
function one(src, start, end, name, peak = .85) {
  const s = norm(dc(cut(src, start, end)), peak);
  const f = Math.min(s.length, Math.floor(rate * .008));
  for (let i = 0; i < f; i++) { s[i] *= i / f; s[s.length - 1 - i] *= i / f; }
  writeWav(path.join('public/audio', name), s);
  console.log(name, (s.length / rate).toFixed(3) + 's');
}
const p = readWav(path.join(sourceDir, 'peugeot107-interior.wav'));
const bike = readWav(path.join(sourceDir, 'gravel-bike.wav'));
const screech = readWav(path.join(sourceDir, 'tire-screech.wav'));
const thud2 = readWav(path.join(sourceDir, 'metal-thud2.wav'));
const thud3 = readWav(path.join(sourceDir, 'metal-thud3.wav'));
loop(p, 52, 57, 'engine-idle-loop.wav', .55);
loop(p, 20, 25, 'engine-load-loop.wav', .8);
loop(p, 36, 41, 'road-loop.wav', .55);
loop(bike, 4, 9, 'gravel-loop.wav', .7);
loop(screech, .05, 2.15, 'skid-loop.wav', .8);
one(thud2, 0, .45, 'metal-hit-1.wav', .9);
one(thud3, 0, .35, 'metal-hit-2.wav', .9);
