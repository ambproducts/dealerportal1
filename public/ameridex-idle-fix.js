// ============================================================
// AmeriDex Dealer Portal - Idle Timer & DOM Safety Patch
// Date: 2026-02-27
// ============================================================
// FIXES:
//   1. resetIdleTimer() crashes with "Cannot read properties
//      of null (reading 'classList')" when #timeout-warning
//      has not yet been parsed into the DOM. This happens on
//      page load when a dealer code exists in localStorage
//      (showMainApp -> resetIdleTimer fires before the element
//      exists) and on every mouse/key/scroll event registered
//      in global scope.
//
//   2. showTimeoutWarning() and handleSessionTimeout() also
//      access #timeout-warning and #timeout-countdown without
//      null guards.
//
// APPROACH: Wrap the three functions with null-safe versions.
//   The original functions are defined in the inline <script>
//   of dealer-portal.html and are globally accessible.
//
// LOAD ORDER: This file must be loaded AFTER dealer-portal.html
//   inline script (place the <script> tag after the inline
//   script block, alongside the other patch files).
// ============================================================

(function () {
    'use strict';

    // ---- 1. Guard resetIdleTimer ----
    var _origResetIdleTimer = window.resetIdleTimer;

    window.resetIdleTimer = function () {
        var tw = document.getElementById('timeout-warning');
        if (!tw) {
            // DOM not ready yet or element removed during teardown.
            // Still clear timers to prevent stale callbacks.
            if (typeof idleTimer !== 'undefined') clearTimeout(idleTimer);
            if (typeof warningTimer !== 'undefined') clearTimeout(warningTimer);
            if (typeof countdownInterval !== 'undefined') clearInterval(countdownInterval);
            return;
        }
        // Element exists, safe to call original
        if (typeof _origResetIdleTimer === 'function') {
            _origResetIdleTimer();
        }
    };

    // ---- 2. Guard showTimeoutWarning ----
    var _origShowTimeoutWarning = window.showTimeoutWarning;

    window.showTimeoutWarning = function () {
        var tw = document.getElementById('timeout-warning');
        var cd = document.getElementById('timeout-countdown');
        if (!tw || !cd) {
            console.warn('[IdleFix] Cannot show timeout warning: DOM elements missing.');
            return;
        }
        if (typeof _origShowTimeoutWarning === 'function') {
            _origShowTimeoutWarning();
        }
    };

    // ---- 3. Guard handleSessionTimeout ----
    var _origHandleSessionTimeout = window.handleSessionTimeout;

    window.handleSessionTimeout = function () {
        var tw = document.getElementById('timeout-warning');
        if (!tw) {
            // Still reset the form if possible
            if (typeof resetFormOnly === 'function') {
                resetFormOnly();
            }
            return;
        }
        if (typeof _origHandleSessionTimeout === 'function') {
            _origHandleSessionTimeout();
        }
    };

    // ---- 4. Guard continueSession ----
    var _origContinueSession = window.continueSession;

    window.continueSession = function () {
        var tw = document.getElementById('timeout-warning');
        if (!tw) return;
        if (typeof _origContinueSession === 'function') {
            _origContinueSession();
        }
    };

    // ---- 5. Guard saveAndClose ----
    var _origSaveAndClose = window.saveAndClose;

    window.saveAndClose = function () {
        var tw = document.getElementById('timeout-warning');
        if (!tw) {
            // Still try to save
            if (typeof saveCurrentQuote === 'function' && typeof currentQuote !== 'undefined'
                && currentQuote.lineItems && currentQuote.lineItems.length > 0) {
                saveCurrentQuote();
            }
            if (typeof resetFormOnly === 'function') {
                resetFormOnly();
            }
            return;
        }
        if (typeof _origSaveAndClose === 'function') {
            _origSaveAndClose();
        }
    };

    console.log('[AmeriDex IdleFix] Null-guard patch loaded for resetIdleTimer and related functions.');
})();
