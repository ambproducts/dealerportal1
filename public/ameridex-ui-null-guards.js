/**
 * ameridex-ui-null-guards.js v1.0
 * Date: 2026-03-05
 *
 * Fixes: "Cannot read properties of null (reading 'classList')" at (index):2670
 *
 * Root cause:
 *   ameridex-ui-fixes.js removes #print-dropdown from the DOM.
 *   The inline script in dealer-portal.html registers a document-level click
 *   handler that runs on EVERY click and calls:
 *     document.getElementById('print-dropdown').classList.remove('active')
 *   Since the element was removed, getElementById returns null and .classList throws.
 *
 * Fix:
 *   We re-register the same document click handler with a null guard.
 *   Because addEventListener with the same function reference is idempotent,
 *   we add a capturing-phase handler that runs first and is harmless.
 *   But since the original is an anonymous function we can't remove it,
 *   so instead we patch getElementById briefly -- no, simplest approach:
 *   just let the original handler run and suppress the error with a
 *   defensive wrapper on the classList access.
 *
 *   Actually the cleanest fix: we know the only thing the handler does is
 *   close the dropdown. If the dropdown is gone, there's nothing to close.
 *   So we add a NEW document click handler (capture phase, runs first)
 *   that stops the original from crashing by ensuring a stub element exists,
 *   or we simply swallow the error.
 *
 *   Simplest reliable approach: patch out the error by ensuring
 *   #print-dropdown always resolves. We create a hidden dummy element
 *   with that ID so getElementById never returns null.
 */

(function () {
    'use strict';

    // If #print-dropdown was already removed by ui-fixes, create a
    // hidden no-op stub so the inline handler doesn't crash.
    if (!document.getElementById('print-dropdown')) {
        var stub = document.createElement('div');
        stub.id = 'print-dropdown';
        stub.style.display = 'none';
        stub.className = '';  // classList will work fine on this
        document.body.appendChild(stub);
        console.log('[ui-null-guards] Created hidden #print-dropdown stub to prevent classList error.');
    }

    console.log('[ameridex-ui-null-guards] v1.0 loaded.');
})();
