
// Load Redirect class in service worker context (Chrome MV3).
// Firefox MV3 EventPage loads redirect.js via the manifest scripts array.
if (typeof importScripts !== "undefined") {
	importScripts("redirect.js");
}

// This is the background script. It is responsible for actually redirecting requests,
// as well as monitoring changes in the redirects and the disabled status and reacting to them.
function log(msg, force) {
	if (log.enabled || force) {
		console.log(`REDIRECTOR: ${msg}`);
	}
}
log.enabled = false;
let enableNotifications = false;
let enablePost = false;

function isDarkMode() {
	// window.matchMedia is not available in Chrome MV3 service workers
	if (typeof window === "undefined") return false;
	return window.matchMedia("(prefers-color-scheme: dark)").matches;
}
const isFirefox = Boolean(navigator.userAgent.match(/Firefox/i));

let storageArea = chrome.storage.local;
// Redirects partitioned by request type, so we have to run through
// the minimum number of redirects for each request.
let partitionedRedirects = {};

// Cache of urls that have just been redirected to. They will not be redirected again, to
// stop recursive redirects, and endless redirect chains.
// Key is url, value is timestamp of redirect.
const ignoreNextRequest = {

};

// url => { timestamp:ms, count:1...n};
const justRedirected = {

};
const redirectThreshold = 3;

function setIcon(image) {
	const data = {
		path: {}
	};

	for (const nr of [16, 19, 32, 38, 48, 64, 128]) {
		data.path[nr] = `images/${image}-${nr}.png`;
	}

	chrome.action.setIcon(data, function() {
		const err = chrome.runtime.lastError;
		if (err) {
			// If not checked we will get unchecked errors in the background page console...
			log(`Error in SetIcon: ${err.message}`);
		}
	});
}

// Returns true if the URL is being redirected too frequently and should be ignored.
// Updates the justRedirected tracking structure as a side effect.
function isRedirectLoop(url) {
	const data = justRedirected[url];
	const threshold = 3000;
	if (!data || ((new Date().getTime() - data.timestamp) > threshold)) {
		justRedirected[url] = { timestamp: new Date().getTime(), count: 1 };
		return false;
	}
	data.count++;
	justRedirected[url] = data;
	if (data.count >= redirectThreshold) {
		log(`Ignoring ${url} because we have redirected it ${data.count} times in the last ${threshold}ms`);
		return true;
	}
	return false;
}

// This is the actual function that gets called for each request and must
// decide whether or not we want to redirect.
function checkRedirects(details) {

	// By default we only allow GET request to be redirected, don't want to accidentally redirect
	// sensitive POST parameters
	if (!enablePost && details.method !== "GET") {
		return {};
	}
	log(`Checking: ${details.type}: ${details.url}`);

	const list = partitionedRedirects[details.type];
	if (!list) {
		log(`No list for type: ${details.type}`);
		return {};
	}

	const timestamp = ignoreNextRequest[details.url];
	if (timestamp) {
		log(`Ignoring ${details.url}, was just redirected ${new Date().getTime() - timestamp}ms ago`);
		delete ignoreNextRequest[details.url];
		return {};
	}


	for (let i = 0; i < list.length; i++) {
		const r = list[i];
		const sourceUrl = details.initiator || details.originUrl || "";
		const result = r.getMatch(details.url, false, sourceUrl);

		if (result.isMatch) {

			if (!r.allowLoops && isRedirectLoop(details.url)) {
				return {};
			}

			log(`Redirecting ${details.method.toUpperCase()} ${details.url} ===> ${result.redirectTo}, type: ${details.type}, pattern: ${r.includePattern} which is in Rule : ${r.description}`);
			if (enableNotifications) {
				sendNotifications(r, details.url, result.redirectTo);
			}
			if (!r.allowLoops) {
				ignoreNextRequest[result.redirectTo] = new Date().getTime();
			}

			return { redirectUrl: result.redirectTo };
		}
	}

  	return {};
}

// Monitor changes in data, and setup everything again.
// This could probably be optimized to not do everything on every change
// but why bother?
function monitorChanges(changes) {
	if (changes.disabled) {
		updateIcon();

		if (changes.disabled.newValue == true) {
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
		log(`Logging settings have changed to ${changes.logging.newValue}`, true); // Always want this to be logged...
	}
	if (changes.enableNotifications) {
		log(`notifications setting changed to ${changes.enableNotifications.newValue}`);
		enableNotifications = changes.enableNotifications.newValue;
	}

	if (changes.enablePost) {
		log(`Enable POST setting has changed to ${changes.enablePost.newValue}`);
		enablePost = changes.enablePost.newValue;
	}
	if (changes.customVariables) {
		Redirect.customVariables = changes.customVariables.newValue || {};
	}
}
chrome.storage.onChanged.addListener(monitorChanges);

// Creates a filter to pass to the listener so we don't have to run through
// all the redirects for all the request types we don't have any redirects for anyway.
function createFilter(redirects) {
	const types = [];
	for (let i = 0; i < redirects.length; i++) {
		redirects[i].appliesTo.forEach(function(type) {
			// Added this condition below as part of fix for issue 115 https://github.com/einaregilsson/Redirector/issues/115
			// Firefox considers responsive web images request as imageset. Chrome doesn't.
			// Chrome throws an error for imageset type, so let's add to 'types' only for the values that chrome or firefox supports
			if (chrome.webRequest.ResourceType[type.toUpperCase()] !== undefined) {
			if (types.indexOf(type) == -1) {
				types.push(type);
			}
		}
		});
	}
	types.sort();

	return {
		urls: ["https://*/*", "http://*/*", "data:*/*"],
		types
	};
}

function createPartitionedRedirects(redirects) {
	const partitioned = {};

	for (let i = 0; i < redirects.length; i++) {
		const redirect = new Redirect(redirects[i]);
		redirect.compile();
		for (let j = 0; j < redirect.appliesTo.length; j++) {
			const requestType = redirect.appliesTo[j];
			if (partitioned[requestType]) {
				partitioned[requestType].push(redirect);
			} else {
				partitioned[requestType] = [redirect];
			}
		}
	}
	return partitioned;
}

// Chrome MV3: resource types recognised by declarativeNetRequest.
// 'history' is a Redirector-internal type for SPA navigation; 'imageset' is Firefox-only.
const DNR_RESOURCE_TYPES = new Set([
	"main_frame", "sub_frame", "stylesheet", "script", "image",
	"font", "object", "xmlhttprequest", "ping", "csp_report",
	"media", "websocket", "webbundle", "other"
]);

// Chrome MV3: register active redirects as declarativeNetRequest dynamic rules.
// Rules with processMatches transforms or regex not supported by RE2 are silently skipped.
async function updateDNRRules(redirects) {
	if (!chrome.declarativeNetRequest) return;

	const existing = await chrome.declarativeNetRequest.getDynamicRules();
	const removeRuleIds = existing.map(r => r.id);
	const newRules = [];
	let id = 1;

	for (const rObj of redirects) {
		if (rObj.disabled) continue;
		// declarativeNetRequest has no JS execution, so processMatches transforms cannot be applied
		if (rObj.processMatches && rObj.processMatches !== "noProcessing") continue;

		const r = new Redirect(rObj);
		const regexFilter = r._preparePattern(r.includePattern);
		if (!regexFilter) continue;

		 
		const supported = await chrome.declarativeNetRequest.isRegexSupported({
			regex: regexFilter,
			isCaseSensitive: false
		});
		if (!supported.isSupported) {
			log(`DNR: skipping "${rObj.description}" (${supported.reason})`);
			continue;
		}

		// DNR uses \1 \2 capture group syntax; Redirector uses $1 $2
		const regexSubstitution = rObj.redirectUrl.replace(/\$(\d+)/g, "\\$1");
		const resourceTypes = (rObj.appliesTo || ["main_frame"]).filter(t => DNR_RESOURCE_TYPES.has(t));
		if (!resourceTypes.length) continue;

		newRules.push({
			id: id++,
			priority: 1,
			action: { type: "redirect", redirect: { regexSubstitution } },
			condition: { regexFilter, resourceTypes, isUrlFilterCaseSensitive: false }
		});
	}

	try {
		await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules: newRules });
		log(`DNR: ${newRules.length} rules active`, true);
	} catch (e) {
		log(`DNR: failed to update rules: ${e.message}`, true);
	}
}

// Reads redirects from managed storage (browser policy) if available, falls back to user storageArea.
function getRedirects(callback) {
	if (chrome.storage.managed instanceof Object) {
		chrome.storage.managed.get("redirects", function(obj) {
			if (obj && obj.redirects) {
				callback(obj);
			} else {
				storageArea.get({ redirects: [] }, callback);
			}
		});
	} else {
		storageArea.get({ redirects: [] }, callback);
	}
}

// Sets up the listener, partitions the redirects, creates the appropriate filters etc.
function setUpRedirectListener() {

	chrome.webRequest.onBeforeRequest.removeListener(checkRedirects); // Unsubscribe first, in case there are changes...
	chrome.webNavigation.onHistoryStateUpdated.removeListener(checkHistoryStateRedirects);

	getRedirects(function(obj) {
		const redirects = obj.redirects;
		if (redirects.length == 0) {
			log("No redirects defined, not setting up listener");
			if (!isFirefox) updateDNRRules([]);
			return;
		}

		partitionedRedirects = createPartitionedRedirects(redirects);

		if (isFirefox) {
			// Firefox MV3 still supports blocking webRequest
			const filter = createFilter(redirects);
			log(`Setting filter for listener: ${JSON.stringify(filter)}`);
			chrome.webRequest.onBeforeRequest.addListener(checkRedirects, filter, ["blocking"]);
		} else {
			// Chrome/Edge/Opera MV3: use declarativeNetRequest for URL redirects
			updateDNRRules(redirects);
		}

		if (partitionedRedirects.history) {
			log("Adding HistoryState Listener");

			const historyFilter = { url: [] };
			for (const r of partitionedRedirects.history) {
				historyFilter.url.push({ urlMatches: r._preparePattern(r.includePattern) });
			}
			chrome.webNavigation.onHistoryStateUpdated.addListener(checkHistoryStateRedirects, historyFilter);
		}
	});
}

// Redirect urls on places like Facebook and Twitter who don't do real reloads, only do ajax updates and push a new url to the address bar...
function checkHistoryStateRedirects(ev) {
	ev.type = "history";
	ev.method = "GET";
	const result = checkRedirects(ev);
	if (result.redirectUrl) {
		chrome.tabs.update(ev.tabId, { url: result.redirectUrl });
	}
}

// Sets on/off badge, and for Chrome updates dark/light mode icon
function updateIcon() {
	chrome.storage.local.get({ disabled: false }, function(obj) {

		// Do this here so even in Chrome we get the icon not too long after an dark/light mode switch...
		if (!isFirefox) {
			if (isDarkMode()) {
				setIcon("icon-dark-theme");
			} else {
				setIcon("icon-light-theme");
			}
		}

		if (obj.disabled) {
			chrome.action.setBadgeText({ text: "off" });
			chrome.action.setBadgeBackgroundColor({ color: "#fc5953" });
			if (chrome.action.setBadgeTextColor) { // Not supported in Chrome
				chrome.action.setBadgeTextColor({ color: "#fafafa" });
			}
		} else {
			chrome.action.setBadgeText({ text: "on" });
			chrome.action.setBadgeBackgroundColor({ color: "#35b44a" });
			if (chrome.action.setBadgeTextColor) { // Not supported in Chrome
				chrome.action.setBadgeTextColor({ color: "#fafafa" });
			}
		}
	});
}


// Firefox doesn't allow the "content script" which is actually privileged
// to access the objects it gets from chrome.storage directly, so we
// proxy it through here.
chrome.runtime.onMessage.addListener(
	function(request, sender, sendResponse) {
		log(`Received background message: ${JSON.stringify(request)}`);
		if (request.type == "get-redirects") {
			log("Getting redirects from storage");
			getRedirects(function(obj) {
				log(`Got redirects from storage: ${JSON.stringify(obj)}`);
				sendResponse(obj);
				log("Sent redirects to content page");
			});
		} else if (request.type == "save-redirects") {
			console.log(`Saving redirects, count=${request.redirects.length}`);
			delete request.type;
			storageArea.set(request, function() {
				if (chrome.runtime.lastError) {
				 if (chrome.runtime.lastError.message.indexOf("QUOTA_BYTES_PER_ITEM quota exceeded") > -1) {
					log("Redirects failed to save as size of redirects larger than allowed limit per item by Sync");
					sendResponse({
						message: "Redirects failed to save as size of redirects larger than what's allowed by Sync. Refer Help Page"
					});
				 }
				} else {
				log("Finished saving redirects to storage");
				sendResponse({
					message: "Redirects saved"
				});
			}
			});
		} else if (request.type == "update-icon") {
			updateIcon();
		} else if (request.type == "get-sync-state") {
			chrome.storage.local.get({ isSyncEnabled: false }, function(obj) {
				sendResponse({ isSyncEnabled: obj.isSyncEnabled });
			});
		} else if (request.type == "toggle-sync") {
			// Notes on Toggle Sync feature here https://github.com/einaregilsson/Redirector/issues/86#issuecomment-389943854
			// This provides for feature request - issue 86
			delete request.type;
			log(`toggling sync to ${request.isSyncEnabled}`);
			// Setting for Sync enabled or not, resides in Local.
			chrome.storage.local.set({
					isSyncEnabled: request.isSyncEnabled
				},
				function () {
					if (request.isSyncEnabled) {
						storageArea = chrome.storage.sync;
						log(`storageArea size for sync is 5 MB but one object (redirects) is allowed to hold only ${storageArea.QUOTA_BYTES_PER_ITEM / 1000000} MB, that is .. ${storageArea.QUOTA_BYTES_PER_ITEM} bytes`);
						chrome.storage.local.getBytesInUse("redirects",
							function (size) {
								log(`size of redirects is ${size} bytes`);
								if (size > storageArea.QUOTA_BYTES_PER_ITEM) {
									log(`size of redirects ${size} is greater than allowed for Sync which is ${storageArea.QUOTA_BYTES_PER_ITEM}`);
									// Setting storageArea back to Local.
									storageArea = chrome.storage.local;
									sendResponse({
										message: "Sync Not Possible - size of Redirects larger than what's allowed by Sync. Refer Help page"
									});
								} else {
									chrome.storage.local.get({
										redirects: []
									}, function (obj) {
										// check if at least one rule is there.
										if (obj.redirects.length > 0) {
											chrome.storage.sync.set(obj, function() {
												log("redirects moved from Local to Sync Storage Area");
												// Remove Redirects from Local storage
												chrome.storage.local.remove("redirects");
												// Call setupRedirectListener to setup the redirects
												setUpRedirectListener();
												sendResponse({
													message: "sync-enabled"
												});
											});
										} else {
											log("No redirects are setup currently in Local, just enabling Sync");
											sendResponse({
												message: "sync-enabled"
											});
										}
									});
								}
							});
						} else {
						storageArea = chrome.storage.local;
						log(`storageArea size for local is ${storageArea.QUOTA_BYTES / 1000000} MB, that is .. ${storageArea.QUOTA_BYTES} bytes`);
						chrome.storage.sync.get({
							redirects: []
						}, function (obj) {
							if (obj.redirects.length > 0) {
								chrome.storage.local.set(obj, function() {
									log("redirects moved from Sync to Local Storage Area");
									// Remove Redirects from sync storage
									chrome.storage.sync.remove("redirects");
									// Call setupRedirectListener to setup the redirects
									setUpRedirectListener();
									sendResponse({
										message: "sync-disabled"
									});
								});
							} else {
								sendResponse({
									message: "sync-disabled"
								});
							}
						});
					}
				});

		} else {
			log(`Unexpected message: ${JSON.stringify(request)}`);
			return false;
		}

		return true; // This tells the browser to keep sendResponse alive because
		// we're sending the response asynchronously.
	}
);


// First time setup
updateIcon();

chrome.storage.local.get({ logging: false }, function(obj) {
	log.enabled = obj.logging;
});

chrome.storage.local.get({
	isSyncEnabled: false
}, function (obj) {
	if (obj.isSyncEnabled) {
		storageArea = chrome.storage.sync;
	} else {
		storageArea = chrome.storage.local;
	}
	// Now we know which storageArea to use, call setupInitial function
	setupInitial();
});

// wrapped the below inside a function so that we can call this once we know the value of storageArea from above.

function setupInitial() {
	chrome.storage.local.get({ enableNotifications: false }, function(obj) {
		enableNotifications = obj.enableNotifications;
	});

	chrome.storage.local.get({ enablePost: false }, function(obj) {
		enablePost = obj.enablePost;
	});

	chrome.storage.local.get({ customVariables: {} }, function(obj) {
		Redirect.customVariables = obj.customVariables;
	});

	chrome.storage.local.get({
		disabled: false
	}, function (obj) {
		if (!obj.disabled) {
			setUpRedirectListener();
		} else {
			log("Redirector is disabled");
		}
	});
}
log("Redirector starting up...");


// Below is a feature request by an user who wished to see visual indication for an Redirect rule being applied on URL
// https://github.com/einaregilsson/Redirector/issues/72
// By default, we will have it as false. If user wishes to enable it from settings page, we can make it true until user disables it (or browser is restarted)

// Upon browser startup, just set enableNotifications to false.
// Listen to a message from Settings page to change this to true.
function sendNotifications(redirect, originalUrl, redirectedUrl) {
	log("Showing redirect success notification");
	// Firefox and other browsers does not yet support "list" type notification like in Chrome.
	// Can't check if "chrome" typeof either, as Firefox supports both chrome and browser namespace.
	// So let's use useragent.
	// Opera UA has both chrome and OPR. So check against that (only Chrome supports list type) - other browsers get BASIC type notifications.

	const icon = isDarkMode() ? "images/icon-dark-theme-48.png" : "images/icon-light-theme-48.png";

	if (navigator.userAgent.toLowerCase().indexOf("chrome") > -1 && navigator.userAgent.toLowerCase().indexOf("opr") < 0) {

		const items = [{ title: "Original page: ", message: originalUrl }, { title: "Redirected to: ", message: redirectedUrl }];
		const head = `Redirector - Applied rule : ${redirect.description}`;
		chrome.notifications.create({
			type: "list",
			items,
			title: head,
			message: head,
			iconUrl: icon
		  });
		}
	else {
		const message = `Applied rule : ${redirect.description} and redirected original page ${originalUrl} to ${redirectedUrl}`;

		chrome.notifications.create({
        	type: "basic",
        	title: "Redirector",
			message,
			iconUrl: icon
		});
	}
}

chrome.runtime.onStartup.addListener(handleStartup);

// Context menu: "Copy with Redirect"
// Recreate on install/update; item persists across service worker restarts.
chrome.runtime.onInstalled.addListener(() => {
	chrome.contextMenus.removeAll(() => {
		chrome.contextMenus.create({
			id: "copy-with-redirect",
			title: "Copy with Redirect",
			contexts: ["link", "page"]
		});
	});
});

// Returns the first redirect URL that matches `url` for main_frame requests,
// or null if no rule matches.
function getRedirectForUrl(url) {
	const list = partitionedRedirects.main_frame || [];
	for (const r of list) {
		const result = r.getMatch(url);
		if (result.isMatch) return result.redirectTo;
	}
	return null;
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
	const url = info.linkUrl || info.pageUrl;
	if (!url || !tab) return;
	const redirectedUrl = getRedirectForUrl(url);
	const textToCopy = redirectedUrl || url;
	chrome.scripting.executeScript({
		target: { tabId: tab.id },
		func: (text) => {
			if (navigator.clipboard) {
				return navigator.clipboard.writeText(text);
			}
			const el = document.createElement("textarea");
			el.value = text;
			el.style.position = "fixed";
			el.style.opacity = "0";
			document.body.appendChild(el);
			el.focus();
			el.select();
			document.execCommand("copy");
			document.body.removeChild(el);
		},
		args: [textToCopy]
	}).catch((err) => {
		log(`Copy with Redirect: ${err.message}`);
	});
});
function handleStartup() {
	enableNotifications = false;
	chrome.storage.local.set({
		enableNotifications: false
	});

	updateIcon(); // To set dark/light icon...

	// window.matchMedia is not available in Chrome MV3 service workers
	if (typeof window !== "undefined") {
		const darkModeMql = window.matchMedia("(prefers-color-scheme: dark)");
		darkModeMql.onchange = updateIcon;
	}
}