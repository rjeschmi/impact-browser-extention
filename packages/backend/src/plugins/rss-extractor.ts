import { load } from "cheerio";
import type { Plugin, PluginContext, PluginState } from "./types.js";

const RSS_TYPES = new Set([
	"application/rss+xml",
	"application/atom+xml",
	"application/feed+json",
	"application/x-rss+xml",
]);

// Href patterns that suggest a feed link even without a type attribute
const FEED_HREF_RE = /\/(feed|rss|atom)(\.xml)?(\?|$)|\.rss(\?|$)/i;

// FNV-1a 32-bit hash → stable 8-char hex key from a URL
function urlHash(s: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = (Math.imul(h, 0x01000193) >>> 0);
	}
	return h.toString(16).padStart(8, "0");
}

export const rssExtractor: Plugin = {
	name: "rss-extractor",
	defaultOrder: 50, // runs before cheerio-preprocessor so full HTML is available

	shouldRunByDefault(ctx: PluginContext): boolean {
		return !!ctx.pageHtml;
	},

	async run(ctx: PluginContext, state: PluginState, _config?: Record<string, unknown>): Promise<void> {
		if (!ctx.pageHtml) return;

		const $ = load(ctx.pageHtml);
		const seen = new Set<string>();

		function addFeed(href: string | undefined, title: string | null, type: string | null) {
			if (!href) return;
			let url: string;
			try {
				url = new URL(href, ctx.url).href;
			} catch {
				return;
			}
			if (seen.has(url)) return;
			seen.add(url);
			const key = `feed_${urlHash(url)}`;
			state.data[key] = { url, title: title || null, type: type || null };
		}

		// 1. <link rel="alternate"> in <head> — the canonical way to declare feeds
		$('link[rel="alternate"]').each((_, el) => {
			const type = $(el).attr("type")?.trim().toLowerCase() ?? "";
			const href = $(el).attr("href");
			const title = $(el).attr("title") ?? null;
			if (RSS_TYPES.has(type)) {
				addFeed(href, title, type);
			}
		});

		// 2. <a href> links whose href looks like a feed URL (common on blogs/CMSs
		//    that don't bother with <link> declarations)
		$("a[href]").each((_, el) => {
			const href = $(el).attr("href") ?? "";
			if (FEED_HREF_RE.test(href)) {
				const title = $(el).text().trim() || $(el).attr("title") || null;
				addFeed(href, title, null);
			}
		});
	},
};
