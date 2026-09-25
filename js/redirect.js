
class Redirect {

	static WILDCARD = "W";
	static REGEX = "R";
	static customVariables = {};

	static requestTypes = {
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

	// Returns an error string if unsafe to run in a blocking webRequest listener, null if safe.
	static validateRegexSafety(pattern, isRegex) {
		if (!pattern) return null;
		if (pattern.length > 2000) return "Pattern too long (max 2000 characters)";
		// Backreferences bypass V8's linear-time engine and can cause catastrophic backtracking
		if (isRegex && (/\\[1-9]|\\k</).test(pattern)) return "Pattern contains backreferences";
		return null;
	}

	static isValidRegex(pattern) {
		if (!pattern) return true;
		try {
			new RegExp(pattern, "i"); // eslint-disable-line no-new
			return true;
		} catch (_) {
			return false;
		}
	}

	static _tryDecodeURI(s) {
		try {
			return decodeURIComponent(s);
		} catch (_) {
			return s;
		}
	}

	static _tryBase64Decode(s) {
		const src = s.includes("%") ? Redirect._tryDecodeURI(s) : s;
		try {
			return atob(src);
		} catch (_) {
			return src;
		}
	}

	constructor(o = {}) {
		this.description = o.description || "";
		this.exampleUrl = o.exampleUrl || "";
		this.exampleResult = o.exampleResult || "";
		this.error = o.error || null;
		this.includePattern = o.includePattern || "";
		this.excludePattern = o.excludePattern || "";
		this.redirectUrl = o.redirectUrl || "";
		this.patternType = o.patternType || Redirect.WILDCARD;
		this.patternTypeText = this.patternType === "W" ? "Wildcard" : "Regular Expression";
		this.patternDesc = o.patternDesc || "";
		// Normalize legacy lowercase alias to canonical casing
		this.processMatches = (o.processMatches === "base64decode") ? "base64Decode" : (o.processMatches || "noProcessing");
		this.replaceFrom = o.replaceFrom || "";
		this.replacePattern = o.replacePattern || o.replaceFrom || "";
		this.replacement = o.replacement || "";
		this.replaceAll = Boolean(o.replaceAll);
		this.usePatternForReplace = Boolean(o.usePatternForReplace);
		this.allowLoops = Boolean(o.allowLoops);
		this.sourcePattern = o.sourcePattern || "";
		this.disabled = Boolean(o.disabled);
		this.appliesTo = (o.appliesTo && o.appliesTo.length) ? o.appliesTo.slice(0) : ["main_frame"];

		this._rxInclude = null;
		this._rxExclude = null;
		this._rxReplace = null;
		this._rxSource = null;
	}

	compile() {
		const incPattern = this._preparePattern(this.includePattern);
		const excPattern = this._preparePattern(this.excludePattern);

		if (incPattern) this._rxInclude = new RegExp(incPattern, "i");
		if (excPattern) this._rxExclude = new RegExp(excPattern, "i");

		if (this.processMatches === "replace" && this.usePatternForReplace && this.replacePattern) {
			const replPattern = this._preparePattern(this.replacePattern);
			if (replPattern) {
				this._rxReplace = new RegExp(replPattern, this.replaceAll ? "gi" : "i");
			}
		}
		if (this.sourcePattern) {
			const srcPattern = this._preparePattern(this.sourcePattern);
			if (srcPattern) this._rxSource = new RegExp(srcPattern, "i");
		}
	}

	static canonicalKey(r) {
		const appliesTo = r.appliesTo.slice().sort().join(",");
		return [
			r.description, r.exampleUrl, r.includePattern, r.excludePattern,
			r.patternDesc, r.redirectUrl, r.patternType, r.processMatches,
			r.replaceFrom, r.replacePattern, r.replacement,
			String(r.replaceAll), String(r.usePatternForReplace),
			String(r.allowLoops), r.sourcePattern, appliesTo
		].join("\0");
	}

	equals(other) {
		return Redirect.canonicalKey(this) === Redirect.canonicalKey(other);
	}

	toObject() {
		return {
			description: this.description,
			exampleUrl: this.exampleUrl,
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
			allowLoops: this.allowLoops,
			sourcePattern: this.sourcePattern,
			disabled: this.disabled,
			appliesTo: this.appliesTo.slice(0)
		};
	}

	getMatch(url, forceIgnoreDisabled, sourceUrl) {
		if (!this._rxInclude) this.compile();
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
			} else if (this._rxSource && sourceUrl !== undefined && !this._sourceMatch(sourceUrl)) {
				// source pattern set but source URL doesn't match; no redirect
			} else if (this._excludeMatch(url)) {
				result.isExcludeMatch = true;
			} else {
				result.isMatch = true;
				result.redirectTo = redirectTo;
			}
		}
		return result;
	}

	updateExampleResult() {
		this.error = null;
		this.exampleResult = "";

		if (!this.exampleUrl) {
			this.error = "No example URL defined.";
			return;
		}
		if (!this.redirectUrl) {
			this.error = "Redirect URL is required.";
			return;
		}

		if (this.patternType === Redirect.REGEX && this.includePattern && !Redirect.isValidRegex(this.includePattern)) {
			this.error = "Invalid regular expression in Include pattern.";
			return;
		}
		if (this.patternType === Redirect.REGEX && this.excludePattern && !Redirect.isValidRegex(this.excludePattern)) {
			this.error = "Invalid regular expression in Exclude pattern.";
			return;
		}
		if (this.processMatches === "replace" && this.patternType === Redirect.REGEX && this.usePatternForReplace && this.replacePattern && !Redirect.isValidRegex(this.replacePattern)) {
			this.error = "Invalid regular expression in Replace pattern.";
			return;
		}
		if (this.patternType === Redirect.REGEX && this.sourcePattern && !Redirect.isValidRegex(this.sourcePattern)) {
			this.error = "Invalid regular expression in Source pattern.";
			return;
		}
		if (this.processMatches === "replace" && !this.replaceFrom) {
			this.error = "Enter a Find value for Replace processing.";
			return;
		}

		const isRegex = this.patternType === Redirect.REGEX;
		const incSafetyErr = Redirect.validateRegexSafety(this.includePattern, isRegex);
		if (incSafetyErr) {
			this.error = incSafetyErr;
			return;
		}
		const excSafetyErr = Redirect.validateRegexSafety(this.excludePattern, isRegex);
		if (excSafetyErr) {
			this.error = excSafetyErr;
			return;
		}
		if (this.processMatches === "replace" && this.usePatternForReplace) {
			const replSafetyErr = Redirect.validateRegexSafety(this.replacePattern, isRegex);
			if (replSafetyErr) {
				this.error = replSafetyErr;
				return;
			}
		}

		if (!this.appliesTo || this.appliesTo.length === 0) {
			this.error = "At least one request type must be chosen.";
			return;
		}

		try {
			this.compile();
		} catch (_) {
			this.error = "Pattern compilation error.";
			return;
		}

		const match = this.getMatch(this.exampleUrl, true);
		if (match.isExcludeMatch) {
			this.error = "The exclude pattern excludes the example url.";
			return;
		}
		if (!match.isMatch) {
			this.error = "The include pattern does not match the example url.";
			return;
		}
		this.exampleResult = match.redirectTo;
	}

	get appliesToText() {
		return this.appliesTo.map(type => Redirect.requestTypes[type] || type).join(", ");
	}

	get hasTransform() {
		return this.processMatches !== "noProcessing";
	}

	get processMatchesExampleText() {
		const examples = {
			noProcessing: "Use matches as they are",
			replace: "Find and replace text within each match",
			urlEncode: "E.g. turn /bar/foo?x=2 into %2Fbar%2Ffoo%3Fx%3D2",
			urlDecode: "E.g. turn %2Fbar%2Ffoo%3Fx%3D2 into /bar/foo?x=2",
			doubleUrlDecode: "E.g. turn %252Fbar%252Ffoo%253Fx%253D2 into /bar/foo?x=2",
			base64Encode: "E.g. turn http://cnn.com into aHR0cDovL2Nubi5jb20=",
			base64Decode: "E.g. turn aHR0cDovL2Nubi5jb20= into http://cnn.com"
		};
		return examples[this.processMatches];
	}

	toString() {
		return JSON.stringify(this.toObject(), null, 2);
	}

	get compiledIncludePattern() {
		return this._preparePattern(this.includePattern);
	}

	_preparePattern(pattern) {
		if (!pattern) return null;
		if (this.patternType === Redirect.REGEX) return pattern;
		// Collapse consecutive wildcards so ** doesn't produce two capture groups
		// Convert wildcard to anchored regex: escape special chars, map * to (.*?)
		return `^${
			pattern.
				replace(/\*+/g, "*").
				replace(/[()[\]{}?.^$\\+|]/g, "\\$&").
				replace(/\*/g, "(.*?)")
			}$`;
	}

	_applyTransform(s) {
		let repl = s;
		if (this.processMatches === "replace") {
			const pattern = this.usePatternForReplace ? (this._rxReplace || null) : (this.replaceFrom || null);
			if (pattern !== null) {
				repl = this.replaceAll
					? repl.replaceAll(pattern, this.replacement)
					: repl.replace(pattern, this.replacement);
			} else if (!this.usePatternForReplace && !this.replaceFrom) {
				console.warn("Redirector: replace rule has empty replaceFrom — no-op");
			}
		} else if (this.processMatches === "urlDecode") {
			repl = Redirect._tryDecodeURI(repl);
		} else if (this.processMatches === "doubleUrlDecode") {
			repl = Redirect._tryDecodeURI(Redirect._tryDecodeURI(repl));
		} else if (this.processMatches === "urlEncode") {
			repl = encodeURIComponent(repl);
		} else if (this.processMatches === "base64Encode") {
			repl = btoa(Array.from(new TextEncoder().encode(repl), b => String.fromCharCode(b)).join(""));
		} else if (this.processMatches === "base64Decode") {
			repl = Redirect._tryBase64Decode(repl);
		}
		return repl;
	}

	_includeMatch(url) {
		if (!this._rxInclude) return null;
		const matches = this._rxInclude.exec(url);
		if (!matches) return null;

		// Apply the transform once per capture group. Pre-computing here prevents
		// double-application when $n appears multiple times in redirectUrl.
		const transformed = Array.from(matches, (m) => this._applyTransform(m || ""));

		let resultUrl = this.redirectUrl.replace(/\$(\d+)/g, (_match, n) => {
			const idx = parseInt(n, 10);
			return transformed[idx] !== undefined ? transformed[idx] : "";
		});

		for (const [name, value] of Object.entries(Redirect.customVariables)) {
			resultUrl = resultUrl.replaceAll(`[${name}]`, value.replace(/\$/g, "$$$$"));
		}
		return resultUrl;
	}

	_sourceMatch(sourceUrl) {
		if (!sourceUrl) return false;
		return this._rxSource.test(sourceUrl);
	}

	_excludeMatch(url) {
		if (!this._rxExclude) return false;
		return this._rxExclude.test(url);
	}
}