import type { Extraction, ExtractionContext, ExtractFn } from "@impact/shared";

export const extract: ExtractFn = ({ url }: ExtractionContext): Extraction[] => {
	const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute("content");
	const description =
		document.querySelector('meta[name="description"]')?.getAttribute("content") ??
		document.querySelector('meta[property="og:description"]')?.getAttribute("content");

	const value = [ogTitle ?? document.title, description].filter(Boolean).join(" — ");
	if (value.length <= 10) return [];

	return [{
		url,
		kind: "keyword",
		value: value.slice(0, 300),
		extractedAt: Date.now(),
	}];
};
