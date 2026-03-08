import { checkHealth, getBlocklist, toggleBlocklist, getDomainSummary, getExtractionsForUrl, pinExtraction } from "../lib/api.js";

const statusDot          = document.getElementById("statusDot") as HTMLDivElement;
const statusLabel        = document.getElementById("statusLabel") as HTMLSpanElement;
const snapshotStatusRow  = document.getElementById("snapshotStatusRow") as HTMLDivElement;
const snapshotStatusLabel = document.getElementById("snapshotStatusLabel") as HTMLSpanElement;
const siteDomain         = document.getElementById("siteDomain") as HTMLDivElement;
const siteMeta           = document.getElementById("siteMeta") as HTMLDivElement;
const blockBtn           = document.getElementById("blockBtn") as HTMLButtonElement;
const showDiffBtn        = document.getElementById("showDiffBtn") as HTMLButtonElement;
const toggleBtn          = document.getElementById("toggleBtn") as HTMLButtonElement;
const dashboardBtn       = document.getElementById("dashboardBtn") as HTMLButtonElement;
const extractionsSection = document.getElementById("extractionsSection") as HTMLDivElement;
const promptBtn          = document.getElementById("promptBtn") as HTMLButtonElement;
const promptSection      = document.getElementById("promptSection") as HTMLDivElement;
const promptInput        = document.getElementById("promptInput") as HTMLTextAreaElement;
const promptSubmitBtn    = document.getElementById("promptSubmitBtn") as HTMLButtonElement;

let currentDomain = "";
let currentUrl = "";
let isBlocked = false;

const KIND_PRIORITY = ["price", "deadline", "date", "todo", "keyword"];
const KIND_LABELS: Record<string, string> = {
	price: "Prices", deadline: "Deadlines", date: "Dates", todo: "TODOs", keyword: "Keywords",
};

function chipClass(kind: string) {
	if (kind === "price")    return "ext-chip ext-chip-price";
	if (kind === "deadline") return "ext-chip ext-chip-deadline";
	if (kind === "date")     return "ext-chip ext-chip-date";
	if (kind === "todo")     return "ext-chip ext-chip-todo";
	return "ext-chip ext-chip-keyword";
}

function truncate(s: string, max = 28) {
	return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

type ExtractionItem = { id: number; kind: string; value: string; isPinned: boolean };

function renderExtractions(items: ExtractionItem[]) {
	if (items.length === 0) { extractionsSection.style.display = "none"; return; }

	const pinned = items.filter(i => i.isPinned);
	const rest = items.filter(i => !i.isPinned);

	const byKind = new Map<string, ExtractionItem[]>();
	for (const item of rest) {
		if (!byKind.has(item.kind)) byKind.set(item.kind, []);
		byKind.get(item.kind)!.push(item);
	}

	const ordered = KIND_PRIORITY.filter(k => byKind.has(k))
		.concat([...byKind.keys()].filter(k => !KIND_PRIORITY.includes(k)));

	const pinnedHtml = pinned.length > 0
		? `<div class="ext-group"><div class="ext-kind">Pinned</div><div class="ext-chips">${
			pinned.map(i => chipHtml(i)).join("")
		}</div></div>`
		: "";

	const groupsHtml = ordered.map(kind => {
		const vals = byKind.get(kind)!.slice(0, 5);
		return `<div class="ext-group"><div class="ext-kind">${KIND_LABELS[kind] ?? kind}</div><div class="ext-chips">${vals.map(i => chipHtml(i)).join("")}</div></div>`;
	}).join("");

	extractionsSection.innerHTML = pinnedHtml + groupsHtml;
	extractionsSection.style.display = "block";

	for (const btn of extractionsSection.querySelectorAll<HTMLButtonElement>(".pin-btn")) {
		btn.addEventListener("click", async () => {
			const id = Number(btn.dataset.id);
			const next = btn.dataset.pinned !== "true";
			await pinExtraction(id, next);
			const item = items.find(i => i.id === id);
			if (item) { item.isPinned = next; renderExtractions(items); }
		});
	}
}

function chipHtml(item: ExtractionItem): string {
	const v = item.value.replace(/"/g, "&quot;");
	const opacity = item.isPinned ? "1" : "0.2";
	return `<span class="chip-row">` +
		`<span class="${chipClass(item.kind)}${item.isPinned ? " pinned" : ""}" title="${v}">${truncate(item.value)}</span>` +
		`<button class="pin-btn" data-id="${item.id}" data-pinned="${item.isPinned}" title="${item.isPinned ? "Unpin" : "Pin"}" style="opacity:${opacity}">📌</button>` +
		`</span>`;
}

async function init() {
	const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
	try {
		currentUrl = tab?.url ?? "";
		currentDomain = currentUrl ? new URL(currentUrl).hostname : "";
	} catch {
		currentUrl = "";
		currentDomain = "";
	}

	await Promise.all([updateStatus(), updateSiteSection()]);
}

async function updateStatus() {
	const [backendOnline, response] = await Promise.all([
		checkHealth(),
		chrome.runtime.sendMessage({ type: "GET_STATUS" }),
	]);

	if (!backendOnline) {
		statusDot.className = "dot offline";
		statusLabel.textContent = "Backend offline";
	} else if (response.isPaused) {
		statusDot.className = "dot paused";
		statusLabel.textContent = "Paused";
	} else {
		statusDot.className = "dot";
		statusLabel.textContent = "Tracking";
	}

	toggleBtn.textContent = response.isPaused ? "Resume Tracking" : "Pause Tracking";

	// Snapshot processing indicator
	const snapshotActive = response.snapshotProcessing || response.snapshotQueued > 0;
	snapshotStatusRow.style.display = snapshotActive ? "flex" : "none";
	if (snapshotActive) {
		const total = response.snapshotQueued + (response.snapshotProcessing ? 1 : 0);
		snapshotStatusLabel.textContent = total > 1
			? `Processing snapshot… (${total} queued)`
			: "Processing snapshot…";
	}
}

async function updateSiteSection() {
	if (!currentDomain) {
		siteDomain.textContent = "No page active";
		siteMeta.textContent = "";
		blockBtn.style.display = "none";
		showDiffBtn.style.display = "none";
		promptBtn.style.display = "none";
		return;
	}

	siteDomain.textContent = currentDomain;
	blockBtn.style.display = "block";

	const blocklist = await getBlocklist();
	isBlocked = blocklist.includes(currentDomain);
	renderBlockBtn();

	if (isBlocked) {
		siteMeta.textContent = "Not tracked";
		showDiffBtn.style.display = "none";
		promptBtn.style.display = "none";
		extractionsSection.style.display = "none";
	} else {
		siteMeta.textContent = "";
		showDiffBtn.style.display = "block";
		promptBtn.style.display = "block";

		if (currentUrl) {
			getExtractionsForUrl(currentUrl).then(renderExtractions).catch(() => {});
		}
	}
}

function renderBlockBtn() {
	if (isBlocked) {
		blockBtn.className = "block-btn blocked";
		blockBtn.textContent = "✕  Blocked — click to unblock";
	} else {
		blockBtn.className = "block-btn";
		blockBtn.textContent = "Block this site";
	}
}

blockBtn.addEventListener("click", async () => {
	if (!currentDomain) return;
	const next = !isBlocked;
	await toggleBlocklist(currentDomain, next);
	isBlocked = next;
	renderBlockBtn();
	siteMeta.textContent = next ? "Not tracked" : "Will be tracked";
});

showDiffBtn.addEventListener("click", async () => {
	if (!currentUrl || !currentDomain) return;
	showDiffBtn.textContent = "Queuing…";
	showDiffBtn.disabled = true;

	try {
		const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
		let snapshotData: Record<string, unknown> = {};
		let pageText = "";
		let pageHtml: string | undefined;
		try {
			const data = await chrome.tabs.sendMessage(tab.id!, { type: "GET_SNAPSHOT_DATA" }) as { snapshotData: Record<string, unknown> | null; pageText: string; pageHtml?: string };
			snapshotData = data.snapshotData ?? {};
			pageText = data.pageText;
			pageHtml = data.pageHtml;
		} catch {
			// Content script not ready — queue with empty data
		}
		await chrome.runtime.sendMessage({
			type: "QUEUE_SNAPSHOT",
			url: currentUrl,
			domain: currentDomain,
			snapshotData,
			pageText,
			pageHtml,
		});
	} catch {
		// If queuing fails, still open dashboard
	}

	const url = `http://localhost:7890?domain=${encodeURIComponent(currentDomain)}&url=${encodeURIComponent(currentUrl)}&view=diff`;
	chrome.tabs.create({ url });
	window.close();
});

toggleBtn.addEventListener("click", async () => {
	await chrome.runtime.sendMessage({ type: "TOGGLE_PAUSE" });
	updateStatus();
});

dashboardBtn.addEventListener("click", () => {
	const url = currentDomain
		? `http://localhost:7890?domain=${encodeURIComponent(currentDomain)}`
		: "http://localhost:7890";
	chrome.tabs.create({ url });
});

promptBtn.addEventListener("click", () => {
	const isVisible = promptSection.style.display !== "none";
	promptSection.style.display = isVisible ? "none" : "block";
});

promptSubmitBtn.addEventListener("click", () => {
	const userPrompt = promptInput.value.trim();
	if (!userPrompt || !currentUrl || !currentDomain) return;

	const dashUrl = `http://localhost:7890?domain=${encodeURIComponent(currentDomain)}&url=${encodeURIComponent(currentUrl)}&prompt=${encodeURIComponent(userPrompt)}`;
	chrome.tabs.create({ url: dashUrl });
	window.close();
});

init();
