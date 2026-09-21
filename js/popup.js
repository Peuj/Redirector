

const storage = chrome.storage.local;
let viewModel = {}; // Just an object for the databinding

const applyBinding = () => {
	dataBind(document.body, viewModel);
};

const toggle = (prop) => {
	storage.get({ [prop]: false }, (obj) => {
		storage.set({ [prop]: !obj[prop] });
		viewModel[prop] = !obj[prop];
		applyBinding();
	});
};


const openRedirectorSettings = () => {

	// switch to open one if we have it to minimize conflicts
	const url = chrome.runtime.getURL("redirector.html");

	// FIREFOXBUG: Firefox chokes on url:url filter if the url is a moz-extension:// url
	// so we don't use that, do it the more manual way instead.
	chrome.tabs.query({ currentWindow: true }, (tabs) => {
		for (let i = 0; i < tabs.length; i++) {
			if (tabs[i].url == url) {
				chrome.tabs.update(tabs[i].id, { active: true }, () => {
					close();
				});
				return;
			}
		}

		chrome.tabs.create({ url, active: true });
	});

};


const pageLoad = () => {
	storage.get({ logging: false, enableNotifications: false, disabled: false, enablePost: false }, (obj) => {
		viewModel = obj;
		applyBinding();
	});

	el("#enable-notifications").addEventListener("input", () => toggle("enableNotifications"));
	el("#enable-logging").addEventListener("input", () => toggle("logging"));
	el("#toggle-disabled").addEventListener("click", () => toggle("disabled"));
	el("#enable-post").addEventListener("click", () => toggle("enablePost"));
	el("#open-redirector-settings").addEventListener("click", openRedirectorSettings);
};

pageLoad();
// Setup page...