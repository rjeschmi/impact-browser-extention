import { PNG } from "pngjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT_DIR = join(import.meta.dir, "..", "packages", "extension", "icons");
mkdirSync(OUT_DIR, { recursive: true });

// Palette
const BG   = [22,  33,  62,  255] as const; // #16213e navy
const FG   = [255, 255, 255, 255] as const; // white
const BLUE = [34,  139, 230, 255] as const; // #228be6

function setPixel(data: Buffer, size: number, x: number, y: number, c: readonly [number, number, number, number]) {
	if (x < 0 || x >= size || y < 0 || y >= size) return;
	const i = (size * y + x) * 4;
	data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = c[3];
}

function fillRect(data: Buffer, size: number, x1: number, y1: number, x2: number, y2: number, c: readonly [number, number, number, number]) {
	for (let y = y1; y < y2; y++)
		for (let x = x1; x < x2; x++)
			setPixel(data, size, x, y, c);
}

// Rounded rectangle helper
function fillRoundRect(data: Buffer, size: number, x1: number, y1: number, x2: number, y2: number, r: number, c: readonly [number, number, number, number]) {
	for (let y = y1; y < y2; y++) {
		for (let x = x1; x < x2; x++) {
			// Check corners
			const inCornerTL = x < x1 + r && y < y1 + r && (x - (x1 + r)) ** 2 + (y - (y1 + r)) ** 2 > r * r;
			const inCornerTR = x >= x2 - r && y < y1 + r && (x - (x2 - r - 1)) ** 2 + (y - (y1 + r)) ** 2 > r * r;
			const inCornerBL = x < x1 + r && y >= y2 - r && (x - (x1 + r)) ** 2 + (y - (y2 - r - 1)) ** 2 > r * r;
			const inCornerBR = x >= x2 - r && y >= y2 - r && (x - (x2 - r - 1)) ** 2 + (y - (y2 - r - 1)) ** 2 > r * r;
			if (!inCornerTL && !inCornerTR && !inCornerBL && !inCornerBR)
				setPixel(data, size, x, y, c);
		}
	}
}

function createIcon(size: number): Buffer {
	const png = new PNG({ width: size, height: size });
	const d = png.data;

	// Background fill
	fillRect(d, size, 0, 0, size, size, BG);

	// Rounded background rect for polish
	const radius = Math.max(2, Math.floor(size * 0.18));
	fillRoundRect(d, size, 0, 0, size, size, radius, BG);

	const pad   = Math.max(2, Math.floor(size * 0.18));
	const bH    = Math.max(1, Math.floor(size * 0.12)); // bar height
	const sW    = Math.max(2, Math.floor(size * 0.22)); // stem width
	const sX    = Math.floor((size - sW) / 2);

	// Top serif bar (blue accent)
	fillRect(d, size, pad, pad, size - pad, pad + bH, BLUE);
	// Bottom serif bar (blue accent)
	fillRect(d, size, pad, size - pad - bH, size - pad, size - pad, BLUE);
	// Stem (white)
	fillRect(d, size, sX, pad, sX + sW, size - pad, FG);

	return PNG.sync.write(png);
}

for (const size of [16, 32, 48, 128]) {
	const buf = createIcon(size);
	const path = join(OUT_DIR, `icon${size}.png`);
	writeFileSync(path, buf);
	console.log(`Generated ${path} (${buf.length} bytes)`);
}
