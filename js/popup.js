

const storage = chrome.storage.local;
const notifArea = chrome.storage.session || chrome.storage.local;
let viewModel = {}; // Just an object for the databinding

const applyBinding = () => {
	dataBind(document.body, viewModel);
};

const toggle = (prop) => {
	const area = (prop === "enableNotifications") ? notifArea : storage;
	area.get({ [prop]: false }, (obj) => {
		area.set({ [prop]: !obj[prop] });
		viewModel[prop] = !obj[prop];
		applyBinding();
	});
};


const openRedirectorSettings = () => {

	// switch to open one if we have it to minimize conflicts
	const url = chrome.runtime.getURL("redirector.html");

	chrome.tabs.query({ url }, (tabs) => {
		if (tabs.length > 0) {
			chrome.tabs.update(tabs[0].id, { active: true });
			if (tabs[0].windowId) {
				chrome.windows.update(tabs[0].windowId, { focused: true });
			}
			close();
			return;
		}

		chrome.tabs.create({ url, active: true });
	});

};


const pageLoad = () => {
	storage.get({ logging: false, disabled: false, enablePost: false }, (obj) => {
		notifArea.get({ enableNotifications: false }, (notifObj) => {
			viewModel = { ...obj, ...notifObj };
			applyBinding();
		});
	});

	el("#enable-notifications").addEventListener("input", () => toggle("enableNotifications"));
	el("#enable-logging").addEventListener("input", () => toggle("logging"));
	el("#toggle-disabled").addEventListener("click", () => toggle("disabled"));
	el("#enable-post").addEventListener("click", () => toggle("enablePost"));
	el("#open-redirector-settings").addEventListener("click", openRedirectorSettings);
};

pageLoad();
// Setup page...