import { runExtraction, buildSnapshot } from "./extractor.js";

let cachedSnapshotData: Record<string, unknown> | null = null;
let cachedPageText = "";

function scheduleExtraction() {
	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", () => setTimeout(extract, 1500));
	} else {
		setTimeout(extract, 1500);
	}
}

function extract() {
	const extractions = runExtraction();
	if (extractions.length === 0) return;

	chrome.runtime.sendMessage({ type: "EXTRACTIONS", extractions });

	const snapshotData = buildSnapshot(extractions);
	cachedPageText = document.body.innerText.trim().slice(0, 3000);
	if (Object.keys(snapshotData).length > 0) {
		cachedSnapshotData = snapshotData;
	}
}

scheduleExtraction();

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
	if (message.type === "GET_PAGE_TEXT") {
		sendResponse({ pageText: document.body.innerText.trim().slice(0, 3000) });
	} else if (message.type === "GET_SNAPSHOT_DATA") {
		sendResponse({
			snapshotData: cachedSnapshotData,
			pageText: cachedPageText || document.body.innerText.trim().slice(0, 3000),
		});
	}
	return true;
});
