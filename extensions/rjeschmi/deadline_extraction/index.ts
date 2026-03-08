import type { Extraction, ExtractionContext, ExtractFn } from "@impact/shared";

const DEADLINE_KEYWORDS = /\b(deadline|due|expires?|expiring|ends?|submit by|closing|apply by)\b/i;

const DATE_PATTERNS = [
	/\b(\d{4}-\d{2}-\d{2})\b/g,
	/\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b/g,
	/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+\d{4}\b/gi,
];

function getContext(node: Node, chars = 120): string {
	return (node.textContent ?? "").trim().slice(0, chars);
}

export const extract: ExtractFn = ({ url }: ExtractionContext): Extraction[] => {
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
						url,
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
};
