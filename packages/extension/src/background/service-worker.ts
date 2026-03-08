import type { PageVisit, Extraction } from "@impact/shared";
import { sendVisits, sendExtractions, getSnapshot } from "../lib/api.js";

interface ActiveTab {
	tabId: number;
	url: string;
	title: string;
	domain: string;
	startTime: number;
}

let activeTab: ActiveTab | null = null;
let visitQueue: PageVisit[] = [];
let isPaused = false;

function extractDomain(url: string): string {
	try {
		return new URL(url).hostname;
	} catch {
		return "";
	}
}

const VISIT_BLOCKLIST = new Set(["localhost", "127.0.0.1"]);

function isTrackableUrl(url: string): boolean {
	if (!url.startsWith("http://") && !url.startsWith("https://")) return false;
	try {
		const { hostname, port } = new URL(url);
		// Block localhost and any local port (e.g. localhost:7890 dashboard)
		if (VISIT_BLOCKLIST.has(hostname)) return false;
		if (hostname === "localhost" || hostname.endsWith(".local")) return false;
		return true;
	} catch {
		return false;
	}
}

function finalizeActiveTab() {
	if (!activeTab) return;

	const durationMs = Date.now() - activeTab.startTime;

	// Only record if visited for more than 1 second
	if (durationMs > 1000) {
		visitQueue.push({
			url: activeTab.url,
			domain: activeTab.domain,
			title: activeTab.title,
			visitedAt: activeTab.startTime,
			durationMs,
		});
	}

	activeTab = null;
}

function startTracking(tabId: number, url: string, title: string) {
	if (isPaused || !isTrackableUrl(url)) return;

	finalizeActiveTab();

	activeTab = {
		tabId,
		url,
		title,
		domain: extractDomain(url),
		startTime: Date.now(),
	};
}

// Flush queue to backend
async function flushQueue() {
	if (visitQueue.length === 0) return;

	const batch = visitQueue.splice(0, visitQueue.length);
	const success = await sendVisits(batch);

	if (!success) {
		// Put them back and try again later
		visitQueue.unshift(...batch);

		// Also save to local storage as backup
		await chrome.storage.local.set({
			pendingVisits: visitQueue,
		});
	}
}

// Restore any pending visits from storage on startup
async function restorePendingVisits() {
	const data = await chrome.storage.local.get("pendingVisits");
	if (data.pendingVisits?.length) {
		visitQueue.unshift(...data.pendingVisits);
		await chrome.storage.local.remove("pendingVisits");
	}
}

// --- Icon dot indicator ---

const iconCache = new Map<string, ImageBitmap>();

async function getIconBitmap(size: number): Promise<ImageBitmap> {
	const key = String(size);
	if (iconCache.has(key)) return iconCache.get(key)!;
	const res = await fetch(chrome.runtime.getURL(`icons/icon${size}.png`));
	const blob = await res.blob();
	const bitmap = await createImageBitmap(blob);
	iconCache.set(key, bitmap);
	return bitmap;
}

async function setIconDot(tabId: number, color: string | null) {
	const sizes = [16, 32, 48, 128];
	const imageData: Record<number, ImageData> = {};

	for (const size of sizes) {
		const canvas = new OffscreenCanvas(size, size);
		const ctx = canvas.getContext("2d")!;
		ctx.drawImage(await getIconBitmap(size), 0, 0, size, size);

		if (color) {
			const r = Math.max(2, Math.round(size * 0.16));
			const x = size - r - 1;
			const y = size - r - 1;
			// Dark ring to separate from icon background
			ctx.beginPath();
			ctx.arc(x, y, r + 1, 0, Math.PI * 2);
			ctx.fillStyle = "#0f1829";
			ctx.fill();
			// Coloured dot
			ctx.beginPath();
			ctx.arc(x, y, r, 0, Math.PI * 2);
			ctx.fillStyle = color;
			ctx.fill();
		}

		imageData[size] = ctx.getImageData(0, 0, size, size);
	}

	chrome.action.setIcon({ imageData, tabId });
	chrome.action.setBadgeText({ text: "", tabId });
}

async function updateBadge(tabId: number, domain: string) {
	if (!domain || !isTrackableUrl(`https://${domain}`)) {
		setIconDot(tabId, null);
		return;
	}
	try {
		const tab = await chrome.tabs.get(tabId).catch(() => null);
		if (!tab?.url) { setIconDot(tabId, null); return; }
		const snapshot = await getSnapshot(tab.url);
		setIconDot(tabId, snapshot.committed ? "#51cf66" : "#ff6b6b");
	} catch {
		setIconDot(tabId, null);
	}
}


// --- Event Listeners ---

// Tab activated (user switches tabs)
chrome.tabs.onActivated.addListener(async (activeInfo) => {
	const tab = await chrome.tabs.get(activeInfo.tabId);
	if (tab.url && tab.title) {
		startTracking(activeInfo.tabId, tab.url, tab.title);
		updateBadge(activeInfo.tabId, extractDomain(tab.url));
	}
});

// Tab updated (navigation within a tab)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
	if (
		changeInfo.status === "complete" &&
		tab.active &&
		tab.url &&
		tab.title
	) {
		startTracking(tabId, tab.url, tab.title);
		updateBadge(tabId, extractDomain(tab.url));
	}
});

// Tab closed
chrome.tabs.onRemoved.addListener((tabId) => {
	if (activeTab?.tabId === tabId) {
		finalizeActiveTab();
	}
});

// Window focus changed
chrome.windows.onFocusChanged.addListener((windowId) => {
	if (windowId === chrome.windows.WINDOW_ID_NONE) {
		// Browser lost focus
		finalizeActiveTab();
	}
});

// Periodic flush alarm
chrome.alarms.create("flush-visits", { periodInMinutes: 0.1 }); // Every 6 seconds

chrome.alarms.onAlarm.addListener((alarm) => {
	if (alarm.name === "flush-visits") {
		flushQueue();
	}
});

// Heartbeat: update duration for long-lived tabs
chrome.alarms.create("heartbeat", { periodInMinutes: 0.5 }); // Every 30 seconds

chrome.alarms.onAlarm.addListener((alarm) => {
	if (alarm.name === "heartbeat" && activeTab) {
		// Finalize and restart to capture duration periodically
		const { tabId, url, title } = activeTab;
		finalizeActiveTab();
		startTracking(tabId, url, title);
	}
});

// Handle extractions from content script
async function handleExtractions(extractions: Extraction[]) {
	if (isPaused || extractions.length === 0) return;
	await sendExtractions(extractions);
	// Refresh badge now that we have new data
	const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
	if (tab?.id && tab.url) updateBadge(tab.id, extractDomain(tab.url));
}

// Listen for pause/resume from popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
	if (message.type === "GET_STATUS") {
		sendResponse({
			isPaused,
			queueLength: visitQueue.length,
			activeTab: activeTab
				? { url: activeTab.url, domain: activeTab.domain }
				: null,
		});
	} else if (message.type === "EXTRACTIONS") {
		handleExtractions(message.extractions);
		sendResponse({ ok: true });
	} else if (message.type === "TOGGLE_PAUSE") {
		isPaused = !isPaused;
		if (isPaused) {
			finalizeActiveTab();
		}
		sendResponse({ isPaused });
	}
	return true; // Keep channel open for async response
});

// Startup
restorePendingVisits();
console.log("Impact service worker started");
