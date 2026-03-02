// ============================================================
// AmeriDex Dealer Portal - Script Loader v2.2
// File: script-loader.js
// Date: 2026-03-02
// ============================================================
// CRITICAL: Function stubs below MUST execute synchronously
// before DOMContentLoaded fires. They are intentionally placed
// OUTSIDE the IIFE and at the TOP of this file.
//
// The inline script in dealer-portal.html references
// renderCustomersList() as a bare name in its DOMContentLoaded
// handler (~line 2643). That function is defined by
// ameridex-addrow-fix.js, which loads asynchronously later.
// Without a stub, the bare-name reference throws an Uncaught
// ReferenceError that kills the ENTIRE DOMContentLoaded
// callback, preventing add-row onclick and all other event
// handlers from being wired up.
//
// script-loader.js is loaded via <script src="script-loader.js">
// which executes synchronously during HTML parsing, BEFORE
// DOMContentLoaded fires. So stubs defined here are guaranteed
// to exist in time.
// ============================================================

// ---- SYNCHRONOUS FUNCTION STUBS ----
// These prevent ReferenceErrors in the inline DOMContentLoaded handler.
// They will be overwritten by the real implementations from patch scripts.

if (typeof window.renderCustomersList !== 'function') {
    window.renderCustomersList = function renderCustomersList() {
        // No-op stub. Replaced by ameridex-addrow-fix.js (position 0).
    };
}

if (typeof window.updateCustomerProgress !== 'function') {
    window.updateCustomerProgress = function updateCustomerProgress() {
        // No-op stub. May be replaced by a patch script.
    };
}

if (typeof window.showQuotesView !== 'function') {
    window.showQuotesView = function showQuotesView() {
        // No-op stub. May be replaced by a patch script.
    };
}

// ---- END SYNCHRONOUS STUBS ----

// ============================================================
// Load order:
//   0. ameridex-addrow-fix.js            (DOM repair + missing function defs)
//   1. ameridex-portal-nav.js            (Navigation system)
//   2. ameridex-patches.js               (DOM patches and fixes)
//   3. ameridex-idle-fix.js              (guard resetIdleTimer null crash)
//   4. ameridex-api.js                   (API client and helpers)
//   5. ameridex-pricing-fix.js           (Pricing resolution + getDisplayPrice)
//   6. ameridex-overrides.js             (General UI overrides)
//   7. ameridex-print-branding.js        (Branded print/preview output)
//   8. ameridex-customer-address.js      (Address/City/State fields patch)
//   9. ameridex-address-quote-prompt.js  (Prompt: update existing or new quote when address added)
//  10. ameridex-customer-sync.js         (Customer history sync)
//  11. ameridex-roles.js                 (GM/Frontdesk role system + override buttons)
//  12. ameridex-admin.js                 (Admin panel)
//  13. ameridex-admin-customers.js       (Admin customer management)
//  14. ameridex-admin-delete.js          (Soft delete + undo + recently deleted)
//  15. ameridex-admin-user-delete.js     (Delete users + dealers from Users tab)
//  16. ameridex-admin-csv-fix.js         (CSV export formula injection prevention)
//  17. ameridex-deck-calculator.js       (Advanced deck calc + board optimizer)
//  18. ameridex-admin-patch.js           (Per-dealer pricing migration patch)
//  19. ameridex-email-optional.js        (Email optional, name+zip required)
//
// v2.2 Changes (2026-03-02):
//   - Added ameridex-address-quote-prompt.js at position 9.
//     When a user retrieves an existing quote that had NO address
//     previously saved, and then enters any address field, a modal
//     dialog fires asking whether to:
//       A) Update the existing quote with the new address, or
//       B) Save the address as a brand-new separate draft quote.
//       C) Cancel (clears the entered address).
//     Must load immediately after ameridex-customer-address.js
//     (position 8) so the address DOM fields and loadQuote patch
//     are already in place when this script runs.
//
// v2.1 Changes (2026-02-28):
//   - Added ameridex-email-optional.js at position 18 (now 19).
//     Customer email is now optional on the quote form.
//     Only Name and Zip Code are mandatory.
//
// v2.0 Changes (2026-02-28):
//   - Added ameridex-admin-patch.js at position 17 (now 18).
//
// v1.9 Changes (2026-02-28):
//   - Added ameridex-deck-calculator.js at position 16 (now 17).
//
// v1.8 Changes (2026-02-27):
//   - REMOVED ameridex-global-scope-fix.js from load chain.
//
// v1.7 Changes (2026-02-27):
//   - Moved renderCustomersList stubs into this file.
//
// v1.6 Changes (2026-02-27):
//   - Added customer-address.js, customer-sync.js, idle-fix.js.
//
// v1.5 - v1.1: Earlier incremental additions.
// ============================================================

(function () {
    'use strict';

    const SCRIPTS = [
        'ameridex-addrow-fix.js',
        'ameridex-portal-nav.js',
        'ameridex-patches.js',
        'ameridex-idle-fix.js',
        'ameridex-api.js',
        'ameridex-pricing-fix.js',
        'ameridex-overrides.js',
        'ameridex-print-branding.js',
        'ameridex-customer-address.js',
        'ameridex-address-quote-prompt.js',
        'ameridex-customer-sync.js',
        'ameridex-roles.js',
        'ameridex-admin.js',
        'ameridex-admin-customers.js',
        'ameridex-admin-delete.js',
        'ameridex-admin-user-delete.js',
        'ameridex-admin-csv-fix.js',
        'ameridex-deck-calculator.js',
        'ameridex-admin-patch.js',
        'ameridex-email-optional.js'
    ];

    let loaded = 0;

    function loadNext() {
        if (loaded >= SCRIPTS.length) {
            console.log('[ScriptLoader] All ' + SCRIPTS.length + ' extension scripts loaded.');
            return;
        }
        const src = SCRIPTS[loaded];
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => {
            console.log('[ScriptLoader] Loaded: ' + src);
            loaded++;
            loadNext();
        };
        script.onerror = () => {
            console.warn('[ScriptLoader] Failed to load: ' + src + ' (skipping)');
            loaded++;
            loadNext();
        };
        document.body.appendChild(script);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadNext);
    } else {
        loadNext();
    }
})();
