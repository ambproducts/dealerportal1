// ============================================================
// AmeriDex Dealer Portal - Script Loader v1.7
// File: script-loader.js
// Date: 2026-02-27
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
        // No-op stub. Replaced by ameridex-addrow-fix.js (position 1).
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
//   0. ameridex-global-scope-fix.js      (expose let globals to window)
//   1. ameridex-addrow-fix.js            (DOM repair + missing function defs)
//   2. ameridex-portal-nav.js            (Navigation system)
//   3. ameridex-patches.js               (DOM patches and fixes)
//   4. ameridex-idle-fix.js              (guard resetIdleTimer null crash)
//   5. ameridex-api.js                   (API client and helpers)
//   6. ameridex-pricing-fix.js           (Pricing resolution + getDisplayPrice)
//   7. ameridex-overrides.js             (General UI overrides)
//   8. ameridex-print-branding.js        (Branded print/preview output)
//   9. ameridex-customer-address.js      (Address/City/State fields patch)
//  10. ameridex-customer-sync.js         (Customer history sync)
//  11. ameridex-roles.js                 (GM/Frontdesk role system + override buttons)
//  12. ameridex-admin.js                 (Admin panel)
//  13. ameridex-admin-customers.js       (Admin customer management)
//  14. ameridex-admin-delete.js          (Soft delete + undo + recently deleted)
//  15. ameridex-admin-user-delete.js     (Delete users + dealers from Users tab)
//  16. ameridex-admin-csv-fix.js         (CSV export formula injection prevention)
//
// v1.7 Changes (2026-02-27):
//   - Moved renderCustomersList, updateCustomerProgress, and
//     showQuotesView stubs from ameridex-global-scope-fix.js into
//     this file. The stubs must be defined SYNCHRONOUSLY before
//     DOMContentLoaded fires. script-loader.js runs synchronously
//     as a <script src> tag; ameridex-global-scope-fix.js loads
//     asynchronously via dynamic script injection (too late).
//
// v1.6 Changes (2026-02-27):
//   - Added ameridex-global-scope-fix.js at position 0.
//   - Added ameridex-idle-fix.js at position 4.
//   - Added ameridex-customer-address.js at position 9.
//   - Added ameridex-customer-sync.js at position 10.
//
// v1.5 Changes (2026-02-27):
//   - Added ameridex-admin-user-delete.js
//
// v1.4 Changes (2026-02-27):
//   - Added ameridex-admin-delete.js
//
// v1.3 Changes (2026-02-26):
//   - Added ameridex-addrow-fix.js as FIRST script in load chain
//
// v1.2 Changes (2026-02-25):
//   - Added ameridex-admin-csv-fix.js
//
// v1.1 Changes (2026-02-25):
//   - Added ameridex-print-branding.js to load chain
// ============================================================

(function () {
    'use strict';

    const SCRIPTS = [
        'ameridex-global-scope-fix.js',
        'ameridex-addrow-fix.js',
        'ameridex-portal-nav.js',
        'ameridex-patches.js',
        'ameridex-idle-fix.js',
        'ameridex-api.js',
        'ameridex-pricing-fix.js',
        'ameridex-overrides.js',
        'ameridex-print-branding.js',
        'ameridex-customer-address.js',
        'ameridex-customer-sync.js',
        'ameridex-roles.js',
        'ameridex-admin.js',
        'ameridex-admin-customers.js',
        'ameridex-admin-delete.js',
        'ameridex-admin-user-delete.js',
        'ameridex-admin-csv-fix.js'
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
