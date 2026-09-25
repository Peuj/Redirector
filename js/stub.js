
// Dummy file to use while developing the UI. This way we can just develop it on a local fileserver, and don't have to reload
// an extension for every tiny change!

if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {

     const testData = {
        "createdBy": "Redirector v3.2",
        "createdAt": "2019-12-09T12:54:13.391Z",
        "redirects": [
            {
                "description": "Mbl test",
                "exampleUrl": "https://mbl.is",
                "exampleResult": "http://foo.is",
                "error": null,
                "includePattern": "*mbl*",
                "excludePattern": "",
                "patternDesc": "My description",
                "redirectUrl": "http://foo.is",
                "patternType": "R",
                "processMatches": "noProcessing",
                "disabled": false,
                "appliesTo": [
                    "main_frame",
                    "script"
                ]
            },
            {
                "description": "Msdfsdfbl test",
                "exampleUrl": "https://mbssfdsl.is",
                "exampleResult": "http://foo.is",
                "error": null,
                "includePattern": "*mbl*",
                "excludePattern": "",
                "patternDesc": "My description",
                "redirectUrl": "http://foo.is",
                "patternType": "W",
                "processMatches": "urlEncode",
                "disabled": false,
                "appliesTo": [
                    "main_frame",
                    "sub_frame"
                ]
            }, {
                "description": "https://foo.is?s=joh",
                "exampleUrl": "https://foo.is?s=joh",
                "exampleResult": "https://foo.is",
                "error": null,
                "includePattern": "(.*)(\\?s=)(.*)",
                "excludePattern": "",
                "patternDesc": "Test error",
                "redirectUrl": "$1",
                "patternType": "R",
                "processMatches": "noProcessing",
                "disabled": false,
                "appliesTo": [
                    "main_frame"
                ]
            }
        ]
    };

    try {
        if (!localStorage.redirector) {
            localStorage.redirector = JSON.stringify(testData);
        }
    } catch (_) {
        // localStorage unavailable (e.g. file:// with strict security)
    }


    // Make dummy for testing...
    window.chrome = window.chrome || {};
    chrome.storage = {
        local: {
            get(defaults, callback) {
                let data;
                try {
                    data = JSON.parse(localStorage.redirector || "{}");
                } catch (_) {
                    data = {};
                }
                const result = {};
                for (const key in defaults) {
                    if (typeof data[key] !== "undefined") {
                        result[key] = data[key];
                    } else {
                        result[key] = defaults[key];
                    }
                }
                callback(result);
            },

            set(obj, callback) {
                let data;
                try {
                    data = JSON.parse(localStorage.redirector || "{}");
                } catch (_) {
                    data = {};
                }
                for (const k in obj) {
                    data[k] = obj[k];
                }
                localStorage.redirector = JSON.stringify(data);
                if (callback) callback();
            }
        }
    };

    chrome.runtime = {
        sendMessage(params, callback) {
            if (params.type === "get-redirects") {
                chrome.storage.local.get({ redirects: [] }, callback);
            } else if (params.type === "save-redirects") {
                chrome.storage.local.set({ redirects: params.redirects }, () => {
                    if (callback) callback({ status: "ok", message: "Redirects saved" });
                });
            } else if (params.type === "toggle-sync") {
                if (params.isSyncEnabled) {
                    if (callback) callback({ status: "sync-enabled", message: "sync-enabled" });
                } else if (callback) {
                    callback({ status: "sync-disabled", message: "sync-disabled" });
                }
            } else if (params.type === "get-sync-state") {
                if (callback) callback({ isSyncEnabled: false });
            }
        },
        getManifest() {
            return { version: "0-dev" };
        }
    };
}