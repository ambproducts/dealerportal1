// ============================================================
// AmeriDex Dealer Portal - Script Loader v2.6
// File: script-loader.js
// Date: 2026-03-16
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
//   0.  ameridex-addrow-fix.js            (DOM repair + missing function defs)
//   1.  ameridex-portal-nav.js            (Navigation system)
//   2.  ameridex-patches.js               (DOM patches and fixes)
//   3.  ameridex-idle-fix.js              (Guard resetIdleTimer null crash)
//   4.  ameridex-api.js                   (API client and helpers)
//   5.  ameridex-pricing-fix.js           (Pricing resolution + getDisplayPrice)
//   6.  ameridex-overrides.js             (General UI overrides)
//   7.  ameridex-inline-item-picker.js    (Inline per-row product dropdowns)
//   8.  ameridex-print-branding.js        (Branded print/preview output)
//   9.  ameridex-customer-address.js      (Address/City/State fields injection)
//  10.  ameridex-address-quote-prompt.js  (No-op stub - superseded by position 11)
//  11.  ameridex-quote-editor.js          (Read-only lock, Edit button, autosave)
//  12.  ameridex-customer-sync.js         (Customer history sync)
//  13.  ameridex-roles.js                 (GM/Frontdesk role system + override buttons)
//  14.  ameridex-admin.js                 (Admin panel)
//  15.  ameridex-admin-customers.js       (Admin customer management)
//  16.  ameridex-admin-delete.js          (Soft delete + undo + recently deleted)
//  17.  ameridex-admin-user-delete.js     (Delete users + dealers from Users tab)
//  18.  ameridex-admin-csv-fix.js         (CSV export formula injection prevention)
//  19.  ameridex-deck-calculator.js       (Advanced deck calc + board optimizer)
//  20.  ameridex-admin-patch.js           (Per-dealer pricing migration patch)
//  21.  ameridex-email-optional.js        (Email optional, name+zip required)
//  22.  ameridex-ui-fixes.js              (Runtime UI adjustments)
//  23.  ameridex-ui-null-guards.js        (Null guard for removed #print-dropdown)
//  24.  ameridex-version.js               (Version badge bottom-left corner)
//
// v2.5 Changes (2026-03-16):
//   - Moved ameridex-inline-item-picker.js from patches.js EXTRA_SCRIPTS
//     to position 7 (after overrides, before print-branding).
//   - Moved ameridex-ui-fixes.js and ameridex-ui-null-guards.js from
//     patches.js EXTRA_SCRIPTS to positions 22-23.
//   - This eliminates all duplicate script loading that caused infinite
//     MutationObserver loops from ameridex-pricing-fix.js and double-
//     wrapped render functions from ameridex-overrides.js.
//   - PATCH 6 in ameridex-patches.js has been removed entirely.
//
// v2.4 Changes (2026-03-04):
//   - Added ameridex-version.js at position 21.
//     Fetches /api/version and renders a subtle version badge
//     in the bottom-left corner of the portal window.
//
// v2.3 Changes (2026-03-02):
//   - Added ameridex-quote-editor.js at position 10.
//
// v2.2 Changes (2026-03-02):
//   - Added ameridex-address-quote-prompt.js at position 9.
//
// v2.1 Changes (2026-02-28):
//   - Added ameridex-email-optional.js.
//
// v2.0 Changes (2026-02-28):
//   - Added ameridex-admin-patch.js.
//
// v1.9 Changes (2026-02-28):
//   - Added ameridex-deck-calculator.js.
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
        'ameridex-addrow-fix.js',           //  0
        'ameridex-portal-nav.js',           //  1
        'ameridex-patches.js',              //  2
        'ameridex-idle-fix.js',             //  3
        'ameridex-api.js',                  //  4
        'ameridex-pricing-fix.js',          //  5
        'ameridex-overrides.js',            //  6
        'ameridex-inline-item-picker.js',   //  7  (moved from EXTRA_SCRIPTS in patches.js)
        'ameridex-print-branding.js',       //  8
        'ameridex-customer-address.js',     //  9
        'ameridex-address-quote-prompt.js', // 10  (no-op stub)
        'ameridex-quote-editor.js',         // 11
        'ameridex-customer-sync.js',        // 12
        'ameridex-roles.js',                // 13
        'ameridex-salesrep.js',             // 14  (salesrep dealer switcher)
        'ameridex-admin.js',                // 15
        'ameridex-admin-customers.js',      // 15
        'ameridex-admin-delete.js',         // 16
        'ameridex-admin-user-delete.js',    // 17
        'ameridex-admin-csv-fix.js',        // 18
        'ameridex-deck-calculator.js',      // 19
        'ameridex-admin-patch.js',          // 20
        'ameridex-email-optional.js',       // 21
        'ameridex-ui-fixes.js',             // 22  (moved from EXTRA_SCRIPTS in patches.js)
        'ameridex-ui-null-guards.js',       // 23  (moved from EXTRA_SCRIPTS in patches.js)
        'ameridex-version.js'               // 24
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
