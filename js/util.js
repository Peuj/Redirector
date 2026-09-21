function dataBind(root, dataObject) {

	function boolValue(prop) {
		return prop.charAt(0) === "!" ? !dataObject[prop.substr(1)] : dataObject[prop];
	}

	const elem = typeof root === "string" ? document.querySelector(root) : root;
	for (const tag of elem.querySelectorAll("[data-bind]")) {
			const prop = tag.getAttribute("data-bind");
		if (tag.tagName.toLowerCase() === "input") {
			if (tag.getAttribute("type").toLowerCase() === "radio") {
				tag.checked = dataObject[prop] === tag.getAttribute("value");
            } else if (tag.getAttribute("type").toLowerCase() === "checkbox") {
                tag.checked = dataObject[prop];
            } else {
                tag.value = dataObject[prop];
			}
		} else if (tag.tagName.toLowerCase() === "select") {
			for (const opt of tag.querySelectorAll("option")) {
				if (opt.getAttribute("value") === dataObject[prop]) {
					opt.setAttribute("selected", "selected");
				} else {
					opt.removeAttribute("selected");
				}
			}
		} else if (Array.isArray(dataObject[prop])) {
			// Array of values, check any checkboxes in child elements
			for (const checkbox of tag.querySelectorAll("input[type=\"checkbox\"")) {
				checkbox.checked = dataObject[prop].includes(checkbox.getAttribute("value"));
			}

		} else {
			tag.textContent = dataObject[prop];
		}
	}
	for (const tag of elem.querySelectorAll("[data-show]")) {
		const shouldShow = boolValue(tag.getAttribute("data-show"));
		tag.style.display = shouldShow ? "" : "none";
	}
	for (const tag of elem.querySelectorAll("[data-disabled]")) {
		const isDisabled = boolValue(tag.getAttribute("data-disabled"));

		if (isDisabled) {
			tag.classList.add("disabled");
			tag.setAttribute("disabled", "disabled");
		} else {
			tag.classList.remove("disabled");
			tag.removeAttribute("disabled");
		}
	}
	for (const tag of elem.querySelectorAll("[data-class]")) {
		const [className, prop] = tag.getAttribute("data-class").split(":");
		const shouldHaveClass = boolValue(prop);
		if (shouldHaveClass) {
			tag.classList.add(className);
		} else {
			tag.classList.remove(className);
		}
	}
}

function show(id) {
	const elem = document.querySelector(id);
	elem.style.display = "block";
}

function hide(id) {
	const elem = document.querySelector(id);
	elem.style.display = "none";
}

function el(query) {
	return document.querySelector(query);
}

function showForm(selector, dataObject) {
	dataBind(selector, dataObject);
	el("#blur-wrapper").classList.add("blur");
	show("#cover");
	show(selector);
}

function move(arr, from, to) {
    arr.splice(to, 0, arr.splice(from, 1)[0]);
}

function hideForm(selector) {
	hide("#cover");
	hide(selector);
	el("#blur-wrapper").classList.remove("blur");
}

// Shows a message bar above the list of redirects.
function showMessage(message, success) {
	const messageBox = document.getElementById("message-box");
	dataBind("#message-box", { message });
	if (success) {
		messageBox.className = "visible success";
	} else {
		messageBox.className = "visible error";
	}

	const timer = 20;

	// Remove the message in 20 seconds if it hasn't been changed...
	setTimeout(function() {
		if (el("#message").textContent === message) {
			messageBox.className = ""; // Removing .visible removes the box...
		}
	}, timer * 1000);
}

function hideMessage() {
	el("#message-box").className = "";
}