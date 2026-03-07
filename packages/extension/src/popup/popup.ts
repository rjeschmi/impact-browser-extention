import { checkHealth } from "../lib/api.js";

const statusDot = document.getElementById("statusDot") as HTMLDivElement;
const statusText = document.getElementById("statusText") as HTMLSpanElement;
const info = document.getElementById("info") as HTMLDivElement;
const toggleBtn = document.getElementById("toggleBtn") as HTMLButtonElement;
const dashboardBtn = document.getElementById(
	"dashboardBtn",
) as HTMLButtonElement;

async function updateStatus() {
	const backendOnline = await checkHealth();

	const response = await chrome.runtime.sendMessage({ type: "GET_STATUS" });

	if (!backendOnline) {
		statusDot.className = "status-dot offline";
		statusText.textContent = "Backend offline";
	} else if (response.isPaused) {
		statusDot.className = "status-dot paused";
		statusText.textContent = "Paused";
	} else {
		statusDot.className = "status-dot";
		statusText.textContent = "Tracking";
	}

	const parts = [];
	if (response.queueLength > 0) {
		parts.push(`${response.queueLength} visits queued`);
	}
	if (response.activeTab) {
		parts.push(`Current: ${response.activeTab.domain}`);
	}
	info.textContent = parts.length > 0 ? parts.join(" | ") : "All synced";

	toggleBtn.textContent = response.isPaused
		? "Resume Tracking"
		: "Pause Tracking";
}

toggleBtn.addEventListener("click", async () => {
	await chrome.runtime.sendMessage({ type: "TOGGLE_PAUSE" });
	updateStatus();
});

dashboardBtn.addEventListener("click", () => {
	chrome.tabs.create({ url: "http://localhost:7890" });
});

updateStatus();
