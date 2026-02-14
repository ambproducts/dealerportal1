// ============================================================
// AmeriDex Dealer Portal - Script Loader
// File: script-loader.js
// Date: 2026-02-14
// ============================================================
// This file ensures all extension scripts are loaded in the
// correct order after the main dealer-portal.html inline script.
//
// Load order:
//   1. ameridex-patches.js       (DOM patches and fixes)
//   2. ameridex-api.js           (API client and helpers)
//   3. ameridex-overrides.js     (General UI overrides)
//   4. ameridex-admin.js         (Admin panel)
//   5. ameridex-admin-customers.js (Admin customer management)
//   6. ameridex-price-overrides.js (Price override approval UI)
// ============================================================

(function () {
    'use strict';

    const SCRIPTS = [
        'ameridex-patches.js',
        'ameridex-api.js',
        'ameridex-overrides.js',
        'ameridex-admin.js',
        'ameridex-admin-customers.js',
        'ameridex-price-overrides.js'
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
