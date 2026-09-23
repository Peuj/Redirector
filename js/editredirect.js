// Everything to do with the edit and delete forms is here...

let activeRedirect = null;

const createNewRedirect = () => {
	activeRedirect = new Redirect();
	el("#edit-redirect-form h3").textContent = "Create Redirect";
	collapseAdvancedOptions();
	expandHelperPanel();
	showForm("#edit-redirect-form", activeRedirect);
	el("#btn-save-redirect").setAttribute("disabled", "disabled");
	setTimeout(() => el("#helper-from-url").focus(), 200);
};

const editRedirect = (index) => {
	el("#edit-redirect-form h3").textContent = "Edit Redirect";
	activeRedirect = new Redirect(REDIRECTS[index]); // Make a new one, which we can dump a bunch of stuff on...
	activeRedirect.existing = true;
	activeRedirect.index = index;
	collapseAdvancedOptions();
	collapseHelperPanel();
	toggleReplaceProcessForm(activeRedirect.processMatches);
	showForm("#edit-redirect-form", activeRedirect);
	setTimeout(() => el("input[data-bind=\"description\"]").focus(), 200); // Why not working...?
};

const cancelEdit = () => {
	collapseAdvancedOptions();
	collapseHelperPanel();
	toggleReplaceProcessForm(null, true);
	activeRedirect = null;
	hideForm("#edit-redirect-form");
};

const saveRedirect = () => {
	const savedRedirect = new Redirect(activeRedirect);
	if (activeRedirect.existing) {
		REDIRECTS[activeRedirect.index] = savedRedirect; // To strip out any extra crap we've added
	} else {
		REDIRECTS.push(savedRedirect);
		const newNode = template.cloneNode(true);
		newNode.removeAttribute("id");
		el(".redirect-rows").appendChild(newNode);
	}

	updateBindings();
	saveChanges();
	collapseAdvancedOptions();
	collapseHelperPanel();
	hideForm("#edit-redirect-form");
};

const toggleAdvancedOptions = (ev) => {
	ev.preventDefault();
	const advancedOptions = el(".advanced");
	if (advancedOptions.classList.contains("hidden")) {
		advancedOptions.classList.remove("hidden");
		el("#advanced-toggle button").textContent = "Hide advanced options...";
	} else {
		advancedOptions.classList.add("hidden");
		el("#advanced-toggle button").textContent = "Advanced options...";
	}
};

const collapseAdvancedOptions = () => {
	el(".advanced").classList.add("hidden");
	el("#advanced-toggle button").textContent = "Advanced options...";
};

const expandHelperPanel = () => {
	el("#helper-panel").classList.remove("hidden");
	el("#helper-toggle button").textContent = "Hide URL helper...";
};

const collapseHelperPanel = () => {
	el("#helper-panel").classList.add("hidden");
	el("#helper-toggle button").textContent = "Fill from URL pair...";
	el("#helper-from-url").value = "";
	el("#helper-to-url").value = "";
	setHelperError(null);
};

const toggleHelperPanel = (ev) => {
	ev.preventDefault();
	if (el("#helper-panel").classList.contains("hidden")) {
		expandHelperPanel();
		el("#helper-from-url").focus();
	} else {
		collapseHelperPanel();
	}
};

const setHelperError = (msg) => {
	const err = el("#helper-error");
	if (!err) return;
	if (msg) {
		err.textContent = msg;
		err.classList.remove("hidden");
	} else {
		err.textContent = "";
		err.classList.add("hidden");
	}
};

const generateRuleFromUrls = (fromUrl, toUrl) => {
	if (!fromUrl || !toUrl || fromUrl === toUrl) return null;

	let fromParsed, toParsed;
	try {
		fromParsed = new URL(fromUrl);
		toParsed = new URL(toUrl);
	} catch (_) {
		fromParsed = null;
		toParsed = null;
	}

	let description = "";
	if (fromParsed && toParsed && fromParsed.hostname !== toParsed.hostname) {
		description = `Redirect ${fromParsed.hostname} to ${toParsed.hostname}`;
	}

	if (fromParsed && toParsed) {
		const fromRest = fromParsed.pathname + fromParsed.search + fromParsed.hash;
		const toRest = toParsed.pathname + toParsed.search + toParsed.hash;
		if (fromRest === toRest) {
			// Same path, different origin: simple domain swap
			return {
				includePattern: `${fromParsed.origin}/*`,
				redirectUrl: `${toParsed.origin}/$1`,
				patternType: "W",
				description
			};
		}
	}

	// Character-level suffix matching for partial path rewrites
	let suffixLen = 0;
	const maxSuffix = Math.min(fromUrl.length, toUrl.length) - 1;
	while (
		suffixLen < maxSuffix &&
		fromUrl[fromUrl.length - 1 - suffixLen] === toUrl[toUrl.length - 1 - suffixLen]
	) {
		suffixLen++;
	}

	if (suffixLen === 0) {
		return { includePattern: fromUrl, redirectUrl: toUrl, patternType: "W", description };
	}

	let fromBase = fromUrl.substring(0, fromUrl.length - suffixLen);
	let toBase = toUrl.substring(0, toUrl.length - suffixLen);
	const suffix = fromUrl.substring(fromUrl.length - suffixLen);

	// Avoid splitting in the middle of '://'
	if ((/:\/*$/).test(fromBase) || (/:\/*$/).test(toBase)) {
		return { includePattern: fromUrl, redirectUrl: toUrl, patternType: "W", description };
	}

	// If suffix starts with '/', include it as separator so '*' captures after it
	if (suffix.startsWith("/")) {
		fromBase += "/";
		toBase += "/";
	}

	return {
		includePattern: `${fromBase}*`,
		redirectUrl: `${toBase}$1`,
		patternType: "W",
		description
	};
};

const generateFromHelper = () => {
	const fromUrl = el("#helper-from-url").value.trim();
	const toUrl = el("#helper-to-url").value.trim();
	if (!fromUrl || !toUrl) {
		setHelperError("Enter both a source and destination URL.");
		return;
	}

	const result = generateRuleFromUrls(fromUrl, toUrl);
	if (!result) {
		setHelperError("URLs are identical. Enter different source and destination URLs.");
		return;
	}

	setHelperError(null);

	el("input[data-bind=\"includePattern\"]").value = result.includePattern;
	el("input[data-bind=\"redirectUrl\"]").value = result.redirectUrl;
	el(`input[data-bind="patternType"][value="${result.patternType}"]`).checked = true;

	if (!el("input[data-bind=\"description\"]").value && result.description) {
		el("input[data-bind=\"description\"]").value = result.description;
	}
	if (!el("input[data-bind=\"exampleUrl\"]").value) {
		el("input[data-bind=\"exampleUrl\"]").value = fromUrl;
	}

	editFormChange();
};

const toggleReplaceProcessForm = (currentProcess, forceHide) => {
	const shouldHide = forceHide !== undefined ? forceHide : currentProcess !== "replace";
	for (const input of document.querySelectorAll(".replace-process-input")) {
		input.classList.toggle("hidden", shouldHide);
	}
};


const editFormChange = () => {
	// Now read values back from the form...
	for (const input of el("#edit-redirect-form").querySelectorAll("input[type=\"text\"][data-bind]")) {
		const prop = input.getAttribute("data-bind");
		activeRedirect[prop] = input.value;
	}
	activeRedirect.appliesTo = [];
	for (const input of el("#apply-to").querySelectorAll("input:checked")) {
		activeRedirect.appliesTo.push(input.value);
	}

	activeRedirect.processMatches = el("#process-matches").value;
	activeRedirect.patternType = el("[name=\"patterntype\"]:checked").value;
	activeRedirect.replaceAll = el("#replace-all").checked;
	activeRedirect.usePatternForReplace = el("#use-pattern").checked;
	activeRedirect.allowLoops = el("#allow-loops").checked;
	// Keep replacePattern in sync with replaceFrom for compile()
	activeRedirect.replacePattern = activeRedirect.replaceFrom;

	toggleReplaceProcessForm(activeRedirect.processMatches);

	activeRedirect.updateExampleResult();

	dataBind("#edit-redirect-form", activeRedirect);
};


let deleteIndex;
const confirmDeleteRedirect = (index) => {
	if (checkedIndices.size > 1 && checkedIndices.has(index)) {
		const count = checkedIndices.size;
		el("#delete-all-form h3").textContent = `Delete ${count} Selected Rules`;
		el("#delete-all-form div p").innerHTML = `Are you sure you want to delete <strong>${count}</strong> selected rules? This action cannot be undone.`;
		showForm("#delete-all-form");
	} else {
		deleteIndex = index;
		showForm("#delete-redirect-form", REDIRECTS[deleteIndex]);
	}
};

const deleteRedirect = () => {
	// Use the selection state captured before the delete button click changed it
	if (priorSelectedIndex === deleteIndex) {
		selectedIndex = null;
	} else if (priorSelectedIndex !== null && priorSelectedIndex > deleteIndex) {
		selectedIndex = priorSelectedIndex - 1;
	} else {
		selectedIndex = priorSelectedIndex;
	}

	// Compute shifted checkedIndices before splicing
	const newChecked = new Set();
	for (const idx of checkedIndices) {
		if (idx === deleteIndex) continue;
		newChecked.add(idx > deleteIndex ? idx - 1 : idx);
	}

	REDIRECTS.splice(deleteIndex, 1);
	const node = el(`.redirect-row[data-index="${deleteIndex}"]`);
	if (node) node.parentNode.removeChild(node);

	// Apply new checked state to modified REDIRECTS
	checkedIndices.clear();
	for (const idx of newChecked) checkedIndices.add(idx);
	for (let i = 0; i < REDIRECTS.length; i++) {
		if (REDIRECTS[i]) REDIRECTS[i].grouped = newChecked.has(i);
	}

	updateBindings();
	saveChanges();
	hideForm("#delete-redirect-form");
};

const cancelDelete = () => {
	hideForm("#delete-redirect-form");
};


const setupEditAndDeleteEventListeners = () => {

	el("#btn-save-redirect").addEventListener("click", saveRedirect);
	el("#btn-cancel-edit").addEventListener("click", cancelEdit);

	el("#confirm-delete").addEventListener("click", deleteRedirect);
	el("#cancel-delete").addEventListener("click", cancelDelete);

	el("#advanced-toggle button").addEventListener("click", toggleAdvancedOptions);

	el("#helper-toggle button").addEventListener("click", toggleHelperPanel);
	el("#helper-generate").addEventListener("click", generateFromHelper);
	el("#helper-from-url").addEventListener("input", () => setHelperError(null));
	el("#helper-to-url").addEventListener("input", () => setHelperError(null));

	el("#create-new-redirect").addEventListener("click", createNewRedirect);
	// Listen to any change from the edit form...
	el("#edit-redirect-form").addEventListener("input", editFormChange);

	Object.assign(dataActions, { editRedirect, confirmDeleteRedirect });
};


setupEditAndDeleteEventListeners();