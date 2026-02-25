// ============================================================
// AmeriDex Dealer Portal - Script Loader
// File: script-loader.js
// Date: 2026-02-25
// ============================================================
// This file ensures all extension scripts are loaded in the
// correct order after the main dealer-portal.html inline script.
//
// Load order:
//   1. ameridex-patches.js           (DOM patches and fixes)
//   2. ameridex-api.js               (API client and helpers)
//   3. ameridex-pricing-fix.js       (Pricing resolution + getDisplayPrice)
//   4. ameridex-overrides.js         (General UI overrides)
//   5. ameridex-print-branding.js    (Branded print/preview output)
//   6. ameridex-roles.js             (GM/Frontdesk role system + override buttons)
//   7. ameridex-admin.js             (Admin panel)
//   8. ameridex-admin-customers.js   (Admin customer management)
//
// v1.1 Changes (2026-02-25):
//   - FIX: Added ameridex-print-branding.js to load chain
//          (was missing, causing branded print to only work if
//          dealer-portal.html had a separate <script> tag)
// ============================================================

(function () {
    'use strict';

    const SCRIPTS = [
        'ameridex-patches.js',
        'ameridex-api.js',
        'ameridex-pricing-fix.js',
        'ameridex-overrides.js',
        'ameridex-print-branding.js',
        'ameridex-roles.js',
        'ameridex-admin.js',
        'ameridex-admin-customers.js'
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
