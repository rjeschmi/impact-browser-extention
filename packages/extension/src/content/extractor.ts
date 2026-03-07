import type { Extraction } from "@impact/shared";

const DOMAIN_BLOCKLIST = new Set([
	"google.com", "www.google.com",
	"bing.com", "www.bing.com",
	"duckduckgo.com", "mail.google.com",
	"localhost", "127.0.0.1",
	"accounts.google.com",
]);

function getDomain(): string {
	return location.hostname;
}

function getContext(node: Node, chars = 120): string {
	const text = node.textContent ?? "";
	return text.trim().slice(0, chars);
}

// --- Price extractor ---
function extractPrices(): Extraction[] {
	const results: Extraction[] = [];
	const priceRegex = /(?:USD|EUR|GBP|CAD|AUD|[\$€£¥])[\s]?(\d{1,6}(?:[,\.]\d{1,3})*(?:\.\d{2})?)|(\d{1,6}(?:\.\d{2})?)[\s]?(?:USD|EUR|GBP)/gi;

	// Try structured selectors first
	const selectors = [
		'[itemprop="price"]',
		'[data-price]',
		'.price', '.Price', '#price',
		'.product-price', '.sale-price', '.current-price',
	];

	for (const sel of selectors) {
		for (const el of document.querySelectorAll(sel)) {
			const raw = el.textContent?.trim() ?? "";
			if (raw && priceRegex.test(raw)) {
				priceRegex.lastIndex = 0;
				results.push({
					url: location.href,
					kind: "price",
					value: raw.slice(0, 50),
					context: getContext(el),
					metadata: JSON.stringify({ selector: sel }),
					extractedAt: Date.now(),
				});
				if (results.length >= 3) return results;
			}
			priceRegex.lastIndex = 0;
		}
	}

	// Fallback: scan text nodes
	if (results.length === 0) {
		const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
		let node: Node | null;
		while ((node = walker.nextNode()) && results.length < 3) {
			const text = node.textContent ?? "";
			priceRegex.lastIndex = 0;
			const match = priceRegex.exec(text);
			if (match) {
				results.push({
					url: location.href,
					kind: "price",
					value: match[0].trim().slice(0, 50),
					context: getContext(node),
					extractedAt: Date.now(),
				});
			}
		}
	}

	return results;
}

// --- Date / deadline extractor ---
const DEADLINE_KEYWORDS = /\b(deadline|due|expires?|expiring|ends?|by|before|submit|closing)\b/i;

const DATE_PATTERNS = [
	// ISO: 2024-03-15
	/\b(\d{4}-\d{2}-\d{2})\b/g,
	// US: 03/15/2024 or 3/15/24
	/\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b/g,
	// Long: March 15, 2024
	/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+\d{4}\b/gi,
];

function extractDates(): Extraction[] {
	const results: Extraction[] = [];
	const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
	let node: Node | null;

	while ((node = walker.nextNode()) && results.length < 5) {
		const text = node.textContent ?? "";
		if (!DEADLINE_KEYWORDS.test(text)) continue;

		for (const pattern of DATE_PATTERNS) {
			pattern.lastIndex = 0;
			const match = pattern.exec(text);
			if (match) {
				const parsed = new Date(match[0]);
				if (!isNaN(parsed.getTime())) {
					results.push({
						url: location.href,
						kind: "deadline",
						value: match[0],
						context: getContext(node),
						metadata: JSON.stringify({ iso: parsed.toISOString() }),
						extractedAt: Date.now(),
					});
				}
				break;
			}
		}
	}

	return results;
}

// --- TODO extractor ---
const TODO_KEYWORDS = /\b(TODO|to-do|action item|follow.?up|remind me|don't forget|next step)\b/i;

function extractTodos(): Extraction[] {
	const results: Extraction[] = [];

	// Checkboxes
	for (const el of document.querySelectorAll('input[type="checkbox"]')) {
		const label = el.closest("label") ?? el.parentElement;
		const text = label?.textContent?.trim() ?? "";
		if (text) {
			results.push({
				url: location.href,
				kind: "todo",
				value: text.slice(0, 200),
				context: text.slice(0, 200),
				extractedAt: Date.now(),
			});
			if (results.length >= 5) return results;
		}
	}

	// Keyword scan
	if (results.length === 0) {
		const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
		let node: Node | null;
		while ((node = walker.nextNode()) && results.length < 3) {
			const text = node.textContent ?? "";
			if (TODO_KEYWORDS.test(text)) {
				results.push({
					url: location.href,
					kind: "todo",
					value: text.trim().slice(0, 200),
					context: getContext(node),
					extractedAt: Date.now(),
				});
			}
		}
	}

	return results;
}

// --- Keyword extractor (page metadata) ---
function extractKeywords(): Extraction[] {
	const results: Extraction[] = [];

	const metas = [
		document.querySelector('meta[name="keywords"]')?.getAttribute("content"),
		document.querySelector('meta[name="description"]')?.getAttribute("content"),
		document.querySelector('meta[property="og:description"]')?.getAttribute("content"),
	].filter(Boolean);

	for (const value of metas) {
		if (value) {
			results.push({
				url: location.href,
				kind: "keyword",
				value: value.slice(0, 300),
				extractedAt: Date.now(),
			});
		}
	}

	return results;
}

export function runExtraction(): Extraction[] {
	if (DOMAIN_BLOCKLIST.has(getDomain())) return [];

	return [
		...extractPrices(),
		...extractDates(),
		...extractTodos(),
		...extractKeywords(),
	];
}
