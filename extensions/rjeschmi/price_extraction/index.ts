import type { Extraction, ExtractionContext, ExtractFn } from "@impact/shared";

function extractJsonLd(url: string): Extraction[] {
	const results: Extraction[] = [];
	const scripts = document.querySelectorAll('script[type="application/ld+json"]');

	for (const script of scripts) {
		try {
			const data = JSON.parse(script.textContent ?? "");
			const items = Array.isArray(data) ? data : [data];

			for (const item of items) {
				const type = item["@type"];
				if (!["Product", "Offer"].includes(type)) continue;

				const name = item.name as string | undefined;
				const offers = item.offers ?? (type === "Offer" ? item : null);
				if (!offers) continue;

				const offer = Array.isArray(offers) ? offers[0] : offers;
				const price = offer.price ?? offer.lowPrice;
				const currency = offer.priceCurrency ?? "USD";
				const availability = offer.availability?.split("/").pop() ?? null;

				if (price == null) continue;

				results.push({
					url,
					kind: "price",
					value: `${currency} ${price}`,
					context: name ?? document.title,
					metadata: JSON.stringify({ price: Number(price), currency, name: name ?? null, availability, source: "json-ld" }),
					extractedAt: Date.now(),
				});
			}
		} catch {
			// malformed JSON-LD — skip
		}
	}

	return results;
}

function extractMetaPrice(url: string): Extraction[] {
	const price = document.querySelector('meta[property="product:price:amount"]')?.getAttribute("content");
	const currency = document.querySelector('meta[property="product:price:currency"]')?.getAttribute("content") ?? "USD";
	const title = document.querySelector('meta[property="og:title"]')?.getAttribute("content") ?? document.title;

	if (!price) return [];

	return [{
		url,
		kind: "price",
		value: `${currency} ${price}`,
		context: title,
		metadata: JSON.stringify({ price: Number(price), currency, name: title, source: "og-meta" }),
		extractedAt: Date.now(),
	}];
}

function extractDomPrice(url: string): Extraction[] {
	for (const el of document.querySelectorAll('[itemprop="price"]')) {
		const raw = (el.getAttribute("content") ?? el.textContent ?? "").trim();
		if (!raw) continue;
		const amount = parseFloat(raw.replace(/[^\d.]/g, ""));
		if (isNaN(amount) || amount <= 0) continue;

		const name = document.querySelector('[itemprop="name"]')?.textContent?.trim() ?? document.title;
		return [{
			url,
			kind: "price",
			value: raw.slice(0, 50),
			context: name,
			metadata: JSON.stringify({ price: amount, source: "itemprop" }),
			extractedAt: Date.now(),
		}];
	}

	return [];
}

export const extract: ExtractFn = ({ url }: ExtractionContext): Extraction[] => {
	const jsonLd = extractJsonLd(url);
	if (jsonLd.length > 0) return jsonLd.slice(0, 2);

	const meta = extractMetaPrice(url);
	if (meta.length > 0) return meta;

	return extractDomPrice(url);
};
