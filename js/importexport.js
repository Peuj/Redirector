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
			showMessage(`Failed to parse JSON data, invalid JSON: ${(e.message || "").slice(0, 100)}`);
			ev.target.value = "";
			return;
		}

		if (!Array.isArray(data.redirects)) {
			showMessage("Invalid JSON, missing \"redirects\" property");
			ev.target.value = "";
			return;
		}

		// Pre-build a canonical key for each existing redirect so duplicate
		// detection is O(n+m) rather than O(n*m).
		const redirectKey = (r) => {
			const appliesTo = r.appliesTo.slice().sort().join(",");
			return [
				r.description, r.exampleUrl, r.includePattern, r.excludePattern,
				r.patternDesc, r.redirectUrl, r.patternType, r.processMatches,
				r.replaceFrom, r.replacePattern, r.replacement,
				String(r.replaceAll), String(r.usePatternForReplace),
				String(r.allowLoops), r.sourcePattern, appliesTo
			].join("\0");
		};
		const existingKeys = new Set(REDIRECTS.map(item => redirectKey(new Redirect(item))));

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
			const key = redirectKey(r);
			if (existingKeys.has(key)) {
				existing++;
			} else {
				existingKeys.add(key); // also prevent duplicates within the imported file itself
				REDIRECTS.push(r);
				imported++;
			}
		}

		showImportedMessage(imported, existing, unsafe);

		saveChanges();
		renderRedirects();
		ev.target.value = "";
	};

	try {
		reader.readAsText(file, "utf-8");
	} catch (e) {
		showMessage("Failed to read import file");
		ev.target.value = "";
	}
};

const updateExportLink = () => {
	const redirects = checkedIndices.size > 0
		? [...checkedIndices].sort((a, b) => a - b).map(i => REDIRECTS[i]).filter(Boolean).map(r => new Redirect(r).toObject())
		: REDIRECTS.map((r) => new Redirect(r).toObject());

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

const setupImportExportEventListeners = () => {
	el("#import-file").addEventListener("change", importRedirects);
	el("#export-link").addEventListener("click", updateExportLink);
};

setupImportExportEventListeners();