#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// Generates TrayIconTemplate.png (16x16) and TrayIconTemplate@2x.png (32x32)
// for the macOS menu bar tray. White circle on transparent background —
// macOS inverts/adapts the colour automatically for template images.
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

	// Circle at pixel centre, radius 75% of half-size.
	const cx = size / 2;
	const cy = size / 2;
	const r = (size / 2) * 0.75;

	// Raw scanlines: filter byte (None) + RGBA per pixel.
	const stride = 1 + size * 4;
	const raw = Buffer.allocUnsafe(size * stride);
	for (let y = 0; y < size; y++) {
		raw[y * stride] = 0;
		for (let x = 0; x < size; x++) {
			const dx = x + 0.5 - cx;
			const dy = y + 0.5 - cy;
			const alpha = Math.sqrt(dx * dx + dy * dy) <= r ? 255 : 0;
			const base = y * stride + 1 + x * 4;
			raw[base] = 255;
			raw[base + 1] = 255;
			raw[base + 2] = 255;
			raw[base + 3] = alpha;
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
