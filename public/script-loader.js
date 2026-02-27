// ============================================================
// AmeriDex Dealer Portal - Script Loader
// File: script-loader.js
// Date: 2026-02-27
// ============================================================
// This file ensures all extension scripts are loaded in the
// correct order after the main dealer-portal.html inline script.
//
// Load order:
//   1. ameridex-addrow-fix.js            (DOM repair + missing function defs)
//   2. ameridex-patches.js               (DOM patches and fixes)
//   3. ameridex-api.js                   (API client and helpers)
//   4. ameridex-pricing-fix.js           (Pricing resolution + getDisplayPrice)
//   5. ameridex-overrides.js             (General UI overrides)
//   6. ameridex-print-branding.js        (Branded print/preview output)
//   7. ameridex-roles.js                 (GM/Frontdesk role system + override buttons)
//   8. ameridex-admin.js                 (Admin panel)
//   9. ameridex-admin-customers.js       (Admin customer management)
//  10. ameridex-admin-delete.js          (Soft delete + undo + recently deleted)
//  11. ameridex-admin-user-delete.js     (Delete users + dealers from Users tab)
//  12. ameridex-admin-csv-fix.js         (CSV export formula injection prevention)
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
        'ameridex-addrow-fix.js',
        'ameridex-patches.js',
        'ameridex-api.js',
        'ameridex-pricing-fix.js',
        'ameridex-overrides.js',
        'ameridex-print-branding.js',
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
