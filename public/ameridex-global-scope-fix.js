// ============================================================
// AmeriDex Dealer Portal - Global Scope Fix v1.0
// Date: 2026-02-27
// ============================================================
// PURPOSE:
//   dealer-portal.html declares shared state variables with
//   `let` at the top level of an inline <script> block:
//
//     let currentQuote = { ... };
//     let savedQuotes  = [];
//     let customerHistory = [];
//     let deletedItems = [];
//     let selectedColor1 = 'Driftwood';
//     let selectedColor2 = 'Khaki';
//     let currentMode = 'quick';
//     let lastCalculation = null;
//     let dealerSettings = { ... };
//
//   In browsers, `let` at global scope creates a global binding
//   accessible by bare name across all <script> blocks, BUT it
//   does NOT create a property on the `window` object.
//
//   Multiple external patch files (ameridex-api.js,
//   ameridex-customer-address.js, ameridex-overrides.js, etc.)
//   reference these as `window.currentQuote`, `window.savedQuotes`,
//   etc., which resolves to `undefined` and causes crashes.
//
// SOLUTION:
//   Use Object.defineProperty to create live getter/setter pairs
//   on `window` that proxy to the actual global-scope variables.
//   This makes `window.currentQuote` and `currentQuote` point to
//   the same value, with writes in either direction staying in sync.
//
// LOAD ORDER:
//   Must load AFTER the inline <script> in dealer-portal.html
//   (so the `let` variables exist) but BEFORE any external patch
//   files (ameridex-api.js, ameridex-overrides.js, etc.).
// ============================================================

(function () {
    'use strict';

    // List of global `let` variables that external scripts need
    // on `window`. Each entry is the variable name as a string.
    var GLOBALS = [
        'currentQuote',
        'savedQuotes',
        'customerHistory',
        'deletedItems',
        'selectedColor1',
        'selectedColor2',
        'currentMode',
        'lastCalculation',
        'dealerSettings',
        'deckLengthFt',
        'deckWidthFt',
        'idleTimer',
        'warningTimer',
        'countdownInterval',
        'countdownSeconds'
    ];

    var exposed = 0;

    GLOBALS.forEach(function (name) {
        // Skip if already a real window property (e.g., if the HTML
        // was updated to use `var` instead of `let`).
        if (name in window) {
            return;
        }

        // Test if the bare global exists (let-declared globals are
        // accessible via indirect eval).
        try {
            // Indirect eval runs in global scope and can see `let`
            // bindings at the top level.
            var testVal = (0, eval)(name);

            // If we get here without throwing, the variable exists.
            // Create a live getter/setter on window.
            Object.defineProperty(window, name, {
                get: function () {
                    return (0, eval)(name);
                },
                set: function (v) {
                    // Assign back to the global let binding.
                    // `eval` in sloppy mode can assign to global lets
                    // via indirect eval, but strict mode forbids it.
                    // Use Function constructor which runs in sloppy mode.
                    (new Function(name + ' = arguments[0]'))(v);
                },
                configurable: true,
                enumerable: true
            });
            exposed++;
        } catch (e) {
            // Variable not declared yet (script load order issue)
            // or eval blocked by CSP. Log and skip.
            console.warn('[GlobalScopeFix] Could not expose "' + name + '" to window:', e.message);
        }
    });

    console.log('[GlobalScopeFix] Exposed ' + exposed + '/' + GLOBALS.length + ' let-declared globals to window.');
})();
