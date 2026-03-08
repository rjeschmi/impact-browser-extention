import type { Extraction, ExtractionContext, ExtractFn } from "@impact/shared";

const TODO_NOISE = new Set([
	"auto-minimize", "this is inaccurate", "this is harmful / unsafe",
	"this is harmful/unsafe", "this is irrelevant", "something else",
	"i agree", "remember me", "keep me signed in", "subscribe",
	"accept", "agree", "terms", "newsletter",
]);

const TODO_KEYWORDS = /\b(TODO|to-do|action item|follow.?up|remind me|don't forget|next step)\b/i;

function getContext(node: Node, chars = 120): string {
	return (node.textContent ?? "").trim().slice(0, chars);
}

export const extract: ExtractFn = ({ url }: ExtractionContext): Extraction[] => {
	const results: Extraction[] = [];

	for (const el of document.querySelectorAll('input[type="checkbox"]')) {
		const label = el.closest("label") ?? el.parentElement;
		const text = label?.textContent?.trim() ?? "";
		if (text.length < 10 || text.length > 200 || TODO_NOISE.has(text.toLowerCase())) continue;

		results.push({
			url,
			kind: "todo",
			value: text.slice(0, 200),
			context: text.slice(0, 200),
			extractedAt: Date.now(),
		});
		if (results.length >= 5) return results;
	}

	if (results.length === 0) {
		const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
		let node: Node | null;
		while ((node = walker.nextNode()) && results.length < 3) {
			const text = node.textContent ?? "";
			if (text.length > 20 && TODO_KEYWORDS.test(text)) {
				results.push({
					url,
					kind: "todo",
					value: text.trim().slice(0, 200),
					context: getContext(node),
					extractedAt: Date.now(),
				});
			}
		}
	}

	return results;
};
