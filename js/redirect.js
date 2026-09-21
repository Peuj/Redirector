
function Redirect(o) {
	this._init(o);
}

/* global exports */
// temp, allow addon sdk to require this.
if (typeof exports !== "undefined") {
	exports.Redirect = Redirect;
}

// Static
Redirect.WILDCARD = "W";
Redirect.REGEX = "R";

// Returns an error string if the pattern is unsafe to run in a blocking webRequest listener, null if safe.
// Only call with isRegex=true for REGEX-type patterns; wildcard patterns escape special chars and can't have backreferences.
Redirect.validateRegexSafety = function(pattern, isRegex) {
    if (!pattern) return null;
    if (pattern.length > 2000) return "Pattern too long (max 2000 characters)";
    // Backreferences bypass V8's linear-time engine and can cause catastrophic backtracking on carefully crafted URLs
    if (isRegex && (/\\[1-9]|\\k</).test(pattern)) return "Pattern contains backreferences";
    return null;
};

Redirect.requestTypes = {
	main_frame: "Main window (address bar)",
	sub_frame: "IFrames",
	stylesheet: "Stylesheets",
	font: "Fonts",
	script: "Scripts",
	image: "Images",
	imageset: "Responsive Images in Firefox",
	media: "Media (audio and video)",
	object: "Objects (e.g. Flash content, Java applets)",
	object_subrequest: "Object subrequests",
	xmlhttprequest: "XMLHttpRequests (Ajax)",
	history: "HistoryState",
	other: "Other"
};


Redirect.prototype = {

	// attributes
	description: "",
	exampleUrl: "",
	exampleResult: "",
	error: null,
	includePattern: "",
	excludePattern: "",
	patternDesc: "",
	redirectUrl: "",
	patternType: "",
	processMatches: "noProcessing",
	replaceFrom: "",
	replacePattern: "",
	replacement: "",
	replaceAll: false,
	usePatternForReplace: false,
	disabled: false,
	grouped: false,

	compile() {

		const incPattern = this._preparePattern(this.includePattern);
		const excPattern = this._preparePattern(this.excludePattern);

		if (incPattern) {
			this._rxInclude = new RegExp(incPattern, "gi");
		}
		if (excPattern) {
			this._rxExclude = new RegExp(excPattern, "gi");
		}
		if (this.processMatches === "replace" && this.usePatternForReplace && this.replacePattern) {
			const replPattern = this._preparePattern(this.replacePattern);
			if (replPattern) {
				this._rxReplace = new RegExp(replPattern, this.replaceAll ? "gi" : "i");
			}
		}
	},

	equals(redirect) {
		return this.description == redirect.description &&
			this.exampleUrl == redirect.exampleUrl &&
			this.includePattern == redirect.includePattern &&
			this.excludePattern == redirect.excludePattern &&
			this.patternDesc == redirect.patternDesc &&
			this.redirectUrl == redirect.redirectUrl &&
			this.patternType == redirect.patternType &&
			this.processMatches == redirect.processMatches &&
			this.replaceFrom == redirect.replaceFrom &&
			this.replacement == redirect.replacement &&
			this.replaceAll == redirect.replaceAll &&
			this.usePatternForReplace == redirect.usePatternForReplace &&
			this.appliesTo.toString() == redirect.appliesTo.toString();
	},

	toObject() {
		return {
			description: this.description,
			exampleUrl: this.exampleUrl,
			exampleResult: this.exampleResult,
			error: this.error,
			includePattern: this.includePattern,
			excludePattern: this.excludePattern,
			patternDesc: this.patternDesc,
			redirectUrl: this.redirectUrl,
			patternType: this.patternType,
			processMatches: this.processMatches,
			replaceFrom: this.replaceFrom,
			replacePattern: this.replacePattern,
			replacement: this.replacement,
			replaceAll: this.replaceAll,
			usePatternForReplace: this.usePatternForReplace,
			disabled: this.disabled,
			grouped: this.grouped,
			appliesTo: this.appliesTo.slice(0)
		};
	},

	getMatch(url, forceIgnoreDisabled) {
		if (!this._rxInclude) {
			this.compile();
		}
		const result = {
			isMatch: false,
			isExcludeMatch: false,
			isDisabledMatch: false,
			redirectTo: "",
			toString() { return JSON.stringify(this); }
		};
		const redirectTo = this._includeMatch(url);

		if (redirectTo !== null) {
			if (this.disabled && !forceIgnoreDisabled) {
				result.isDisabledMatch = true;
			} else if (this._excludeMatch(url)) {
				result.isExcludeMatch = true;
			} else {
				result.isMatch = true;
				result.redirectTo = redirectTo;
			}
		}
		return result;
	},

	// Updates the .exampleResult field or the .error
	// field depending on if the example url and patterns match
	// and make a good redirect
	updateExampleResult() {

		// Default values
		this.error = null;
		this.exampleResult = "";


		if (!this.exampleUrl) {
			this.error = "No example URL defined.";
			return;
		}

		if (this.patternType == Redirect.REGEX && this.includePattern) {
			try {
				// eslint-disable-next-line no-new
				new RegExp(this.includePattern, "gi");
			} catch (e) {
				this.error = "Invalid regular expression in Include pattern.";
				return;
			}
		}

		if (this.patternType == Redirect.REGEX && this.excludePattern) {
			try {
				// eslint-disable-next-line no-new
				new RegExp(this.excludePattern, "gi");
			} catch (e) {
				this.error = "Invalid regular expression in Exclude pattern.";
				return;
			}
		}

		if (this.processMatches === "replace" && this.patternType == Redirect.REGEX && this.usePatternForReplace && this.replacePattern) {
			try {
				// eslint-disable-next-line no-new
				new RegExp(this.replacePattern, "gi");
			} catch (e) {
				this.error = "Invalid regular expression in Replace pattern.";
				return;
			}
		}

		if (!this.appliesTo || this.appliesTo.length == 0) {
			this.error = "At least one request type must be chosen.";
			return;
		}

		this.compile();

		const match = this.getMatch(this.exampleUrl, true);

		if (match.isExcludeMatch) {
			this.error = "The exclude pattern excludes the example url.";
			return;
		}

		// Commented out because this code prevents saving many types of valid redirects.
		// if (match.isMatch && !match.redirectTo.match(/^https?\:\/\//)) {
		//	this.error = 'The redirect result must start with http:// or https://, current result is: "' + match.redirectTo;
		//	return;
		// }

    if (!match.isMatch) {
			this.error = "The include pattern does not match the example url.";
			return;
		}

		this.exampleResult = match.redirectTo;
	},

	isRegex() {
		return this.patternType == Redirect.REGEX;
	},

	isWildcard() {
		return this.patternType == Redirect.WILDCARD;
	},

	test() {
		return this.getMatch(this.exampleUrl);
	},

	// Private functions below
	_rxInclude: null,
	_rxExclude: null,
	_rxReplace: null,

	_preparePattern(pattern) {
		if (!pattern) {
			return null;
		}
		if (this.patternType == Redirect.REGEX) {
			return pattern;
		} // Convert wildcard to regex pattern
			let converted = "^";
			for (let i = 0; i < pattern.length; i++) {
				const ch = pattern.charAt(i);
				if ("()[]{}?.^$\\+".indexOf(ch) != -1) {
					converted += `\\${ch}`;
				} else if (ch == "*") {
					converted += "(.*?)";
				} else {
					converted += ch;
				}
			}
			converted += "$";
			return converted;
		
	},

	_init(o = {}) {
		this.description = o.description || "";
		this.exampleUrl = o.exampleUrl || "";
		this.exampleResult = o.exampleResult || "";
		this.error = o.error || null;
		this.includePattern = o.includePattern || "";
		this.excludePattern = o.excludePattern || "";
		this.redirectUrl = o.redirectUrl || "";
		this.patternType = o.patternType || Redirect.WILDCARD;

		this.patternTypeText = this.patternType == "W" ? "Wildcard" : "Regular Expression";

		this.patternDesc = o.patternDesc || "";
		this.processMatches = o.processMatches || "noProcessing";
		if (!o.processMatches && o.unescapeMatches) {
			this.processMatches = "urlDecode";
		}
		if (!o.processMatches && o.escapeMatches) {
			this.processMatches = "urlEncode";
		}
		this.replaceFrom = o.replaceFrom || "";
		this.replacePattern = o.replacePattern || o.replaceFrom || "";
		this.replacement = o.replacement || "";
		this.replaceAll = Boolean(o.replaceAll);
		this.usePatternForReplace = Boolean(o.usePatternForReplace);

		this.disabled = Boolean(o.disabled);
		if (o.appliesTo && o.appliesTo.length) {
			this.appliesTo = o.appliesTo.slice(0);
		} else {
			this.appliesTo = ["main_frame"];
		}
	},

	get appliesToText() {
		return this.appliesTo.map(type => Redirect.requestTypes[type] || type).join(", ");
	},

	get processMatchesExampleText() {
		const examples = {
			noProcessing: "Use matches as they are",
			replace: "Find and replace text within each match",
			urlEncode: "E.g. turn /bar/foo?x=2 into %2Fbar%2Ffoo%3Fx%3D2",
			urlDecode: "E.g. turn %2Fbar%2Ffoo%3Fx%3D2 into /bar/foo?x=2",
			doubleUrlDecode: "E.g. turn %252Fbar%252Ffoo%253Fx%253D2 into /bar/foo?x=2",
			base64Encode: "E.g. turn http://cnn.com into aHR0cDovL2Nubi5jb20=",
			base64Decode: "E.g. turn aHR0cDovL2Nubi5jb20= into http://cnn.com",
			base64decode: "E.g. turn aHR0cDovL2Nubi5jb20= into http://cnn.com"
		};

		return examples[this.processMatches];
	},

	toString() {
		return JSON.stringify(this.toObject(), null, 2);
	},

	_includeMatch(url) {
		if (!this._rxInclude) {
			return null;
		}
		const matches = this._rxInclude.exec(url);
		if (!matches) {
			return null;
		}
		let resultUrl = this.redirectUrl;
		for (let i = matches.length - 1; i > 0; i--) {
			let repl = matches[i] || "";
			if (this.processMatches === "replace") {
				const pattern = this.usePatternForReplace ? (this._rxReplace || null) : (this.replaceFrom || null);
				if (pattern !== null) {
					repl = this.replaceAll
						? repl.replaceAll(pattern, this.replacement)
						: repl.replace(pattern, this.replacement);
				}
			} else if (this.processMatches == "urlDecode") {
				repl = unescape(repl);
			} else if (this.processMatches == "doubleUrlDecode") {
				repl = unescape(unescape(repl));
			} else if (this.processMatches == "urlEncode") {
				repl = encodeURIComponent(repl);
			} else if (this.processMatches == "base64Encode") {
				repl = btoa(repl);
			} else if (this.processMatches == "base64Decode" || this.processMatches == "base64decode") {
				if (repl.indexOf("%") > -1) {
					repl = unescape(repl);
				}
				repl = atob(repl);
			}
			resultUrl = resultUrl.replace(new RegExp(`\\$${i}`, "gi"), repl);
		}
		this._rxInclude.lastIndex = 0;
		return resultUrl;
	},

	_excludeMatch(url) {
		if (!this._rxExclude) {
			return false;
		}
		const shouldExclude = this._rxExclude.test(url);
		this._rxExclude.lastIndex = 0;
		return shouldExclude;
	}
};