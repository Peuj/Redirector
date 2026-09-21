// Everything to do with the edit and delete forms is here...

let activeRedirect = null;

const createNewRedirect = () => {
	activeRedirect = new Redirect();
	el("#edit-redirect-form h3").textContent = "Create Redirect";
	showForm("#edit-redirect-form", activeRedirect);
	el("#btn-save-redirect").setAttribute("disabled", "disabled");
};

const editRedirect = (index) => {
	el("#edit-redirect-form h3").textContent = "Edit Redirect";
	activeRedirect = new Redirect(REDIRECTS[index]); // Make a new one, which we can dump a bunch of stuff on...
	activeRedirect.existing = true;
	activeRedirect.index = index;
	toggleReplaceProcessForm(activeRedirect.processMatches);
	showForm("#edit-redirect-form", activeRedirect);
	setTimeout(() => el("input[data-bind=\"description\"]").focus(), 200); // Why not working...?
};

const cancelEdit = () => {
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
	hideForm("#edit-redirect-form");
};

const toggleAdvancedOptions = (ev) => {
	ev.preventDefault();
	const advancedOptions = el(".advanced");
	if (advancedOptions.classList.contains("hidden")) {
		advancedOptions.classList.remove("hidden");
		el("#advanced-toggle a").textContent = "Hide advanced options...";
	} else {
		advancedOptions.classList.add("hidden");
		el("#advanced-toggle a").textContent = "Show advanced options...";
	}
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

	activeRedirect.processMatches = el("#process-matches option:checked").value;
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
	deleteIndex = index;
	const redirect = REDIRECTS[deleteIndex];
	showForm("#delete-redirect-form", redirect);
};

const deleteRedirect = () => {
	REDIRECTS.splice(deleteIndex, 1);
	const node = el(`.redirect-row[data-index="${deleteIndex}"]`);
	node.parentNode.removeChild(node);
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

	el("#advanced-toggle a").addEventListener("click", toggleAdvancedOptions);

	el("#create-new-redirect").addEventListener("click", createNewRedirect);
	// Listen to any change from the edit form...
	el("#edit-redirect-form").addEventListener("input", editFormChange);

	Object.assign(dataActions, { editRedirect, confirmDeleteRedirect });
};


setupEditAndDeleteEventListeners();