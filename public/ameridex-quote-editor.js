// ============================================================
// AmeriDex Dealer Portal - Quote Editor v1.0
// Date: 2026-03-02
// ============================================================
// REPLACES: ameridex-address-quote-prompt.js
//
// This module handles three tightly related responsibilities:
//
//   1. READ-ONLY LOCK
//      When a quote is loaded (via URL param, sidebar click, or
//      portal-nav ?quoteId=), all form inputs are locked (disabled
//      + visual overlay). A floating "Edit Quote" button appears.
//      Clicking it unlocks the form and starts an autosave session.
//
//   2. ADDRESS FIELD SYNC FIX
//      syncQuoteFromDOM() (ameridex-patches.js) was written before
//      cust-address / cust-city / cust-state existed. It never reads
//      those fields, so the address is NEVER written into
//      currentQuote.customer and never reaches the server payload.
//      We patch syncQuoteFromDOM() here to append the three fields.
//
//   3. AUTOSAVE
//      While the form is in edit mode, any input/change event on
//      any form field inside #order-form debounces a 1.5s autosave
//      via saveCurrentQuote(). A small status indicator shows
//      "Saving..." and "Saved" feedback.
//
// NULL-GUARD FOR classList CRASH (dealer-portal.html:1448)
//      PATCH 0 in ameridex-patches.js removes #saved-quotes-section
//      and #customers-section. The inline DOMContentLoaded handler
//      in dealer-portal.html calls .classList on those IDs.
//      We inject invisible stub nodes so getElementById never
//      returns null for them.
//
// LOAD ORDER:
//   Load AFTER ameridex-customer-address.js and ameridex-api.js.
//   Add to script-loader.js or EXTRA_SCRIPTS in ameridex-patches.js.
// ============================================================

(function () {
    'use strict';

    // ----------------------------------------------------------
    // NULL-GUARD: Inject stubs for removed section IDs
    // Prevents dealer-portal.html:1448 classList crash
    // ----------------------------------------------------------
    var REMOVED_IDS = ['saved-quotes-section', 'customers-section'];

    function injectRemovedIdStubs() {
        REMOVED_IDS.forEach(function (id) {
            if (!document.getElementById(id)) {
                var stub = document.createElement('div');
                stub.id = id;
                stub.setAttribute('aria-hidden', 'true');
                stub.style.cssText = 'display:none!important;position:absolute;width:0;height:0;overflow:hidden;pointer-events:none;';
                document.body.appendChild(stub);
            }
        });
    }

    setTimeout(injectRemovedIdStubs, 20);
    setTimeout(injectRemovedIdStubs, 500);


    // ----------------------------------------------------------
    // FIX: Patch syncQuoteFromDOM to include address fields
    //
    // The original function in ameridex-patches.js reads all
    // customer fields EXCEPT cust-address/cust-city/cust-state
    // because those were added later by ameridex-customer-address.js.
    // saveCurrentQuote() calls syncQuoteFromDOM() before syncing
    // to the server, so the address has never been included in
    // the saved payload.
    // ----------------------------------------------------------
    function patchSyncQuoteFromDOM() {
        var _orig = window.syncQuoteFromDOM;
        if (typeof _orig !== 'function') {
            // Not ready yet - retry
            setTimeout(patchSyncQuoteFromDOM, 150);
            return;
        }

        window.syncQuoteFromDOM = function syncQuoteFromDOM() {
            // Run the original first (handles all existing fields)
            _orig.apply(this, arguments);

            // Now append the address fields that the original misses
            var q    = window.currentQuote;
            var cust = q ? q.customer : null;
            if (!cust) return;

            var addrEl  = document.getElementById('cust-address');
            var cityEl  = document.getElementById('cust-city');
            var stateEl = document.getElementById('cust-state');

            if (addrEl)  cust.address = addrEl.value.trim();
            if (cityEl)  cust.city    = cityEl.value.trim();
            if (stateEl) cust.state   = stateEl.value.trim();
        };

        console.log('[QuoteEditor v1.0] syncQuoteFromDOM patched to include address/city/state.');
    }


    // ----------------------------------------------------------
    // FIX: Patch restoreQuoteToDOM to populate address fields
    //
    // ameridex-api.js restoreQuoteToDOM() restores 11 DOM fields
    // but again predates the address injection. When a quote is
    // loaded, cust-address/cust-city/cust-state are left blank
    // even if the quote has them saved on the server.
    // ----------------------------------------------------------
    function patchRestoreQuoteToDOM() {
        var _origRestore = window.restoreQuoteToDOM;
        if (typeof _origRestore !== 'function') {
            setTimeout(patchRestoreQuoteToDOM, 150);
            return;
        }

        window.restoreQuoteToDOM = function restoreQuoteToDOM(quoteObj) {
            // Run the original
            _origRestore.apply(this, arguments);

            // Populate address fields
            var c = quoteObj.customer || {};
            var addrEl  = document.getElementById('cust-address');
            var cityEl  = document.getElementById('cust-city');
            var stateEl = document.getElementById('cust-state');

            if (addrEl)  addrEl.value  = c.address || '';
            if (cityEl)  cityEl.value  = c.city    || '';
            if (stateEl) stateEl.value = c.state   || '';
        };

        console.log('[QuoteEditor v1.0] restoreQuoteToDOM patched to populate address/city/state.');
    }


    // ----------------------------------------------------------
    // READ-ONLY / EDIT MODE
    // ----------------------------------------------------------
    var _editMode   = false;
    var _quoteLoaded = false;

    // Selector for all interactive form elements inside the quote form
    var FORM_SELECTOR = '#order-form input, #order-form select, #order-form textarea, #order-form button:not(#edit-quote-btn):not(#new-quote-btn)';

    // Buttons that should remain accessible even in read-only mode
    // (e.g. Download PDF). Add IDs here to preserve them.
    var ALWAYS_ENABLED_IDS = ['download-pdf-btn', 'print-btn', 'edit-quote-btn', 'new-quote-btn'];

    function lockForm() {
        _editMode = false;
        document.querySelectorAll(FORM_SELECTOR).forEach(function (el) {
            if (ALWAYS_ENABLED_IDS.indexOf(el.id) === -1) {
                el.disabled = true;
                el.setAttribute('data-qe-locked', '1');
            }
        });
        setStatusText('');
        updateEditButton();
    }

    function unlockForm() {
        _editMode = true;
        document.querySelectorAll('[data-qe-locked]').forEach(function (el) {
            el.disabled = false;
            el.removeAttribute('data-qe-locked');
        });
        updateEditButton();
        setStatusText('Edit mode active');
    }

    function updateEditButton() {
        var btn = document.getElementById('edit-quote-btn');
        if (!btn) return;
        if (_editMode) {
            btn.textContent   = 'Done Editing';
            btn.style.background = '#10b981';
        } else {
            btn.textContent   = '\u270E Edit Quote';
            btn.style.background = '#2563eb';
        }
    }


    // ----------------------------------------------------------
    // INJECT EDIT BUTTON + STATUS BAR
    // ----------------------------------------------------------
    var BANNER_ID = 'qe-edit-banner';

    function injectBannerStyles() {
        if (document.getElementById('qe-edit-banner-styles')) return;
        var s = document.createElement('style');
        s.id  = 'qe-edit-banner-styles';
        s.textContent = [
            '#' + BANNER_ID + ' {',
            '  position: sticky;',
            '  top: 0;',
            '  z-index: 900;',
            '  display: flex;',
            '  align-items: center;',
            '  gap: 12px;',
            '  padding: 10px 20px;',
            '  background: #1a1f35;',
            '  border-bottom: 1px solid #2d3250;',
            '  box-shadow: 0 2px 12px rgba(0,0,0,0.4);',
            '  transition: opacity .2s;',
            '}',
            '#' + BANNER_ID + '.qe-hidden { display: none !important; }',
            '#qe-quote-label {',
            '  flex: 1;',
            '  font-size: 0.88rem;',
            '  font-weight: 600;',
            '  color: #94a3b8;',
            '  letter-spacing: 0.02em;',
            '}',
            '#qe-quote-label strong { color: #e2e8f0; }',
            '#qe-status-text {',
            '  font-size: 0.8rem;',
            '  color: #64748b;',
            '  min-width: 90px;',
            '  text-align: right;',
            '}',
            '#qe-status-text.saving { color: #f59e0b; }',
            '#qe-status-text.saved  { color: #10b981; }',
            '#edit-quote-btn {',
            '  padding: 7px 18px;',
            '  border: none;',
            '  border-radius: 6px;',
            '  color: #fff;',
            '  font-size: 0.85rem;',
            '  font-weight: 700;',
            '  cursor: pointer;',
            '  transition: opacity .15s;',
            '}',
            '#edit-quote-btn:hover { opacity: .85; }',
            '#new-quote-btn {',
            '  padding: 7px 14px;',
            '  border: 1px solid #4b5563;',
            '  border-radius: 6px;',
            '  background: transparent;',
            '  color: #94a3b8;',
            '  font-size: 0.82rem;',
            '  font-weight: 600;',
            '  cursor: pointer;',
            '  transition: background .15s;',
            '}',
            '#new-quote-btn:hover { background: rgba(255,255,255,0.07); }',
            // Locked-field visual cue
            '[data-qe-locked] {',
            '  opacity: 0.55 !important;',
            '  pointer-events: none !important;',
            '  user-select: none !important;',
            '}'
        ].join('\n');
        document.head.appendChild(s);
    }

    function injectBanner() {
        if (document.getElementById(BANNER_ID)) return;
        injectBannerStyles();

        var banner = document.createElement('div');
        banner.id = BANNER_ID;
        banner.className = 'qe-hidden';
        banner.innerHTML =
            '<span id="qe-quote-label">Viewing quote <strong id="qe-quote-id-label"></strong></span>' +
            '<span id="qe-status-text"></span>' +
            '<button id="new-quote-btn" type="button">+ New Quote</button>' +
            '<button id="edit-quote-btn" type="button">&#9998; Edit Quote</button>';

        // Insert at the top of #main-app or #order-form, whichever exists first
        var target = document.getElementById('main-app') || document.getElementById('order-form');
        if (target) {
            target.insertBefore(banner, target.firstChild);
        } else {
            document.body.insertBefore(banner, document.body.firstChild);
        }

        document.getElementById('edit-quote-btn').addEventListener('click', function () {
            if (_editMode) {
                // Done editing - force a save
                doSave(true);
                lockForm();
            } else {
                unlockForm();
            }
        });

        document.getElementById('new-quote-btn').addEventListener('click', function () {
            if (_editMode && !confirm('Leave edit mode? Unsaved changes will be saved first.')) return;
            if (_editMode) doSave(true);
            // Reset to a blank new quote
            if (typeof window.resetFormOnly === 'function') window.resetFormOnly();
            hideBanner();
        });
    }

    function showBanner(quoteId) {
        var banner = document.getElementById(BANNER_ID);
        if (!banner) return;
        banner.classList.remove('qe-hidden');
        var label = document.getElementById('qe-quote-id-label');
        if (label) label.textContent = quoteId || 'Draft';
        updateEditButton();
    }

    function hideBanner() {
        var banner = document.getElementById(BANNER_ID);
        if (banner) banner.classList.add('qe-hidden');
        _quoteLoaded = false;
        _editMode    = false;
    }

    function setStatusText(msg, cls) {
        var el = document.getElementById('qe-status-text');
        if (!el) return;
        el.textContent  = msg;
        el.className    = cls || '';
    }


    // ----------------------------------------------------------
    // AUTOSAVE
    // ----------------------------------------------------------
    var _saveTimer = null;
    var _saveDebounceMs = 1500;

    function doSave(immediate) {
        clearTimeout(_saveTimer);
        if (immediate) {
            _performSave();
        } else {
            setStatusText('Unsaved...', 'saving');
            _saveTimer = setTimeout(_performSave, _saveDebounceMs);
        }
    }

    function _performSave() {
        if (typeof window.saveCurrentQuote !== 'function') return;
        try {
            setStatusText('Saving...', 'saving');
            window.saveCurrentQuote();
            setStatusText('Saved', 'saved');
            setTimeout(function () { setStatusText('Edit mode active'); }, 2500);
        } catch (e) {
            setStatusText('Save failed', '');
            console.error('[QuoteEditor] Save failed:', e);
        }
    }

    function attachAutosaveListeners() {
        var form = document.getElementById('order-form');
        if (!form) {
            setTimeout(attachAutosaveListeners, 400);
            return;
        }

        form.addEventListener('input',  onFormActivity);
        form.addEventListener('change', onFormActivity);
        console.log('[QuoteEditor v1.0] Autosave listeners attached to #order-form.');
    }

    function onFormActivity() {
        if (!_editMode) return;
        doSave(false);
    }


    // ----------------------------------------------------------
    // PATCH window.loadQuote
    // Intercept every load to enter read-only mode.
    // ----------------------------------------------------------
    function patchLoadQuote() {
        var _origLoad = window.loadQuote;
        if (typeof _origLoad !== 'function') {
            setTimeout(patchLoadQuote, 200);
            return;
        }

        window.loadQuote = function (idx) {
            _origLoad.apply(this, arguments);

            setTimeout(function () {
                var q  = window.currentQuote;
                var id = (q && (q.quoteId || q.quoteNumber || q._serverId)) || 'Draft';
                _quoteLoaded = true;
                _editMode    = false;
                lockForm();
                showBanner(id);
                console.log('[QuoteEditor v1.0] Quote loaded read-only: ' + id);
            }, 100);
        };

        console.log('[QuoteEditor v1.0] loadQuote patched for read-only mode.');
    }


    // ----------------------------------------------------------
    // BOOTSTRAP: catch URL-param pre-loads
    // (portal-nav fires loadQuote before this script runs;
    //  we detect an already-loaded quote on ameridex-login)
    // ----------------------------------------------------------
    function bootstrapCheck() {
        var q  = window.currentQuote;
        var id = q && (q.quoteId || q.quoteNumber || q._serverId);
        if (!id) return; // blank/new quote - no lock needed

        // If a quote is already sitting in currentQuote and banner
        // is not yet shown, enter read-only mode now.
        if (!document.getElementById(BANNER_ID) ||
            document.getElementById(BANNER_ID).classList.contains('qe-hidden')) {
            _quoteLoaded = true;
            _editMode    = false;
            lockForm();
            showBanner(id);
            console.log('[QuoteEditor v1.0] Bootstrap: locked pre-loaded quote ' + id);
        }
    }


    // ----------------------------------------------------------
    // INIT
    // ----------------------------------------------------------
    function init() {
        injectBanner();
        patchSyncQuoteFromDOM();
        patchRestoreQuoteToDOM();
        patchLoadQuote();
        attachAutosaveListeners();

        // Listen for the login event (fires after quotes load)
        // to catch the URL-param scenario
        window.addEventListener('ameridex-login', function () {
            setTimeout(bootstrapCheck, 400);
        });

        // Belt-and-suspenders fallback
        setTimeout(bootstrapCheck, 1800);

        console.log('[QuoteEditor v1.0] Initialized.');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
