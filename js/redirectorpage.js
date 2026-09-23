const REDIRECTS = [];
const options = { isSyncEnabled: false };
const dataActions = {};
let template;

// Selection state
let selectedIndex = null;
let priorSelectedIndex = null; // selectedIndex snapshot before each .redirect-rows action
const checkedIndices = new Set();

// Tracks how many of our own saves are pending storage notification, to avoid
// treating our own storage writes as external changes in the concurrent-tab listener.
let ownSavePending = 0;

const normalize = (r) => new Redirect(r).toObject();

const saveChanges = () => {
	const arr = REDIRECTS.map(normalize);
	ownSavePending++;
	chrome.runtime.sendMessage({ type: "save-redirects", redirects: arr }, (response) => {
		if (chrome.runtime.lastError || !response) {
			ownSavePending = Math.max(0, ownSavePending - 1);
			showMessage("Error: changes could not be saved. The extension background page is not responding.", false);
			return;
		}
		if (response.message.includes("Redirects failed to save")) {
			ownSavePending = Math.max(0, ownSavePending - 1);
			showMessage(response.message, false);
		}
	});
};

const toggleSyncSetting = () => {
	const isChecked = el("#storage-sync-option input").checked;
	chrome.runtime.sendMessage({ type: "toggle-sync", isSyncEnabled: isChecked }, (response) => {
		if (chrome.runtime.lastError || !response) {
			options.isSyncEnabled = false;
			el("#storage-sync-option input").checked = false;
			showMessage("Error: could not reach background page to change sync settings.", false);
			return;
		}
		if (response.message === "sync-enabled") {
			options.isSyncEnabled = true;
			showMessage("Sync is enabled!", true);
		} else if (response.message === "sync-disabled") {
			options.isSyncEnabled = false;
			showMessage("Sync is disabled - local storage will be used!", true);
		} else if (response.message.includes("Sync Not Possible")) {
			options.isSyncEnabled = false;
			chrome.storage.local.set({ isSyncEnabled: options.isSyncEnabled });
			showMessage(response.message, false);
		} else {
			showMessage("Error occured when trying to change Sync settings. Look at the logs and raise an issue", false);
		}
		el("#storage-sync-option input").checked = options.isSyncEnabled;
	});
};

const renderSingleRedirect = (node, redirect, index) => {
	if (index === 0) redirect.$first = true;
	if (index === REDIRECTS.length - 1) redirect.$last = true;
	redirect.$index = index;

	dataBind(node, redirect);

	node.setAttribute("data-index", index);
	for (const btn of node.querySelectorAll(".btn")) {
		btn.setAttribute("data-index", index);
	}

	delete redirect.$first;
	delete redirect.$last;
	delete redirect.$index;
};

const renderRedirects = () => {
	el(".redirect-rows").textContent = "";
	for (let i = 0; i < REDIRECTS.length; i++) {
		const node = template.cloneNode(true);
		node.removeAttribute("id");
		renderSingleRedirect(node, REDIRECTS[i], i);
		el(".redirect-rows").appendChild(node);
	}
	updateExportLink();
	refreshUIState();
};

const updateBindings = () => {
	const nodes = document.querySelectorAll(".redirect-row");
	if (nodes.length !== REDIRECTS.length) {
		throw new Error(`Mismatch in lengths, Redirects are ${REDIRECTS.length}, nodes are ${nodes.length}`);
	}
	for (let i = 0; i < nodes.length; i++) {
		renderSingleRedirect(nodes[i], REDIRECTS[i], i);
	}
	refreshUIState();
};

// ── Selection ────────────────────────────────────────────────────────────────

const selectRow = (index) => {
	if (checkedIndices.size > 1) return;
	if (selectedIndex === index) return;
	if (selectedIndex !== null) {
		const prev = document.querySelector(`.redirect-row[data-index="${selectedIndex}"]`);
		if (prev) prev.classList.remove("selected");
	}
	selectedIndex = index;
	const row = document.querySelector(`.redirect-row[data-index="${index}"]`);
	if (row) row.classList.add("selected");
	updateActionStates();
};

const handleCheckboxClick = (input) => {
	const row = input.closest(".redirect-row");
	if (!row) return;
	const index = parseInt(row.getAttribute("data-index"), 10);
	if (isNaN(index)) return;
	const checkmark = input.nextElementSibling;
	if (input.checked) {
		checkedIndices.add(index);
		if (checkmark) checkmark.classList.add("checkMarked");
		row.classList.add("checked");
		if (REDIRECTS[index]) REDIRECTS[index].grouped = true;
		if (checkedIndices.size === 1) {
			selectRow(index);
		} else if (selectedIndex !== null) {
			const sel = document.querySelector(`.redirect-row[data-index="${selectedIndex}"]`);
			if (sel) sel.classList.remove("selected");
			selectedIndex = null;
		}
	} else {
		checkedIndices.delete(index);
		if (checkmark) checkmark.classList.remove("checkMarked");
		row.classList.remove("checked");
		if (REDIRECTS[index]) REDIRECTS[index].grouped = false;
		if (checkedIndices.size === 1) {
			selectRow([...checkedIndices][0]);
		} else if (checkedIndices.size === 0) {
			if (selectedIndex !== null) {
				const sel = document.querySelector(`.redirect-row[data-index="${selectedIndex}"]`);
				if (sel) sel.classList.remove("selected");
				selectedIndex = null;
			}
		}
	}
	updateActionStates();
	updateSelectAllButton();
	updateExportButtonLabel();
};

const restoreSelectionState = () => {
	for (const row of document.querySelectorAll(".redirect-row")) {
		row.classList.remove("selected", "checked");
		const checkmark = row.querySelector(".groupings");
		if (checkmark) checkmark.classList.remove("checkMarked");
		const input = row.querySelector("input[type='checkbox']");
		if (input) input.checked = false;
	}
	if (selectedIndex !== null && checkedIndices.size <= 1) {
		const row = document.querySelector(`.redirect-row[data-index="${selectedIndex}"]`);
		if (row) row.classList.add("selected");
	}
	for (const idx of checkedIndices) {
		const row = document.querySelector(`.redirect-row[data-index="${idx}"]`);
		if (row) {
			row.classList.add("checked");
			const checkmark = row.querySelector(".groupings");
			if (checkmark) checkmark.classList.add("checkMarked");
			const input = row.querySelector("input[type='checkbox']");
			if (input) input.checked = true;
		}
	}
};

const setRowMoveState = (row, canUp, canDown) => {
	for (const btn of row.querySelectorAll("[data-action='moveUp'], [data-action='moveUpTop']")) {
		if (canUp) {
			btn.removeAttribute("disabled");
			btn.classList.remove("disabled");
		} else {
			btn.setAttribute("disabled", "disabled");
			btn.classList.add("disabled");
		}
	}
	for (const btn of row.querySelectorAll("[data-action='moveDown'], [data-action='moveDownBottom']")) {
		if (canDown) {
			btn.removeAttribute("disabled");
			btn.classList.remove("disabled");
		} else {
			btn.setAttribute("disabled", "disabled");
			btn.classList.add("disabled");
		}
	}
};

const updateActionStates = () => {
	const multiChecked = checkedIndices.size > 1;

	for (const btn of document.querySelectorAll("[data-action='editRedirect'], [data-action='duplicateRedirect']")) {
		if (multiChecked) {
			btn.setAttribute("disabled", "disabled");
			btn.classList.add("disabled");
		} else {
			btn.removeAttribute("disabled");
			btn.classList.remove("disabled");
		}
	}

	// Per-row boundary reset — always correct for single/no selection.
	for (const row of document.querySelectorAll(".redirect-row")) {
		const idx = parseInt(row.getAttribute("data-index"), 10);
		if (isNaN(idx)) continue;
		setRowMoveState(row, idx !== 0, idx !== REDIRECTS.length - 1);
	}

	// Multi-select: override checked rows with group boundary state.
	// Unchecked rows keep the per-row boundary state set above.
	if (multiChecked) {
		const grouping = checkIfGroupingExists();
		if (grouping.length > 1) {
			const groupCantMoveUp = grouping[0].index === 0;
			const groupCantMoveDown = grouping[grouping.length - 1].index === REDIRECTS.length - 1;
			for (const row of document.querySelectorAll(".redirect-row")) {
				const idx = parseInt(row.getAttribute("data-index"), 10);
				if (isNaN(idx) || !checkedIndices.has(idx)) continue;
				setRowMoveState(row, !groupCantMoveUp, !groupCantMoveDown);
			}
		}
	}
};

const updateSelectAllButton = () => {
	const btn = el("#select-all-btn");
	if (!btn) return;
	const allChecked = REDIRECTS.length > 0 && checkedIndices.size === REDIRECTS.length;
	btn.textContent = allChecked ? "Clear Selection" : "Select All";
};

const updateExportButtonLabel = () => {
	const link = el("#export-link");
	if (!link) return;
	if (checkedIndices.size > 0) {
		link.textContent = "Export Selected";
		link.setAttribute("download", `${checkedIndices.size}-selected-redirector.json`);
	} else {
		link.textContent = "Export All";
		link.setAttribute("download", "Redirector.json");
	}
};


const refreshUIState = () => {
	restoreSelectionState();
	updateActionStates();
	updateSelectAllButton();
	updateExportButtonLabel();
};

// ── Data operations ───────────────────────────────────────────────────────────

const duplicateRedirect = (index) => {
	const redirect = new Redirect(REDIRECTS[index]);
	redirect.grouped = false; // duplicate starts unchecked regardless of original
	const now = new Date();
	const pad = (n) => String(n).padStart(2, "0");
	const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
	redirect.description = `${redirect.description} copy ${ts}`;
	REDIRECTS.splice(index, 0, redirect);

	// Shift selection/checked state for the insertion point
	if (selectedIndex !== null && selectedIndex >= index) selectedIndex++;
	const shifted = new Set();
	for (const idx of checkedIndices) {
		shifted.add(idx >= index ? idx + 1 : idx);
	}
	checkedIndices.clear();
	for (const idx of shifted) {
		checkedIndices.add(idx);
		if (REDIRECTS[idx]) REDIRECTS[idx].grouped = true;
	}

	const newNode = template.cloneNode(true);
	newNode.removeAttribute("id");
	el(".redirect-rows").appendChild(newNode);
	updateBindings();
	saveChanges();
};

const checkIfGroupingExists = () => {
	return [...checkedIndices].
		sort((a, b) => a - b).
		map(index => ({ row: REDIRECTS[index], index })).
		filter(item => item.row);
};

// Sync REDIRECTS[i].grouped with checkedIndices after any move
const syncGroupedProps = () => {
	for (let i = 0; i < REDIRECTS.length; i++) {
		if (REDIRECTS[i]) REDIRECTS[i].grouped = checkedIndices.has(i);
	}
};

const toggleDisabled = (index) => {
	if (checkedIndices.size > 1 && checkedIndices.has(index)) {
		// Use the clicked rule's state to determine the action for the whole group,
		// so the button label ("Enable"/"Disable") always matches what actually happens.
		const targetDisabled = REDIRECTS[index] ? !REDIRECTS[index].disabled : false;
		for (const i of checkedIndices) {
			if (REDIRECTS[i]) REDIRECTS[i].disabled = targetDisabled;
		}
	} else if (REDIRECTS[index]) REDIRECTS[index].disabled = !REDIRECTS[index].disabled;
	updateBindings();
	saveChanges();
};

const moveUp = (index) => {
	const grouping = checkIfGroupingExists();

	if (grouping.length > 1 && checkedIndices.has(index)) {
		const jumpLength = 1;
		if (grouping[0].index - jumpLength < 0) return;

		const oldGroupIndices = new Set(grouping.map(g => g.index));

		// Swap data (forward order is safe for move-up)
		for (const rule of grouping) {
			const temp = REDIRECTS[rule.index - jumpLength];
			REDIRECTS[rule.index - jumpLength] = REDIRECTS[rule.index];
			REDIRECTS[rule.index] = temp;
		}

		// Update checkedIndices
		const newChecked = new Set();
		for (const idx of checkedIndices) {
			newChecked.add(oldGroupIndices.has(idx) ? idx - jumpLength : idx);
		}
		checkedIndices.clear();
		for (const idx of newChecked) checkedIndices.add(idx);

		// Update selectedIndex
		if (selectedIndex !== null && oldGroupIndices.has(selectedIndex)) {
			selectedIndex -= jumpLength;
		}
	} else {
		if (index <= 0) return;
		[REDIRECTS[index - 1], REDIRECTS[index]] = [REDIRECTS[index], REDIRECTS[index - 1]];

		if (selectedIndex === index) selectedIndex--;
		else if (selectedIndex === index - 1) selectedIndex++;

		const hadIdx = checkedIndices.has(index);
		const hadPrev = checkedIndices.has(index - 1);
		if (hadIdx !== hadPrev) {
			if (hadIdx) {
				checkedIndices.delete(index);
				checkedIndices.add(index - 1);
			}
			if (hadPrev) {
				checkedIndices.delete(index - 1);
				checkedIndices.add(index);
			}
		}
	}

	syncGroupedProps();
	updateBindings();
	saveChanges();
};

const moveDown = (index) => {
	const grouping = checkIfGroupingExists();

	if (grouping.length > 1 && checkedIndices.has(index)) {
		const jumpLength = 1;
		if (grouping[grouping.length - 1].index + jumpLength >= REDIRECTS.length) return;

		const oldGroupIndices = new Set(grouping.map(g => g.index));

		// Reverse order avoids overwriting when moving down
		for (let i = grouping.length - 1; i >= 0; i--) {
			const rule = grouping[i];
			const temp = REDIRECTS[rule.index + jumpLength];
			REDIRECTS[rule.index + jumpLength] = REDIRECTS[rule.index];
			REDIRECTS[rule.index] = temp;
		}

		const newChecked = new Set();
		for (const idx of checkedIndices) {
			newChecked.add(oldGroupIndices.has(idx) ? idx + jumpLength : idx);
		}
		checkedIndices.clear();
		for (const idx of newChecked) checkedIndices.add(idx);

		if (selectedIndex !== null && oldGroupIndices.has(selectedIndex)) {
			selectedIndex += jumpLength;
		}
	} else {
		if (index >= REDIRECTS.length - 1) return;
		[REDIRECTS[index + 1], REDIRECTS[index]] = [REDIRECTS[index], REDIRECTS[index + 1]];

		if (selectedIndex === index) selectedIndex++;
		else if (selectedIndex === index + 1) selectedIndex--;

		const hadIdx = checkedIndices.has(index);
		const hadNext = checkedIndices.has(index + 1);
		if (hadIdx !== hadNext) {
			if (hadIdx) {
				checkedIndices.delete(index);
				checkedIndices.add(index + 1);
			}
			if (hadNext) {
				checkedIndices.delete(index + 1);
				checkedIndices.add(index);
			}
		}
	}

	syncGroupedProps();
	updateBindings();
	saveChanges();
};

const moveUpTop = (index) => {
	if (checkedIndices.size > 1 && checkedIndices.has(index)) {
		const grouping = checkIfGroupingExists();
		const sortedIdx = grouping.map(g => g.index).sort((a, b) => a - b);
		if (sortedIdx.every((idx, i) => idx === i)) return; // already at top
		const groupItems = grouping.map(g => REDIRECTS[g.index]);
		const others = REDIRECTS.filter((_, i) => !checkedIndices.has(i));
		REDIRECTS.splice(0, REDIRECTS.length, ...groupItems, ...others);
		checkedIndices.clear();
		for (let i = 0; i < groupItems.length; i++) checkedIndices.add(i);
		// Keep selectedIndex if it was in the group; map to new position
		if (selectedIndex !== null) {
			const groupPos = grouping.findIndex(g => g.index === selectedIndex);
			selectedIndex = groupPos >= 0 ? groupPos : null;
		}
	} else {
		if (index <= 0) return;
		move(REDIRECTS, index, 0);
		if (selectedIndex === index) {
			selectedIndex = 0;
		} else if (selectedIndex !== null && selectedIndex < index) {
			selectedIndex++;
		}
		const newChecked = new Set();
		for (const idx of checkedIndices) {
			newChecked.add(idx === index ? 0 : idx < index ? idx + 1 : idx);
		}
		checkedIndices.clear();
		for (const idx of newChecked) checkedIndices.add(idx);
	}
	syncGroupedProps();
	updateBindings();
	saveChanges();
};

const moveDownBottom = (index) => {
	if (checkedIndices.size > 1 && checkedIndices.has(index)) {
		const grouping = checkIfGroupingExists();
		const sortedIdx = grouping.map(g => g.index).sort((a, b) => a - b);
		const lastBase = REDIRECTS.length - grouping.length;
		if (sortedIdx.every((idx, i) => idx === lastBase + i)) return; // already at bottom
		const groupItems = grouping.map(g => REDIRECTS[g.index]);
		const others = REDIRECTS.filter((_, i) => !checkedIndices.has(i));
		REDIRECTS.splice(0, REDIRECTS.length, ...others, ...groupItems);
		const base = others.length;
		checkedIndices.clear();
		for (let i = 0; i < groupItems.length; i++) checkedIndices.add(base + i);
		if (selectedIndex !== null) {
			const groupPos = grouping.findIndex(g => g.index === selectedIndex);
			selectedIndex = groupPos >= 0 ? base + groupPos : null;
		}
	} else {
		const lastIdx = REDIRECTS.length - 1;
		if (index >= lastIdx) return;
		move(REDIRECTS, index, lastIdx);
		if (selectedIndex === index) {
			selectedIndex = lastIdx;
		} else if (selectedIndex !== null && selectedIndex > index) {
			selectedIndex--;
		}
		const newChecked = new Set();
		for (const idx of checkedIndices) {
			newChecked.add(idx === index ? lastIdx : idx > index ? idx - 1 : idx);
		}
		checkedIndices.clear();
		for (const idx of newChecked) checkedIndices.add(idx);
	}
	syncGroupedProps();
	updateBindings();
	saveChanges();
};

const selectAll = () => {
	if (REDIRECTS.length === 0) return;
	const allChecked = checkedIndices.size === REDIRECTS.length;
	if (allChecked) {
		checkedIndices.clear();
		for (const r of REDIRECTS) {
			if (r) r.grouped = false;
		}
	} else {
		checkedIndices.clear();
		for (let i = 0; i < REDIRECTS.length; i++) {
			checkedIndices.add(i);
			if (REDIRECTS[i]) REDIRECTS[i].grouped = true;
		}
		selectedIndex = null;
	}
	restoreSelectionState();
	updateActionStates();
	updateSelectAllButton();
	updateExportButtonLabel();
};

const confirmDeleteAll = () => {
	const toDelete = [...checkedIndices].sort((a, b) => b - a);

	for (const i of toDelete) {
		const node = el(`.redirect-row[data-index="${i}"]`);
		if (node) node.parentNode.removeChild(node);
		REDIRECTS.splice(i, 1);
	}

	if (selectedIndex !== null) {
		if (checkedIndices.has(selectedIndex)) {
			selectedIndex = null;
		} else {
			const deletedBefore = toDelete.filter(i => i < selectedIndex).length;
			selectedIndex -= deletedBefore;
		}
	}

	checkedIndices.clear();
	for (const r of REDIRECTS) {
		if (r) r.grouped = false;
	}

	updateBindings();
	saveChanges();
	hideForm("#delete-all-form");
};

const cancelDeleteAll = () => {
	hideForm("#delete-all-form");
};

let variableSaveTimer = null;

const createVariableRow = (key, value) => {
	const row = document.createElement("div");
	row.className = "variable-row";

	const keyInput = document.createElement("input");
	keyInput.type = "text";
	keyInput.className = "var-key";
	keyInput.value = key;
	keyInput.placeholder = "name";

	const stripKey = () => {
		const clean = keyInput.value.replace(/[^a-zA-Z0-9_]/g, "");
		if (keyInput.value !== clean) keyInput.value = clean;
		updateAddButtonState();
	};
	keyInput.addEventListener("input", stripKey);
	keyInput.addEventListener("blur", stripKey);

	const sep = document.createElement("span");
	sep.className = "var-sep";
	sep.textContent = "=";

	const valInput = document.createElement("input");
	valInput.type = "text";
	valInput.className = "var-value";
	valInput.value = value;
	valInput.placeholder = "value";
	valInput.addEventListener("blur", () => {
		valInput.value = valInput.value.trim();
		updateAddButtonState();
	});

	const onEnter = (ev) => {
		if (ev.key !== "Enter") return;
		if (!keyInput.value.trim() || !valInput.value.trim()) return;
		if (variableSaveTimer !== null) {
			clearTimeout(variableSaveTimer);
			variableSaveTimer = null;
		}
		validateDuplicateKeys();
		saveVariablesNow();
		const newRow = createVariableRow("", "");
		el("#variables-list").appendChild(newRow);
		newRow.querySelector(".var-key").focus();
		updateAddButtonState();
	};
	keyInput.addEventListener("keydown", onEnter);
	valInput.addEventListener("keydown", onEnter);

	const del = document.createElement("button");
	del.className = "btn small red var-delete";
	del.textContent = "×";
	del.addEventListener("click", () => {
		row.remove();
		validateDuplicateKeys();
		updateAddButtonState();
		saveVariablesNow();
	});

	row.append(keyInput, sep, valInput, del);
	return row;
};

const validateDuplicateKeys = () => {
	const seen = new Set();
	const dupes = new Set();
	for (const input of document.querySelectorAll(".var-key")) {
		const key = input.value.trim();
		if (key) {
			if (seen.has(key)) dupes.add(key);
			seen.add(key);
		}
	}
	for (const input of document.querySelectorAll(".var-key")) {
		input.classList.toggle("duplicate", dupes.has(input.value.trim()));
	}
	return dupes.size > 0;
};

const saveVariablesNow = () => {
	if (validateDuplicateKeys()) {
		showMessage("Fix duplicate variable names before saving.", false);
		return;
	}
	const vars = {};
	for (const row of document.querySelectorAll(".variable-row")) {
		const key = row.querySelector(".var-key").value.trim();
		const val = row.querySelector(".var-value").value.trim();
		if (key) vars[key] = val;
	}
	Redirect.customVariables = vars;
	chrome.storage.local.set({ customVariables: vars });
};

const scheduleVariableSave = () => {
	if (variableSaveTimer !== null) clearTimeout(variableSaveTimer);
	variableSaveTimer = setTimeout(() => {
		variableSaveTimer = null;
		validateDuplicateKeys();
		saveVariablesNow();
	}, 400);
};

const updateAddButtonState = () => {
	const btn = el("#add-variable-btn");
	if (!btn) return;
	const allComplete = [...document.querySelectorAll(".variable-row")].every(row => {
		const k = row.querySelector(".var-key").value.trim();
		const v = row.querySelector(".var-value").value.trim();
		return k !== "" && v !== "";
	});
	btn.disabled = !allComplete;
	btn.classList.toggle("disabled", !allComplete);
};

const loadVariables = () => {
	chrome.storage.local.get({ customVariables: {} }, (obj) => {
		Redirect.customVariables = obj.customVariables;
		const list = el("#variables-list");
		list.textContent = "";
		for (const [k, v] of Object.entries(obj.customVariables)) {
			list.appendChild(createVariableRow(k, v));
		}
		updateAddButtonState();
	});
};

const pageLoad = () => {
	template = el("#redirect-row-template");
	template.parentNode.removeChild(template);

	chrome.runtime.sendMessage({ type: "get-redirects" }, (response) => {
		console.log(`Received redirects message, count=${response.redirects.length}`);
		for (let i = 0; i < response.redirects.length; i++) {
			REDIRECTS.push(new Redirect(response.redirects[i]));
		}
		if (response.redirects.length === 0) {
			REDIRECTS.push(new Redirect({
				"description": "Example redirect, try going to http://example.com/anywordhere",
				"exampleUrl": "http://example.com/some-word-that-matches-wildcard",
				"exampleResult": "https://google.com/search?q=some-word-that-matches-wildcard",
				"error": null,
				"includePattern": "http://example.com/*",
				"excludePattern": "",
				"patternDesc": "Any word after example.com leads to google search for that word.",
				"redirectUrl": "https://google.com/search?q=$1",
				"patternType": "W",
				"processMatches": "noProcessing",
				"disabled": false,
				"appliesTo": ["main_frame"]
			}));
		}
		renderRedirects();
	});

	chrome.runtime.sendMessage({ type: "get-sync-state" }, (response) => {
		if (response && response.isSyncEnabled !== undefined) {
			options.isSyncEnabled = response.isSyncEnabled;
		} else {
			options.isSyncEnabled = false;
		}
		el("#storage-sync-option input").checked = options.isSyncEnabled;
	});

	loadVariables();

	if (navigator.userAgent.toLowerCase().includes("chrome")) {
		show("#storage-sync-option");
	}

	el("#hide-message").addEventListener("click", hideMessage);
	el("#storage-sync-option input").addEventListener("click", toggleSyncSetting);
	el("#select-all-btn").addEventListener("click", selectAll);
	el("#confirm-delete-all").addEventListener("click", confirmDeleteAll);
	el("#cancel-delete-all").addEventListener("click", cancelDeleteAll);
	el("#add-variable-btn").addEventListener("click", () => {
		el("#variables-list").appendChild(createVariableRow("", ""));
		updateAddButtonState();
	});
	el("#variables-section").addEventListener("input", () => {
		updateAddButtonState();
		scheduleVariableSave();
	});
	el(".redirect-rows").addEventListener("click", (ev) => {
		// Checkbox click: handleCheckboxClick fully owns selection state for checkboxes
		if (ev.target.type === "checkbox") {
			handleCheckboxClick(ev.target);
			return;
		}

		// Non-checkbox click: select the clicked row then run any action
		const row = ev.target.closest(".redirect-row");
		if (row) {
			const idx = parseInt(row.getAttribute("data-index"), 10);
			if (!isNaN(idx)) {
				priorSelectedIndex = selectedIndex;
				selectRow(idx);
			}
		}

		const action = ev.target.getAttribute("data-action");
		if (!action) return;
		if (ev.target.disabled) return;
		const handler = dataActions[action];
		if (!handler) return;
		const index = parseInt(ev.target.getAttribute("data-index"), 10);
		handler(index);
	});

	// Clicking outside any rule deselects the selected row
	document.addEventListener("click", (ev) => {
		if (ev.target.closest(".redirect-row, #cover, #delete-redirect-form, #delete-all-form, #edit-redirect-form")) return;
		if (selectedIndex === null) return;
		const selectedRow = document.querySelector(`.redirect-row[data-index="${selectedIndex}"]`);
		if (selectedRow) selectedRow.classList.remove("selected");
		selectedIndex = null;
		updateActionStates();
	});
};

const updateFavicon = (e) => {
	const type = e.matches ? "dark" : "light";
	el("link[rel=\"icon\"]").href = `images/icon-${type}-theme-32.png`;
	chrome.runtime.sendMessage({ type: "update-icon" });
};

const mql = window.matchMedia("(prefers-color-scheme:dark)");
mql.addEventListener("change", updateFavicon);
updateFavicon(mql);

Object.assign(dataActions, {
	toggleDisabled,
	moveUpTop,
	moveUp,
	moveDown,
	moveDownBottom,
	duplicateRedirect
});

pageLoad();

// Reload rules if another settings tab saves changes to storage.
chrome.storage.onChanged.addListener((changes) => {
	if (!changes.redirects) return;
	if (ownSavePending > 0) {
		ownSavePending--;
		return;
	}
	// Only reload when no dialog is open (cover not visible)
	if (el("#cover") && el("#cover").style.display === "block") return;
	chrome.runtime.sendMessage({ type: "get-redirects" }, (response) => {
		if (chrome.runtime.lastError || !response) return;
		REDIRECTS.length = 0;
		for (const r of response.redirects) {
			REDIRECTS.push(new Redirect(r));
		}
		checkedIndices.clear();
		selectedIndex = null;
		renderRedirects();
		showMessage("Rules updated by another window.", true);
	});
});