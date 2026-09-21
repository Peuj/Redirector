// Shows a message explaining how many redirects were imported.
const showImportedMessage = (imported, existing, unsafe) => {
	const parts = [];
	let success = false;

	if (imported > 0) {
		parts.push(`Successfully imported ${imported} redirect${imported > 1 ? "s" : ""}.`);
		success = true;
	}
	if (existing > 0) {
		const n = existing === 1 ? "1 redirect" : `${existing} redirects`;
		parts.push(`${n} already existed and ${existing === 1 ? "was" : "were"} ignored.`);
	}
	if (unsafe > 0) {
		const n = unsafe === 1 ? "1 redirect" : `${unsafe} redirects`;
		parts.push(`${n} ${unsafe === 1 ? "was" : "were"} skipped due to an unsafe regex pattern.`);
	}

	if (parts.length === 0) {
		showMessage("No redirects existed in the file.");
	} else {
		showMessage(parts.join(" "), success);
	}
};

const importRedirects = (ev) => {

	const file = ev.target.files[0];
	if (!file) {
		return;
	}
	const reader = new FileReader();

	reader.onload = () => {
		let data;
		try {
			data = JSON.parse(reader.result);
		} catch (e) {
			showMessage(`Failed to parse JSON data, invalid JSON: ${(e.message || "").substr(0, 100)}`);
			return;
		}

		if (!data.redirects) {
			showMessage("Invalid JSON, missing \"redirects\" property");
			return;
		}

		let imported = 0,
			existing = 0,
			unsafe = 0;
		for (let i = 0; i < data.redirects.length; i++) {
			const r = new Redirect(data.redirects[i]);
			const isRegex = r.patternType === Redirect.REGEX;
			const patternError = Redirect.validateRegexSafety(r.includePattern, isRegex) ||
				Redirect.validateRegexSafety(r.excludePattern, isRegex) ||
				(r.processMatches === "replace" && r.usePatternForReplace && Redirect.validateRegexSafety(r.replacePattern, isRegex));
			if (patternError) {
				unsafe++;
				continue;
			}
			r.updateExampleResult();
			if (REDIRECTS.some(item => new Redirect(item).equals(r))) {
				existing++;
			} else {
				REDIRECTS.push(r.toObject());
				imported++;
			}
		}

		showImportedMessage(imported, existing, unsafe);

		saveChanges();
		renderRedirects();
	};

	try {
		reader.readAsText(file, "utf-8");
	} catch (e) {
		showMessage("Failed to read import file");
	}
};

const updateExportLink = () => {
	const redirects = REDIRECTS.map((r) => new Redirect(r).toObject());

	const	version = chrome.runtime.getManifest().version;

	const exportObj = {
		createdBy: `Redirector v${version}`,
		createdAt: new Date(),
		redirects
	};

	const json = JSON.stringify(exportObj, null, 4);

	// Using encodeURIComponent here instead of base64 because base64 always messed up our encoding for some reason...
	el("#export-link").href = `data:text/plain;charset=utf-8,${encodeURIComponent(json)}`;
};

updateExportLink();

const exportSingleRedirect = (index) => {
	const redirect = REDIRECTS[index];
	if (!redirect) {
		showMessage("Redirect not found");
		return;
	}

	const version = chrome.runtime.getManifest().version;
	const exportObj = {
		createdBy: `Redirector v${version}`,
		createdAt: new Date(),
		redirects: [new Redirect(redirect).toObject()]
	};
	const json = JSON.stringify(exportObj, null, 4);
	const filename = `${(redirect.description || "My").replace(/[^a-zA-Z0-9]/g, "-").substring(0, 50)} redirector.json`;

	const link = document.createElement("a");
	link.href = `data:text/plain;charset=utf-8,${encodeURIComponent(json)}`;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);

	showMessage(`Successfully exported: ${redirect.description || "Unnamed redirect"}`, true);
};

const setupImportExportEventListeners = () => {
	el("#import-file").addEventListener("change", importRedirects);
	el("#export-link").addEventListener("click", updateExportLink);
	Object.assign(dataActions, { exportSingleRedirect });
};

setupImportExportEventListeners();