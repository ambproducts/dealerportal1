// ============================================================
// AmeriDex Dealer Portal - Global Scope Fix v1.1
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
// v1.1 Changes (2026-02-27):
//   - FIX: Replaced `new Function(name + ' = arguments[0]')` setter
//     with indirect eval via `window.__scopeTransfer`. In V8
//     (Chrome/Edge), `new Function()` creates its own scope and
//     CANNOT assign to top-level `let` bindings in the Script scope.
//     It silently created a shadow property on `window`, splitting
//     state between the `let` binding and `window.*`. This caused
//     the "Add Line Item" button to stop working after any external
//     script wrote to `window.currentQuote`.
//   - FIX: Indirect eval `(0, eval)()` runs in global scope and CAN
//     both read and assign to top-level `let` bindings, solving the
//     state-split problem.
//   - ADD: Verification pass after exposure that tests a write-read
//     roundtrip for each variable to confirm the setter works. Any
//     failures are logged with a clear warning.
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
    var verified = 0;

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
                set: function (val) {
                    // v1.1 FIX: Use indirect eval instead of new Function().
                    //
                    // `new Function(name + ' = arguments[0]')` creates its
                    // own scope and CANNOT reach `let` bindings in V8's
                    // Script scope. It silently creates an implicit global
                    // (a shadow property on window), splitting state.
                    //
                    // Indirect eval `(0, eval)(...)` runs in the global
                    // scope and CAN assign to top-level `let` bindings.
                    // We pass the value through a temporary window property
                    // because `val` is not visible inside the eval string.
                    window.__scopeTransfer = val;
                    (0, eval)(name + ' = window.__scopeTransfer');
                    delete window.__scopeTransfer;
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

    // ----------------------------------------------------------
    // VERIFICATION PASS
    // ----------------------------------------------------------
    // Test a write-read roundtrip for each exposed variable to
    // confirm the setter actually modifies the `let` binding
    // and not a shadow property.
    // ----------------------------------------------------------
    GLOBALS.forEach(function (name) {
        if (!(name in window)) return;

        try {
            // Read the current value via the getter (indirect eval)
            var original = (0, eval)(name);

            // Write a sentinel value through window (uses our setter)
            var sentinel = '__scopefix_verify_' + name;
            window[name] = sentinel;

            // Read back via indirect eval (bypasses our getter, reads
            // the actual let binding directly)
            var readBack = (0, eval)(name);

            if (readBack === sentinel) {
                // Setter works: the let binding was updated.
                verified++;
            } else {
                console.warn('[GlobalScopeFix] SETTER BROKEN for "' + name +
                    '": wrote sentinel but let binding still has:', readBack);
            }

            // Restore the original value
            window[name] = original;
        } catch (e) {
            console.warn('[GlobalScopeFix] Verification failed for "' + name + '":', e.message);
        }
    });

    console.log('[GlobalScopeFix] v1.1 | Exposed ' + exposed + '/' + GLOBALS.length +
        ' globals | Verified ' + verified + '/' + exposed + ' setters working.');

    if (verified < exposed) {
        console.error('[GlobalScopeFix] WARNING: ' + (exposed - verified) +
            ' setter(s) failed verification. State may split between let bindings and window properties. ' +
            'Consider changing let to var in dealer-portal.html inline script as a permanent fix.');
    }
})();
