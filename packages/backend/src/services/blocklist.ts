import { join, dirname } from "node:path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";

const DATA_DIR = join(dirname(import.meta.dir), "..", "data");
const BLOCKLIST_PATH = join(DATA_DIR, "blocklist.json");

const DEFAULTS = [
	"google.com", "www.google.com",
	"bing.com", "www.bing.com",
	"duckduckgo.com",
	"mail.google.com",
	"accounts.google.com",
	"localhost",
];

function load(): string[] {
	try {
		if (existsSync(BLOCKLIST_PATH)) {
			return JSON.parse(readFileSync(BLOCKLIST_PATH, "utf-8"));
		}
	} catch {}
	return [...DEFAULTS];
}

function save(list: string[]) {
	mkdirSync(DATA_DIR, { recursive: true });
	writeFileSync(BLOCKLIST_PATH, JSON.stringify(list, null, 2));
}

export function getBlocklist(): string[] {
	return load();
}

export function addToBlocklist(domain: string): string[] {
	const list = load();
	if (!list.includes(domain)) {
		list.push(domain);
		save(list);
	}
	return list;
}

export function removeFromBlocklist(domain: string): string[] {
	const list = load().filter(d => d !== domain);
	save(list);
	return list;
}
