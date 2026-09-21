
const displayOrganizeModeMessage = () => {
    if (el("#message-box").classList.contains("visible")) {
        hideMessage();
    } else {
        showMessage("Use ⟱ to move a redirect to the bottom, ⟰ to move to the top, and use the checkboxes to select multiple redirects.", true);
    }
};

const organizeModeToggle = (ev) => {
    ev.preventDefault();
    const organizeModes = [".groupings", ".arrows"];
    for (const mode of organizeModes) {
        const organizeModeElms = document.querySelectorAll(mode);
        for (let i = 0; i < organizeModeElms.length; ++i) {
            let elm = organizeModeElms[i];
            if (mode === ".arrows") {
                // targeting parent span for arrows
                elm = elm.parentElement;
            }
            const isHidden = elm.classList.contains("hidden");
            isHidden ? elm.classList.remove("hidden") : elm.classList.add("hidden");
        }
    }

    const buttonClasses = el("#organize-mode").classList;
    !buttonClasses.contains("active") ? el("#organize-mode").classList.add("active") : el("#organize-mode").classList.remove("active");

    displayOrganizeModeMessage();
};


const setupOrganizeModeToggleEventListener = () => {
    el("#organize-mode").addEventListener("click", organizeModeToggle);
};

setupOrganizeModeToggleEventListener();