#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// Generates TrayIconTemplate.png (16x16) and TrayIconTemplate@2x.png (32x32)
// for the macOS menu bar tray: the app icon's four-point star as a template image —
// macOS reads only the alpha and tints it for light and dark menu bars.
import { deflateSync } from "node:zlib";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const buildDir = resolve(scriptDir, "..", "build");

// CRC32 via table lookup — matches the PNG-required polynomial.
function makeCrcTable() {
	const t = new Uint32Array(256);
	for (let i = 0; i < 256; i++) {
		let c = i;
		for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		t[i] = c;
	}
	return t;
}
const CRC_TABLE = makeCrcTable();
function crc32(buf) {
	let crc = 0xffffffff;
	for (const byte of buf) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
	return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
	const typeBuf = Buffer.from(type, "ascii");
	const lenBuf = Buffer.allocUnsafe(4);
	lenBuf.writeUInt32BE(data.length, 0);
	const crcBuf = Buffer.allocUnsafe(4);
	crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
	return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function makePng(size) {
	const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

	const ihdr = Buffer.allocUnsafe(13);
	ihdr.writeUInt32BE(size, 0);
	ihdr.writeUInt32BE(size, 4);
	ihdr[8] = 8; // bit depth 8
	ihdr[9] = 6; // colour type RGBA
	ihdr[10] = 0;
	ihdr[11] = 0;
	ihdr[12] = 0;

	// Four-point star: |x|^P + |y|^P <= 1 with P < 1 gives the concave sides of the app icon.
	const P = 0.55;
	const half = size / 2;
	const r = half * 0.95;
	const inside = (px, py) => Math.abs(px / r) ** P + Math.abs(py / r) ** P <= 1;
	// 4x4 samples per pixel so the thin points stay smooth at 16px.
	const SAMPLES = 4;

	// Raw scanlines: filter byte (None) + RGBA per pixel.
	const stride = 1 + size * 4;
	const raw = Buffer.allocUnsafe(size * stride);
	for (let y = 0; y < size; y++) {
		raw[y * stride] = 0;
		for (let x = 0; x < size; x++) {
			let hits = 0;
			for (let sy = 0; sy < SAMPLES; sy++) {
				for (let sx = 0; sx < SAMPLES; sx++) {
					const px = x + (sx + 0.5) / SAMPLES - half;
					const py = y + (sy + 0.5) / SAMPLES - half;
					if (inside(px, py)) hits++;
				}
			}
			const base = y * stride + 1 + x * 4;
			raw[base] = 0;
			raw[base + 1] = 0;
			raw[base + 2] = 0;
			raw[base + 3] = Math.round((255 * hits) / (SAMPLES * SAMPLES));
		}
	}

	const compressed = deflateSync(raw);
	return Buffer.concat([
		sig,
		pngChunk("IHDR", ihdr),
		pngChunk("IDAT", compressed),
		pngChunk("IEND", Buffer.alloc(0)),
	]);
}

writeFileSync(join(buildDir, "TrayIconTemplate.png"), makePng(16));
writeFileSync(join(buildDir, "TrayIconTemplate@2x.png"), makePng(32));
process.stdout.write("Generated build/TrayIconTemplate.png and build/TrayIconTemplate@2x.png\n");
