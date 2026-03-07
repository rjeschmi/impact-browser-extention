import type { PageVisit, Extraction } from "@impact/shared";
import { sendVisits, sendExtractions } from "../lib/api.js";

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

function isTrackableUrl(url: string): boolean {
	return url.startsWith("http://") || url.startsWith("https://");
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

// --- Event Listeners ---

// Tab activated (user switches tabs)
chrome.tabs.onActivated.addListener(async (activeInfo) => {
	const tab = await chrome.tabs.get(activeInfo.tabId);
	if (tab.url && tab.title) {
		startTracking(activeInfo.tabId, tab.url, tab.title);
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
