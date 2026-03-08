import { load } from "cheerio";
import type { Plugin, PluginContext, PluginState } from "./types.js";

const DEFAULT_MAX_CHARS = 32_000;
const STRIP_TAGS = ["script", "style", "noscript", "iframe", "svg", "nav", "footer", "header"];
const KEEP_ATTRS = new Set(["href", "src", "alt", "title", "datetime", "content", "itemprop"]);
const BLOCK_TAGS = new Set(["div","p","h1","h2","h3","h4","h5","h6","li","tr","td","th","section","article","figure","blockquote","dt","dd","caption","figcaption"]);

// Walk cheerio DOM nodes and emit structured plain text
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractText(node: any, lines: string[]): void {
	if (node.type === "text") {
		const t = (node.data as string ?? "").trim();
		if (t) lines.push(t);
		return;
	}
	if (node.type !== "tag") return;
	const tag = (node.name as string).toLowerCase();
	if (BLOCK_TAGS.has(tag) && lines.length > 0 && lines.at(-1) !== "\n") lines.push("\n");
	for (const child of (node.children ?? [])) extractText(child, lines);
	if (BLOCK_TAGS.has(tag) && lines.at(-1) !== "\n") lines.push("\n");
}

export const cheerioPreprocessor: Plugin = {
	name: "cheerio-preprocessor",
	defaultOrder: 100,

	shouldRunByDefault(ctx: PluginContext): boolean {
		return !!ctx.pageHtml;
	},

	async run(ctx: PluginContext, state: PluginState, config?: Record<string, unknown>): Promise<void> {
		if (!ctx.pageHtml) return;

		const maxChars = (config?.maxChars as number) ?? DEFAULT_MAX_CHARS;
		const extraStripTags = (config?.stripTags as string[]) ?? [];
		const contentSelector = config?.contentSelector as string | undefined;
		const textOnly = !!(config?.textOnly);

		const $ = load(ctx.pageHtml);

		// Strip unwanted tags
		for (const tag of [...STRIP_TAGS, ...extraStripTags]) {
			$(tag).remove();
		}

		// Select content root
		let root: ReturnType<typeof $>;
		if (contentSelector) {
			root = $(contentSelector);
		} else {
			root = $("main, article, [role=main]").first();
		}
		if (!root.length) {
			root = $("body");
		}

		if (textOnly) {
			const lines: string[] = [];
			root.each((_, el) => extractText(el, lines));
			const text = lines
				.join(" ")
				.replace(/ *\n */g, "\n")
				.split("\n")
				.map(l => l.replace(/\s+/g, " ").trim())
				.filter(l => l.length > 1)
				.join("\n")
				.replace(/\n{3,}/g, "\n\n")
				.trim();
			state.structuredContent = maxChars > 0 ? text.slice(0, maxChars) : text;
			return;
		}

		// Strip non-semantic attributes (HTML mode only)
		$("*").each((_, el) => {
			if (el.type !== "tag") return;
			const attribs = el.attribs;
			for (const attr of Object.keys(attribs)) {
				if (!KEEP_ATTRS.has(attr)) {
					$(el).removeAttr(attr);
				}
			}
		});

		// Get cleaned HTML, collapse whitespace
		let html = root.html() ?? "";
		html = html.replace(/\s{2,}/g, " ").replace(/>\s+</g, ">\n<").trim();

		state.structuredContent = maxChars > 0 ? html.slice(0, maxChars) : html;
	},
};
