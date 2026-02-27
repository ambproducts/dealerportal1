// ============================================================
// AmeriDex Dealer Portal - Script Loader
// File: script-loader.js
// Date: 2026-02-27
// ============================================================
// This file ensures all extension scripts are loaded in the
// correct order after the main dealer-portal.html inline script.
//
// Load order:
//   0. ameridex-global-scope-fix.js      (expose let globals to window)
//   1. ameridex-addrow-fix.js            (DOM repair + missing function defs)
//   2. ameridex-patches.js               (DOM patches and fixes)
//   3. ameridex-idle-fix.js              (guard resetIdleTimer null crash)
//   4. ameridex-api.js                   (API client and helpers)
//   5. ameridex-pricing-fix.js           (Pricing resolution + getDisplayPrice)
//   6. ameridex-overrides.js             (General UI overrides)
//   7. ameridex-print-branding.js        (Branded print/preview output)
//   8. ameridex-customer-address.js      (Address/City/State fields patch)
//   9. ameridex-customer-sync.js         (Customer history sync)
//  10. ameridex-roles.js                 (GM/Frontdesk role system + override buttons)
//  11. ameridex-admin.js                 (Admin panel)
//  12. ameridex-admin-customers.js       (Admin customer management)
//  13. ameridex-admin-delete.js          (Soft delete + undo + recently deleted)
//  14. ameridex-admin-user-delete.js     (Delete users + dealers from Users tab)
//  15. ameridex-admin-csv-fix.js         (CSV export formula injection prevention)
//
// v1.6 Changes (2026-02-27):
//   - Added ameridex-global-scope-fix.js at position 0.
//     dealer-portal.html uses `let` for shared state, which does
//     NOT create window properties. This patch exposes them via
//     Object.defineProperty so all downstream scripts work.
//   - Added ameridex-idle-fix.js at position 3 (was only in HTML
//     script tags, not in the sequential loader).
//   - Added ameridex-customer-address.js at position 8 (was only
//     in HTML script tags).
//   - Added ameridex-customer-sync.js at position 9.
//
// v1.5 Changes (2026-02-27):
//   - Added ameridex-admin-user-delete.js for deleting users and dealers
//     from the Users tab. Injects Delete buttons via MutationObserver.
//     Loads after admin-delete.js and before csv-fix.
//
// v1.4 Changes (2026-02-27):
//   - Added ameridex-admin-delete.js for soft delete/undo/recently deleted
//     feature. Loads after admin-customers so delete buttons inject into
//     already-rendered admin tables. Only active for admin and gm roles.
//
// v1.3 Changes (2026-02-26):
//   - FIX: Added ameridex-addrow-fix.js as FIRST script in the load
//     chain. This file repairs corrupted DOM nesting and defines the
//     missing renderCustomersList() function, both of which blocked
//     the "+ Add Line Item" button from working.
//
// v1.2 Changes (2026-02-25):
//   - FIX: Added ameridex-admin-csv-fix.js (CSV formula injection patch)
//
// v1.1 Changes (2026-02-25):
//   - FIX: Added ameridex-print-branding.js to load chain
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
