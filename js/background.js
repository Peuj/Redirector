
// Load Redirect class in service worker context (Chrome MV3).
// Firefox MV3 EventPage loads redirect.js via the manifest scripts array.
if (typeof importScripts !== "undefined") {
	importScripts("redirect.js");
}

const log = (msg, force) => {
	if (log.enabled || force) {
		console.log(`REDIRECTOR: ${msg}`);
	}
};
log.enabled = false;

let enableNotifications = false;
let enablePost = false;

const isFirefox = Boolean(navigator.userAgent.match(/Firefox/i));
const isOpera = Boolean(navigator.userAgent.match(/OPR\//i));

// Which storage area holds redirects (local or sync).
// Only mutated once all async migration work in toggle-sync has completed.
let storageArea = chrome.storage.local;

// Redirects partitioned by request type to minimise the set checked per request.
let partitionedRedirects = {};

// One-shot ignore map: url → timestamp. Prevents the redirect target from being
// immediately re-redirected after a rule fires.
const ignoreNextRequest = {};

// Loop-detection map: url → { timestamp, count }.
const justRedirected = {};
const redirectThreshold = 3;

const updateIcon = () => {
	chrome.storage.local.get({ disabled: false }, (obj) => {
		if (obj.disabled) {
			chrome.action.setBadgeText({ text: "off" });
			chrome.action.setBadgeBackgroundColor({ color: "#fc5953" });
			if (chrome.action.setBadgeTextColor) chrome.action.setBadgeTextColor({ color: "#fafafa" });
		} else {
			chrome.action.setBadgeText({ text: "on" });
			chrome.action.setBadgeBackgroundColor({ color: "#35b44a" });
			if (chrome.action.setBadgeTextColor) chrome.action.setBadgeTextColor({ color: "#fafafa" });
		}
	});
};

const isRedirectLoop = (url) => {
	const data = justRedirected[url];
	const threshold = 3000;
	if (!data || (Date.now() - data.timestamp) > threshold) {
		justRedirected[url] = { timestamp: Date.now(), count: 1 };
		return false;
	}
	data.count++;
	if (data.count >= redirectThreshold) {
		log(`Ignoring ${url} because we have redirected it ${data.count} times in the last ${threshold}ms`);
		return true;
	}
	return false;
};

const checkRedirects = (details) => {
	// Only redirect GET by default; POST redirects must be explicitly enabled
	if (!enablePost && details.method !== "GET") return {};

	log(`Checking: ${details.type}: ${details.url}`);

	const list = partitionedRedirects[details.type];
	if (!list) {
		log(`No list for type: ${details.type}`);
		return {};
	}

	const timestamp = ignoreNextRequest[details.url];
	if (timestamp) {
		log(`Ignoring ${details.url}, was just redirected ${Date.now() - timestamp}ms ago`);
		delete ignoreNextRequest[details.url];
		return {};
	}

	for (const r of list) {
		const sourceUrl = details.initiator || details.originUrl || "";
		const result = r.getMatch(details.url, false, sourceUrl);

		if (result.isMatch) {
			if (!r.allowLoops && isRedirectLoop(details.url)) return {};

			log(`Redirecting ${details.method.toUpperCase()} ${details.url} ===> ${result.redirectTo}, type: ${details.type}, pattern: ${r.includePattern} which is in Rule : ${r.description}`);

			if (enableNotifications) sendNotifications(r, details.url, result.redirectTo);
			if (!r.allowLoops) ignoreNextRequest[result.redirectTo] = Date.now();

			return { redirectUrl: result.redirectTo };
		}
	}

	return {};
};

const monitorChanges = (changes) => {
	if (changes.disabled) {
		updateIcon();
		if (changes.disabled.newValue === true) {
			log("Disabling Redirector, removing listener");
			chrome.webRequest.onBeforeRequest.removeListener(checkRedirects);
			chrome.webNavigation.onHistoryStateUpdated.removeListener(checkHistoryStateRedirects);
			if (!isFirefox) updateDNRRules([]);
		} else {
			log("Enabling Redirector, setting up listener");
			setUpRedirectListener();
		}
	}
	if (changes.redirects) {
		log("Redirects have changed, setting up listener again");
		setUpRedirectListener();
	}
	if (changes.logging) {
		log.enabled = changes.logging.newValue;
		log(`Logging settings have changed to ${changes.logging.newValue}`, true);
	}
	if (changes.enableNotifications) {
		enableNotifications = changes.enableNotifications.newValue;
		log(`notifications setting changed to ${enableNotifications}`);
	}
	if (changes.enablePost) {
		enablePost = changes.enablePost.newValue;
		log(`Enable POST setting has changed to ${enablePost}`);
		// Rebuild DNR rules so requestMethods filter stays in sync
		if (!isFirefox) getRedirects((obj) => updateDNRRules(obj.redirects));
	}
	if (changes.customVariables) {
		Redirect.customVariables = changes.customVariables.newValue || {};
	}
};
chrome.storage.onChanged.addListener(monitorChanges);

chrome.commands.onCommand.addListener((command) => {
	if (command === "toggle-redirector") {
		chrome.storage.local.get({ disabled: false }, (obj) => {
			chrome.storage.local.set({ disabled: !obj.disabled });
		});
	}
});

const createFilter = (redirects) => {
	const types = [];
	for (const redirect of redirects) {
		for (const type of redirect.appliesTo) {
			if (chrome.webRequest.ResourceType[type.toUpperCase()] !== undefined && !types.includes(type)) {
				types.push(type);
			}
		}
	}
	types.sort();
	return { urls: ["https://*/*", "http://*/*"], types };
};

const createPartitionedRedirects = (redirects) => {
	const partitioned = {};
	for (const rObj of redirects) {
		const redirect = new Redirect(rObj);
		try {
			redirect.compile();
		} catch (e) {
			log(`Skipping rule "${rObj.description || "?"}" — compile error: ${e.message}`, true);
			continue;
		}
		for (const requestType of redirect.appliesTo) {
			if (partitioned[requestType]) {
				partitioned[requestType].push(redirect);
			} else {
				partitioned[requestType] = [redirect];
			}
		}
	}
	return partitioned;
};

// Chrome MV3: resource types recognised by declarativeNetRequest.
const DNR_RESOURCE_TYPES = new Set([
	"main_frame", "sub_frame", "stylesheet", "script", "image",
	"font", "object", "xmlhttprequest", "ping", "csp_report",
	"media", "websocket", "webbundle", "other"
]);

const updateDNRRules = async (redirects) => {
	if (!chrome.declarativeNetRequest) return;

	const existing = await chrome.declarativeNetRequest.getDynamicRules();
	const removeRuleIds = existing.map(r => r.id);

	const candidates = [];
	for (const rObj of redirects) {
		if (rObj.disabled) continue;
		if (rObj.processMatches && rObj.processMatches !== "noProcessing") continue;
		const r = new Redirect(rObj);
		const regexFilter = r._preparePattern(r.includePattern);
		if (!regexFilter) continue;
		const resourceTypes = (rObj.appliesTo || ["main_frame"]).filter(t => DNR_RESOURCE_TYPES.has(t));
		if (!resourceTypes.length) continue;
		candidates.push({ rObj, regexFilter, resourceTypes });
	}

	const supportResults = await Promise.all(
		candidates.map(c => chrome.declarativeNetRequest.isRegexSupported({ regex: c.regexFilter, isCaseSensitive: false }))
	);

	const newRules = [];
	let id = 1;
	for (let i = 0; i < candidates.length; i++) {
		if (!supportResults[i].isSupported) {
			log(`DNR: skipping "${candidates[i].rObj.description}" (${supportResults[i].reason})`);
			continue;
		}
		const { rObj, regexFilter, resourceTypes } = candidates[i];
		const regexSubstitution = rObj.redirectUrl.replace(/\$(\d+)/g, "\\$1");
		// Respect enablePost: restrict to GET-only unless the user has enabled POST redirects
		const requestMethods = enablePost ? undefined : ["get"];
		newRules.push({
			id: id++,
			priority: 1,
			action: { type: "redirect", redirect: { regexSubstitution } },
			condition: { regexFilter, resourceTypes, isUrlFilterCaseSensitive: false, requestMethods }
		});
	}

	try {
		await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules: newRules });
		log(`DNR: ${newRules.length} rules active`, true);
	} catch (e) {
		log(`DNR: failed to update rules: ${e.message}`, true);
	}
};

const getRedirects = (callback) => {
	if (chrome.storage.managed instanceof Object) {
		chrome.storage.managed.get("redirects", (obj) => {
			if (obj && obj.redirects) {
				callback(obj);
			} else {
				storageArea.get({ redirects: [] }, callback);
			}
		});
	} else {
		storageArea.get({ redirects: [] }, callback);
	}
};

const setUpRedirectListener = () => {
	chrome.webRequest.onBeforeRequest.removeListener(checkRedirects);
	chrome.webNavigation.onHistoryStateUpdated.removeListener(checkHistoryStateRedirects);

	getRedirects((obj) => {
		const redirects = obj.redirects;
		if (redirects.length === 0) {
			log("No redirects defined, not setting up listener");
			if (!isFirefox) updateDNRRules([]);
			return;
		}

		chrome.storage.local.get({ disabled: false }, ({ disabled }) => {
			if (disabled) {
				log("Redirector is disabled, not registering listeners");
				if (!isFirefox) updateDNRRules([]);
				return;
			}

			partitionedRedirects = createPartitionedRedirects(redirects);

			if (isFirefox) {
				const filter = createFilter(redirects);
				log(`Setting filter for listener: ${JSON.stringify(filter)}`);
				if (filter.types.length > 0) {
					chrome.webRequest.onBeforeRequest.addListener(checkRedirects, filter, ["blocking"]);
				}
			} else {
				updateDNRRules(redirects);
			}

			if (partitionedRedirects.history) {
				log("Adding HistoryState Listener");
				const historyFilter = { url: [] };
				for (const r of partitionedRedirects.history) {
					const urlPattern = r._preparePattern(r.includePattern);
					if (urlPattern) historyFilter.url.push({ urlMatches: urlPattern });
				}
				chrome.webNavigation.onHistoryStateUpdated.addListener(checkHistoryStateRedirects, historyFilter);
			}
		});
	});
};

// Handle SPA navigation (YouTube, Twitter, etc.) that pushes new history states without full reloads.
const checkHistoryStateRedirects = (ev) => {
	// Build a plain object instead of mutating the browser event
	const result = checkRedirects({ ...ev, type: "history", method: "GET" });
	if (result.redirectUrl) {
		chrome.tabs.update(ev.tabId, { url: result.redirectUrl });
	}
};

chrome.runtime.onMessage.addListener(
	(request, sender, sendResponse) => {
		log(`Received background message: ${JSON.stringify(request)}`);

		if (request.type === "get-redirects") {
			log("Getting redirects from storage");
			getRedirects((obj) => {
				log(`Got redirects from storage: ${JSON.stringify(obj)}`);
				sendResponse(obj);
				log("Sent redirects to content page");
			});

		} else if (request.type === "save-redirects") {
			console.log(`Saving redirects, count=${request.redirects.length}`);
			storageArea.set({ redirects: request.redirects }, () => {
				if (chrome.runtime.lastError) {
					const msg = chrome.runtime.lastError.message;
					if (msg.includes("QUOTA_BYTES_PER_ITEM quota exceeded")) {
						sendResponse({ message: "Redirects failed to save as size of redirects larger than what's allowed by Sync. Refer Help Page" });
					} else {
						sendResponse({ message: `Redirects failed to save: ${msg}` });
					}
				} else {
					log("Finished saving redirects to storage");
					sendResponse({ message: "Redirects saved" });
				}
			});

		} else if (request.type === "get-sync-state") {
			chrome.storage.local.get({ isSyncEnabled: false }, (obj) => {
				sendResponse({ isSyncEnabled: obj.isSyncEnabled });
			});

		} else if (request.type === "toggle-sync") {
			log(`toggling sync to ${request.isSyncEnabled}`);
			chrome.storage.local.set({ isSyncEnabled: request.isSyncEnabled }, () => {
				if (request.isSyncEnabled) {
					// Validate size before committing the migration
					chrome.storage.local.getBytesInUse("redirects", (size) => {
						log(`size of redirects is ${size} bytes`);
						if (size > chrome.storage.sync.QUOTA_BYTES_PER_ITEM) {
							log(`size ${size} exceeds sync quota ${chrome.storage.sync.QUOTA_BYTES_PER_ITEM}`);
							// Revert the isSyncEnabled flag
							chrome.storage.local.set({ isSyncEnabled: false });
							sendResponse({ message: "Sync Not Possible - size of Redirects larger than what's allowed by Sync. Refer Help page" });
						} else {
							chrome.storage.local.get({ redirects: [] }, (obj) => {
								if (obj.redirects.length > 0) {
									chrome.storage.sync.set(obj, () => {
										if (chrome.runtime.lastError) {
											chrome.storage.local.set({ isSyncEnabled: false });
											sendResponse({ message: `Redirects failed to save to Sync: ${chrome.runtime.lastError.message}` });
											return;
										}
										chrome.storage.local.remove("redirects");
										storageArea = chrome.storage.sync; // commit only on success
										setUpRedirectListener();
										sendResponse({ message: "sync-enabled" });
									});
								} else {
									storageArea = chrome.storage.sync;
									sendResponse({ message: "sync-enabled" });
								}
							});
						}
					});
				} else {
					chrome.storage.sync.get({ redirects: [] }, (obj) => {
						if (obj.redirects.length > 0) {
							chrome.storage.local.set(obj, () => {
								if (chrome.runtime.lastError) {
									chrome.storage.local.set({ isSyncEnabled: true });
									sendResponse({ message: `Redirects failed to save to local storage: ${chrome.runtime.lastError.message}` });
									return;
								}
								chrome.storage.sync.remove("redirects");
								storageArea = chrome.storage.local; // commit only on success
								setUpRedirectListener();
								sendResponse({ message: "sync-disabled" });
							});
						} else {
							storageArea = chrome.storage.local;
							sendResponse({ message: "sync-disabled" });
						}
					});
				}
			});

		} else {
			log(`Unexpected message: ${JSON.stringify(request)}`);
			return false;
		}

		return true; // keep sendResponse channel open for async responses
	}
);

// First-time setup: read all settings in one call to minimise IPC round-trips.
updateIcon();

chrome.storage.local.get({
	logging: false,
	isSyncEnabled: false,
	enablePost: false,
	customVariables: {},
	disabled: false,
	storageVersion: 0
}, (obj) => {
	log.enabled = obj.logging;
	enablePost = obj.enablePost;
	Redirect.customVariables = obj.customVariables;

	if (obj.isSyncEnabled) storageArea = chrome.storage.sync;

	// Stamp storage version so future migrations can detect old data
	if (obj.storageVersion < 1) {
		chrome.storage.local.set({ storageVersion: 1 });
	}

	if (!obj.disabled) {
		setUpRedirectListener();
	} else {
		log("Redirector is disabled");
	}
});

// enableNotifications lives in session storage: it persists within a browser
// session but is cleared automatically on restart, preventing notification spam
// after the user forgets they had it enabled.
const notifArea = chrome.storage.session || chrome.storage.local;
notifArea.get({ enableNotifications: false }, (obj) => {
	enableNotifications = obj.enableNotifications;
});

log("Redirector starting up...");

const sendNotifications = (redirect, originalUrl, redirectedUrl) => {
	log("Showing redirect success notification");
	const icon = "images/icon-light-theme-48.png";
	// Reuse a fixed notification ID so rapid redirects replace rather than stack
	const notificationId = "redirector-redirect";

	if (navigator.userAgent.toLowerCase().includes("chrome") && !isOpera) {
		chrome.notifications.create(notificationId, {
			type: "list",
			items: [{ title: "Original page: ", message: originalUrl }, { title: "Redirected to: ", message: redirectedUrl }],
			title: `Redirector - Applied rule : ${redirect.description}`,
			message: `Redirector - Applied rule : ${redirect.description}`,
			iconUrl: icon
		});
	} else {
		chrome.notifications.create(notificationId, {
			type: "basic",
			title: "Redirector",
			message: `Applied rule : ${redirect.description} and redirected original page ${originalUrl} to ${redirectedUrl}`,
			iconUrl: icon
		});
	}
};

// Context menu — recreate on install/update; persists across service worker restarts.
chrome.runtime.onInstalled.addListener(() => {
	chrome.contextMenus.removeAll(() => {
		chrome.contextMenus.create({
			id: "copy-with-redirect",
			title: "Copy with Redirect",
			contexts: ["link", "page"]
		});
	});
	// Ensure the cleanup alarm exists (Chrome alarms persist across SW restarts)
	chrome.alarms.get("cleanup-loop-caches", (alarm) => {
		if (!alarm) chrome.alarms.create("cleanup-loop-caches", { periodInMinutes: 1 });
	});
});

chrome.runtime.onStartup.addListener(() => {
	updateIcon();
	// Recreate alarm in case it was cleared (e.g. extension re-enabled after disable)
	chrome.alarms.get("cleanup-loop-caches", (alarm) => {
		if (!alarm) chrome.alarms.create("cleanup-loop-caches", { periodInMinutes: 1 });
	});
});

// Periodically evict stale entries from the anti-loop caches.
// Uses chrome.alarms instead of setInterval so it fires reliably in Chrome MV3
// service workers (which can be suspended between events).
chrome.alarms.onAlarm.addListener((alarm) => {
	if (alarm.name !== "cleanup-loop-caches") return;
	const now = Date.now();
	for (const url of Object.keys(ignoreNextRequest)) {
		if (now - ignoreNextRequest[url] > 30000) delete ignoreNextRequest[url];
	}
	for (const url of Object.keys(justRedirected)) {
		if (now - justRedirected[url].timestamp > 3000) delete justRedirected[url];
	}
});

const getRedirectForUrl = (url) => {
	const list = partitionedRedirects.main_frame || [];
	for (const r of list) {
		const result = r.getMatch(url, false, "");
		if (result.isMatch) return result.redirectTo;
	}
	return null;
};

chrome.contextMenus.onClicked.addListener((info, tab) => {
	const url = info.linkUrl || info.pageUrl;
	if (!url || !tab) return;
	const redirectedUrl = getRedirectForUrl(url);
	const textToCopy = redirectedUrl || url;
	chrome.scripting.executeScript({
		target: { tabId: tab.id },
		func: (text) => {
			// navigator.clipboard.writeText is available in all supported browsers;
			// the deprecated execCommand fallback has been removed.
			return navigator.clipboard.writeText(text);
		},
		args: [textToCopy]
	}).catch((err) => {
		log(`Copy with Redirect: ${err.message}`);
	});
});