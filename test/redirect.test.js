// Tests for js/redirect.js
// Run with: npm test
// The Redirect class exports itself via `if (typeof exports !== "undefined") { exports.Redirect = Redirect; }`
const { Redirect } = require("../js/redirect.js");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRedirect(overrides) {
    return new Redirect({
        description: "test",
        exampleUrl: "http://example.com/foo",
        includePattern: "http://example.com/*",
        redirectUrl: "http://other.com/$1",
        patternType: "W",
        processMatches: "noProcessing",
        appliesTo: ["main_frame"],
        ...overrides,
    });
}

// ---------------------------------------------------------------------------
// validateRegexSafety
// ---------------------------------------------------------------------------

describe("Redirect.validateRegexSafety", () => {
    test("returns null for null/empty pattern", () => {
        expect(Redirect.validateRegexSafety(null, true)).toBeNull();
        expect(Redirect.validateRegexSafety("", true)).toBeNull();
    });

    test("returns error for pattern longer than 2000 chars", () => {
        const long = "a".repeat(2001);
        expect(Redirect.validateRegexSafety(long, true)).toMatch(/too long/i);
    });

    test("allows a pattern exactly 2000 chars long", () => {
        const exact = "a".repeat(2000);
        expect(Redirect.validateRegexSafety(exact, true)).toBeNull();
    });

    test("rejects regex with numbered backreference \\1", () => {
        expect(Redirect.validateRegexSafety("(foo)\\1", true)).toMatch(/backreference/i);
    });

    test("rejects regex with backreferences \\2 through \\9", () => {
        for (let i = 2; i <= 9; i++) {
            expect(Redirect.validateRegexSafety(`(x)\\${i}`, true)).toMatch(/backreference/i);
        }
    });

    test("rejects regex with named backreference \\k<", () => {
        expect(Redirect.validateRegexSafety("(?<g>foo)\\k<g>", true)).toMatch(/backreference/i);
    });

    test("allows regex without backreferences", () => {
        expect(Redirect.validateRegexSafety("(foo)(bar)\\d+", true)).toBeNull();
    });

    test("ignores backreference-like text in wildcard patterns (isRegex=false)", () => {
        // Wildcards are escaped, so \1 in a wildcard is harmless
        expect(Redirect.validateRegexSafety("http://example.com/\\1path", false)).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// Constants and statics
// ---------------------------------------------------------------------------

describe("Redirect statics", () => {
    test("WILDCARD is 'W'", () => expect(Redirect.WILDCARD).toBe("W"));
    test("REGEX is 'R'", () => expect(Redirect.REGEX).toBe("R"));
    test("requestTypes has main_frame", () => expect(Redirect.requestTypes.main_frame).toBeTruthy());
});

// ---------------------------------------------------------------------------
// Construction and defaults
// ---------------------------------------------------------------------------

describe("new Redirect() - defaults", () => {
    test("empty constructor gives wildcard with main_frame", () => {
        const r = new Redirect();
        expect(r.patternType).toBe("W");
        expect(r.appliesTo).toEqual(["main_frame"]);
        expect(r.processMatches).toBe("noProcessing");
        expect(r.disabled).toBe(false);
        expect(r.replaceAll).toBe(false);
        expect(r.usePatternForReplace).toBe(false);
    });

    test("legacy unescapeMatches flag maps to urlDecode", () => {
        const r = new Redirect({ unescapeMatches: true });
        expect(r.processMatches).toBe("urlDecode");
    });

    test("legacy escapeMatches flag maps to urlEncode", () => {
        const r = new Redirect({ escapeMatches: true });
        expect(r.processMatches).toBe("urlEncode");
    });
});

// ---------------------------------------------------------------------------
// toObject / equals / round-trip
// ---------------------------------------------------------------------------

describe("toObject and equals", () => {
    test("round-trip through toObject produces equal redirect", () => {
        const r = makeRedirect();
        const r2 = new Redirect(r.toObject());
        expect(r.equals(r2)).toBe(true);
    });

    test("different description makes not equal", () => {
        const r1 = makeRedirect({ description: "a" });
        const r2 = makeRedirect({ description: "b" });
        expect(r1.equals(r2)).toBe(false);
    });

    test("different includePattern makes not equal", () => {
        const r1 = makeRedirect({ includePattern: "http://a.com/*" });
        const r2 = makeRedirect({ includePattern: "http://b.com/*" });
        expect(r1.equals(r2)).toBe(false);
    });

    test("toObject includes replace fields", () => {
        const r = makeRedirect({ processMatches: "replace", replaceFrom: "-", replacement: "_", replaceAll: true });
        const obj = r.toObject();
        expect(obj.replaceFrom).toBe("-");
        expect(obj.replacement).toBe("_");
        expect(obj.replaceAll).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Wildcard pattern matching
// ---------------------------------------------------------------------------

describe("Wildcard matching", () => {
    test("simple * match captures suffix", () => {
        const r = makeRedirect();
        const result = r.getMatch("http://example.com/bar");
        expect(result.isMatch).toBe(true);
        expect(result.redirectTo).toBe("http://other.com/bar");
    });

    test("two wildcards populate $1 and $2", () => {
        const r = makeRedirect({
            includePattern: "http://*.example.com/*",
            redirectUrl: "http://other.com/$1/$2",
            exampleUrl: "http://sub.example.com/path",
        });
        const result = r.getMatch("http://sub.example.com/path");
        expect(result.isMatch).toBe(true);
        expect(result.redirectTo).toBe("http://other.com/sub/path");
    });

    test("special regex chars in pattern are escaped", () => {
        const r = makeRedirect({
            includePattern: "http://example.com/index.asp?id=*",
            redirectUrl: "http://other.com/?id=$1",
            exampleUrl: "http://example.com/index.asp?id=42",
        });
        const result = r.getMatch("http://example.com/index.asp?id=42");
        expect(result.isMatch).toBe(true);
        expect(result.redirectTo).toBe("http://other.com/?id=42");
    });

    test("no match returns isMatch false", () => {
        const r = makeRedirect();
        expect(r.getMatch("http://other.com/foo").isMatch).toBe(false);
    });

    test("matching is case-insensitive", () => {
        const r = makeRedirect();
        expect(r.getMatch("HTTP://EXAMPLE.COM/foo").isMatch).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Regex pattern matching
// ---------------------------------------------------------------------------

describe("Regex matching", () => {
    test("basic capture group $1 substitution", () => {
        const r = makeRedirect({
            patternType: "R",
            includePattern: "^http://example\\.com/(\\w+)",
            redirectUrl: "http://other.com/$1",
            exampleUrl: "http://example.com/hello",
        });
        const result = r.getMatch("http://example.com/hello");
        expect(result.isMatch).toBe(true);
        expect(result.redirectTo).toBe("http://other.com/hello");
    });

    test("two capture groups", () => {
        const r = makeRedirect({
            patternType: "R",
            includePattern: "^http://example\\.com/(\\w+)/(\\d+)",
            redirectUrl: "http://other.com/$2/$1",
            exampleUrl: "http://example.com/foo/42",
        });
        const result = r.getMatch("http://example.com/foo/42");
        expect(result.isMatch).toBe(true);
        expect(result.redirectTo).toBe("http://other.com/42/foo");
    });

    test("no match returns isMatch false", () => {
        const r = makeRedirect({
            patternType: "R",
            includePattern: "^http://example\\.com/specific$",
            redirectUrl: "http://other.com/",
        });
        expect(r.getMatch("http://example.com/other").isMatch).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Exclude pattern
// ---------------------------------------------------------------------------

describe("excludePattern", () => {
    test("matching exclude causes isExcludeMatch", () => {
        const r = makeRedirect({
            excludePattern: "http://example.com/excluded",
        });
        const result = r.getMatch("http://example.com/excluded");
        expect(result.isMatch).toBe(false);
        expect(result.isExcludeMatch).toBe(true);
    });

    test("non-matching exclude does not block redirect", () => {
        const r = makeRedirect({
            excludePattern: "http://example.com/excluded",
        });
        expect(r.getMatch("http://example.com/other").isMatch).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Disabled
// ---------------------------------------------------------------------------

describe("disabled flag", () => {
    test("disabled redirect returns isDisabledMatch", () => {
        const r = makeRedirect({ disabled: true });
        const result = r.getMatch("http://example.com/foo");
        expect(result.isMatch).toBe(false);
        expect(result.isDisabledMatch).toBe(true);
    });

    test("forceIgnoreDisabled overrides disabled flag", () => {
        const r = makeRedirect({ disabled: true });
        expect(r.getMatch("http://example.com/foo", true).isMatch).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// processMatches transforms
// ---------------------------------------------------------------------------

describe("processMatches: urlDecode", () => {
    test("decodes percent-encoded match", () => {
        const r = makeRedirect({
            patternType: "W",
            includePattern: "http://foo.com/redirect?url=*",
            redirectUrl: "$1",
            processMatches: "urlDecode",
            exampleUrl: "http://foo.com/redirect?url=http%3A%2F%2Fbar.com",
        });
        const result = r.getMatch("http://foo.com/redirect?url=http%3A%2F%2Fbar.com");
        expect(result.redirectTo).toBe("http://bar.com");
    });
});

describe("processMatches: doubleUrlDecode", () => {
    test("decodes double-encoded match", () => {
        const r = makeRedirect({
            patternType: "W",
            includePattern: "http://foo.com/?url=*",
            redirectUrl: "$1",
            processMatches: "doubleUrlDecode",
        });
        const result = r.getMatch("http://foo.com/?url=http%253A%252F%252Fbar.com");
        expect(result.redirectTo).toBe("http://bar.com");
    });
});

describe("processMatches: urlEncode", () => {
    test("encodes match for use in query string", () => {
        const r = makeRedirect({
            patternType: "R",
            includePattern: "^(http://example\\.com/.*)",
            redirectUrl: "http://proxy.com/?url=$1",
            processMatches: "urlEncode",
        });
        const result = r.getMatch("http://example.com/foo/bar");
        expect(result.redirectTo).toBe("http://proxy.com/?url=http%3A%2F%2Fexample.com%2Ffoo%2Fbar");
    });
});

describe("processMatches: base64Encode", () => {
    test("base64-encodes match", () => {
        const r = makeRedirect({
            patternType: "R",
            includePattern: "^http://example\\.com/(.*)",
            redirectUrl: "http://other.com/$1",
            processMatches: "base64Encode",
        });
        const result = r.getMatch("http://example.com/hello");
        expect(result.redirectTo).toBe(`http://other.com/${btoa("hello")}`);
    });
});

describe("processMatches: base64Decode (both spellings)", () => {
    const encoded = btoa("http://cnn.com");

    test("base64Decode decodes match", () => {
        const r = makeRedirect({
            patternType: "W",
            includePattern: "http://foo.com/?go=*",
            redirectUrl: "$1",
            processMatches: "base64Decode",
        });
        expect(r.getMatch(`http://foo.com/?go=${encoded}`).redirectTo).toBe("http://cnn.com");
    });

    test("legacy 'base64decode' spelling also works", () => {
        const r = makeRedirect({
            patternType: "W",
            includePattern: "http://foo.com/?go=*",
            redirectUrl: "$1",
            processMatches: "base64decode",
        });
        expect(r.getMatch(`http://foo.com/?go=${encoded}`).redirectTo).toBe("http://cnn.com");
    });
});

describe("processMatches: replace", () => {
    test("plain string find-and-replace", () => {
        const r = makeRedirect({
            patternType: "W",
            includePattern: "http://example.com/*",
            redirectUrl: "http://other.com/$1",
            processMatches: "replace",
            replaceFrom: "-",
            replacePattern: "-",
            replacement: "_",
            replaceAll: false,
        });
        // Replaces only the first occurrence
        expect(r.getMatch("http://example.com/foo-bar-baz").redirectTo)
            .toBe("http://other.com/foo_bar-baz");
    });

    test("replace all occurrences", () => {
        const r = makeRedirect({
            patternType: "W",
            includePattern: "http://example.com/*",
            redirectUrl: "http://other.com/$1",
            processMatches: "replace",
            replaceFrom: "-",
            replacePattern: "-",
            replacement: "_",
            replaceAll: true,
        });
        expect(r.getMatch("http://example.com/foo-bar-baz").redirectTo)
            .toBe("http://other.com/foo_bar_baz");
    });

    test("replace with regex pattern", () => {
        const r = makeRedirect({
            patternType: "R",
            includePattern: "^http://example\\.com/(.+)",
            redirectUrl: "http://other.com/$1",
            processMatches: "replace",
            replaceFrom: "\\d+",
            replacePattern: "\\d+",
            replacement: "NUM",
            replaceAll: true,
            usePatternForReplace: true,
        });
        r.compile();
        expect(r.getMatch("http://example.com/foo123bar456").redirectTo)
            .toBe("http://other.com/fooNUMbarNUM");
    });

    test("no replacement when replaceFrom is empty", () => {
        const r = makeRedirect({
            patternType: "W",
            includePattern: "http://example.com/*",
            redirectUrl: "http://other.com/$1",
            processMatches: "replace",
            replaceFrom: "",
            replacePattern: "",
            replacement: "X",
        });
        // Empty find pattern: no replacement should occur
        expect(r.getMatch("http://example.com/hello").redirectTo)
            .toBe("http://other.com/hello");
    });
});

// ---------------------------------------------------------------------------
// updateExampleResult
// ---------------------------------------------------------------------------

describe("updateExampleResult", () => {
    test("sets exampleResult on valid wildcard match", () => {
        const r = makeRedirect();
        r.updateExampleResult();
        expect(r.error).toBeNull();
        expect(r.exampleResult).toBe("http://other.com/foo");
    });

    test("error when no exampleUrl", () => {
        const r = makeRedirect({ exampleUrl: "" });
        r.updateExampleResult();
        expect(r.error).toMatch(/no example url/i);
    });

    test("error when include pattern does not match example url", () => {
        const r = makeRedirect({ exampleUrl: "http://other.com/foo" });
        r.updateExampleResult();
        expect(r.error).toMatch(/does not match/i);
    });

    test("error when exclude pattern excludes example url", () => {
        const r = makeRedirect({ excludePattern: "http://example.com/foo" });
        r.updateExampleResult();
        expect(r.error).toMatch(/exclude/i);
    });

    test("error for invalid regex in include pattern", () => {
        const r = makeRedirect({ patternType: "R", includePattern: "[[invalid" });
        r.updateExampleResult();
        expect(r.error).toMatch(/invalid regular expression/i);
    });

    test("error for invalid regex in exclude pattern", () => {
        const r = makeRedirect({
            patternType: "R",
            includePattern: "^http://example\\.com/(.*)",
            excludePattern: "[[invalid",
        });
        r.updateExampleResult();
        expect(r.error).toMatch(/invalid regular expression.*exclude/i);
    });

    test("error for invalid regex in replace pattern", () => {
        const r = makeRedirect({
            patternType: "R",
            includePattern: "^http://example\\.com/(.*)",
            processMatches: "replace",
            usePatternForReplace: true,
            replacePattern: "[[invalid",
        });
        r.updateExampleResult();
        expect(r.error).toMatch(/invalid regular expression.*replace/i);
    });

    test("error when no appliesTo", () => {
        const r = makeRedirect();
        r.appliesTo = []; // bypass _init default, set directly
        r.updateExampleResult();
        expect(r.error).toMatch(/at least one request type/i);
    });
});

// ---------------------------------------------------------------------------
// appliesToText getter
// ---------------------------------------------------------------------------

describe("appliesToText getter", () => {
    test("returns friendly label for known type", () => {
        const r = makeRedirect({ appliesTo: ["main_frame"] });
        expect(r.appliesToText).toBe("Main window (address bar)");
    });

    test("returns raw key for unknown type", () => {
        const r = makeRedirect({ appliesTo: ["unknown_type"] });
        expect(r.appliesToText).toBe("unknown_type");
    });

    test("joins multiple types with comma", () => {
        const r = makeRedirect({ appliesTo: ["main_frame", "script"] });
        expect(r.appliesToText).toContain("Main window");
        expect(r.appliesToText).toContain("Scripts");
    });
});

// ---------------------------------------------------------------------------
// processMatchesExampleText getter
// ---------------------------------------------------------------------------

describe("processMatchesExampleText getter", () => {
    test("noProcessing returns description", () => {
        const r = makeRedirect({ processMatches: "noProcessing" });
        expect(r.processMatchesExampleText).toMatch(/use matches/i);
    });

    test("replace returns description", () => {
        const r = makeRedirect({ processMatches: "replace" });
        expect(r.processMatchesExampleText).toMatch(/find and replace/i);
    });

    test("urlEncode returns example", () => {
        const r = makeRedirect({ processMatches: "urlEncode" });
        expect(r.processMatchesExampleText).toMatch(/%2F/);
    });

    test("base64Encode returns example", () => {
        const r = makeRedirect({ processMatches: "base64Encode" });
        expect(r.processMatchesExampleText).toMatch(/aHR0/);
    });
});