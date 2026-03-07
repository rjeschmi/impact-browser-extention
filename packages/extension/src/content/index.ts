import { runExtraction } from "./extractor.js";

// Wait for page to settle before extracting
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
}

scheduleExtraction();
