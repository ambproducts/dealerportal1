// ============================================================
// AmeriDex Dealer Portal - Quote Editor v1.1
// Date: 2026-03-02
// ============================================================
// v1.1 FIXES:
//
//   FIX 1: restoreQuoteToDOM is a private local function inside
//   ameridex-api.js's IIFE — it is never assigned to window.*,
//   so window.restoreQuoteToDOM is always undefined and the
//   polling patch loop in v1.0 retried forever without effect.
//   Address fields were therefore never populated when loading
//   a saved quote.
//
//   SOLUTION: Drop the restoreQuoteToDOM patch entirely.
//   Instead, hook the post-load address population directly
//   inside our loadQuote wrapper (we already own that wrapper).
//   After _origLoad runs, read currentQuote.customer.address/
//   city/state and write them to the DOM fields ourselves.
//   No dependency on any internal api.js function.
//
//   FIX 2: "Done Editing" clicked -> doSave(true) was called
//   AFTER lockForm(), which disables all inputs. disabled inputs
//   still have readable .value in browsers, but the ordering
//   was logically wrong and caused confusion. Sequence is now
//   explicitly: syncDOM -> save -> lock -> update button.
//
// v1.0 responsibilities retained:
//   - Read-only lock on quote load, Edit Quote / Done Editing banner
//   - Autosave (1.5s debounce) while in edit mode
//   - syncQuoteFromDOM patched to include address/city/state
//   - Null-guard stubs for removed DOM section IDs
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
    // HELPER: Write address fields from a customer object to DOM
    // Used after any quote load so the injected fields are filled.
    // ----------------------------------------------------------
    function populateAddressFields(customer) {
        var c = customer || {};
        var addrEl  = document.getElementById('cust-address');
        var cityEl  = document.getElementById('cust-city');
        var stateEl = document.getElementById('cust-state');
        if (addrEl)  addrEl.value  = c.address || '';
        if (cityEl)  cityEl.value  = c.city    || '';
        if (stateEl) stateEl.value = c.state   || '';
    }


    // ----------------------------------------------------------
    // FIX 1: Patch syncQuoteFromDOM to include address fields
    //
    // The original in ameridex-patches.js never reads
    // cust-address / cust-city / cust-state (they were injected
    // later by ameridex-customer-address.js). So saveCurrentQuote
    // -> syncQuoteFromDOM never wrote the address into
    // currentQuote.customer, and it never reached the server.
    // ----------------------------------------------------------
    function patchSyncQuoteFromDOM() {
        var _orig = window.syncQuoteFromDOM;
        if (typeof _orig !== 'function') {
            setTimeout(patchSyncQuoteFromDOM, 150);
            return;
        }

        window.syncQuoteFromDOM = function syncQuoteFromDOM() {
            _orig.apply(this, arguments);

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

        console.log('[QuoteEditor v1.1] syncQuoteFromDOM patched to include address/city/state.');
    }


    // ----------------------------------------------------------
    // READ-ONLY / EDIT MODE
    // ----------------------------------------------------------
    var _editMode    = false;
    var _quoteLoaded = false;

    var FORM_SELECTOR = [
        '#order-form input',
        '#order-form select',
        '#order-form textarea',
        '#order-form button:not(#edit-quote-btn):not(#new-quote-btn)'
    ].join(', ');

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
            btn.textContent      = 'Done Editing';
            btn.style.background = '#10b981';
        } else {
            btn.textContent      = '\u270E Edit Quote';
            btn.style.background = '#2563eb';
        }
    }


    // ----------------------------------------------------------
    // BANNER: sticky top bar with quote ID + status + buttons
    // ----------------------------------------------------------
    var BANNER_ID = 'qe-edit-banner';

    function injectBannerStyles() {
        if (document.getElementById('qe-edit-banner-styles')) return;
        var s = document.createElement('style');
        s.id  = 'qe-edit-banner-styles';
        s.textContent = [
            '#' + BANNER_ID + ' {',
            '  position: sticky; top: 0; z-index: 900;',
            '  display: flex; align-items: center; gap: 12px;',
            '  padding: 10px 20px;',
            '  background: #1a1f35;',
            '  border-bottom: 1px solid #2d3250;',
            '  box-shadow: 0 2px 12px rgba(0,0,0,0.4);',
            '}',
            '#' + BANNER_ID + '.qe-hidden { display: none !important; }',
            '#qe-quote-label {',
            '  flex: 1; font-size: 0.88rem; font-weight: 600;',
            '  color: #94a3b8; letter-spacing: 0.02em;',
            '}',
            '#qe-quote-label strong { color: #e2e8f0; }',
            '#qe-status-text {',
            '  font-size: 0.8rem; color: #64748b;',
            '  min-width: 90px; text-align: right;',
            '}',
            '#qe-status-text.saving { color: #f59e0b; }',
            '#qe-status-text.saved  { color: #10b981; }',
            '#edit-quote-btn {',
            '  padding: 7px 18px; border: none; border-radius: 6px;',
            '  color: #fff; font-size: 0.85rem; font-weight: 700;',
            '  cursor: pointer; transition: opacity .15s;',
            '}',
            '#edit-quote-btn:hover { opacity: .85; }',
            '#new-quote-btn {',
            '  padding: 7px 14px; border: 1px solid #4b5563;',
            '  border-radius: 6px; background: transparent;',
            '  color: #94a3b8; font-size: 0.82rem; font-weight: 600;',
            '  cursor: pointer; transition: background .15s;',
            '}',
            '#new-quote-btn:hover { background: rgba(255,255,255,0.07); }',
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
        banner.id        = BANNER_ID;
        banner.className = 'qe-hidden';
        banner.innerHTML =
            '<span id="qe-quote-label">Viewing quote <strong id="qe-quote-id-label"></strong></span>' +
            '<span id="qe-status-text"></span>' +
            '<button id="new-quote-btn" type="button">+ New Quote</button>' +
            '<button id="edit-quote-btn" type="button">&#9998; Edit Quote</button>';

        var target = document.getElementById('main-app') || document.getElementById('order-form');
        if (target) {
            target.insertBefore(banner, target.firstChild);
        } else {
            document.body.insertBefore(banner, document.body.firstChild);
        }

        // FIX 2: Done Editing — sync -> save -> lock (in that order)
        document.getElementById('edit-quote-btn').addEventListener('click', function () {
            if (_editMode) {
                // 1. Read all DOM fields into currentQuote (including address)
                if (typeof window.syncQuoteFromDOM === 'function') {
                    window.syncQuoteFromDOM();
                }
                // 2. Persist immediately
                _performSave();
                // 3. Lock the form AFTER save is dispatched
                lockForm();
            } else {
                unlockForm();
            }
        });

        document.getElementById('new-quote-btn').addEventListener('click', function () {
            if (_editMode) {
                if (!confirm('Leave edit mode? Changes will be saved first.')) return;
                if (typeof window.syncQuoteFromDOM === 'function') window.syncQuoteFromDOM();
                _performSave();
                lockForm();
            }
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
        el.textContent = msg;
        el.className   = cls || '';
    }


    // ----------------------------------------------------------
    // AUTOSAVE
    // ----------------------------------------------------------
    var _saveTimer       = null;
    var _saveDebounceMs  = 1500;

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
            setStatusText('Saved \u2713', 'saved');
            setTimeout(function () {
                if (_editMode) setStatusText('Edit mode active');
            }, 2500);
            console.log('[QuoteEditor v1.1] Saved quote:', window.currentQuote && window.currentQuote.quoteId);
        } catch (e) {
            setStatusText('Save failed', '');
            console.error('[QuoteEditor v1.1] Save error:', e);
        }
    }

    function attachAutosaveListeners() {
        var form = document.getElementById('order-form');
        if (!form) {
            setTimeout(attachAutosaveListeners, 400);
            return;
        }
        form.addEventListener('input',  function () { if (_editMode) doSave(false); });
        form.addEventListener('change', function () { if (_editMode) doSave(false); });
        console.log('[QuoteEditor v1.1] Autosave listeners attached to #order-form.');
    }


    // ----------------------------------------------------------
    // PATCH window.loadQuote
    //
    // After _origLoad runs:
    //   1. Populate cust-address/city/state from currentQuote.customer
    //      (FIX 1: replaces the broken restoreQuoteToDOM patch)
    //   2. Lock the form and show the banner
    // ----------------------------------------------------------
    function patchLoadQuote() {
        var _origLoad = window.loadQuote;
        if (typeof _origLoad !== 'function') {
            setTimeout(patchLoadQuote, 200);
            return;
        }

        window.loadQuote = function (idx) {
            _origLoad.apply(this, arguments);

            // Give api.js's loadQuote a tick to finish writing
            // currentQuote fields before we read them
            setTimeout(function () {
                var q   = window.currentQuote;
                var id  = (q && (q.quoteId || q.quoteNumber || q._serverId)) || 'Draft';

                // FIX 1: populate address fields (restoreQuoteToDOM
                // is private inside api.js IIFE, cannot be patched)
                populateAddressFields(q && q.customer);

                _quoteLoaded = true;
                _editMode    = false;
                lockForm();
                showBanner(id);
                console.log('[QuoteEditor v1.1] Quote loaded read-only: ' + id);
            }, 120);
        };

        console.log('[QuoteEditor v1.1] loadQuote patched for read-only mode + address population.');
    }


    // ----------------------------------------------------------
    // BOOTSTRAP: catch URL-param / session-resume pre-loads
    // portal-nav fires loadQuote BEFORE this script runs, so
    // we catch the already-settled currentQuote on ameridex-login.
    // ----------------------------------------------------------
    function bootstrapCheck() {
        var q  = window.currentQuote;
        var id = q && (q.quoteId || q.quoteNumber || q._serverId);
        if (!id) return;

        var banner = document.getElementById(BANNER_ID);
        if (!banner || banner.classList.contains('qe-hidden')) {
            // Populate address fields for the pre-loaded quote
            populateAddressFields(q.customer);

            _quoteLoaded = true;
            _editMode    = false;
            lockForm();
            showBanner(id);
            console.log('[QuoteEditor v1.1] Bootstrap: locked pre-loaded quote ' + id);
        }
    }


    // ----------------------------------------------------------
    // INIT
    // ----------------------------------------------------------
    function init() {
        injectBanner();
        patchSyncQuoteFromDOM();
        // NOTE: patchRestoreQuoteToDOM() removed in v1.1 —
        // restoreQuoteToDOM is private inside ameridex-api.js
        // IIFE and never exposed on window. Address population
        // is now handled directly in our loadQuote wrapper and
        // bootstrapCheck() via populateAddressFields().
        patchLoadQuote();
        attachAutosaveListeners();

        window.addEventListener('ameridex-login', function () {
            setTimeout(bootstrapCheck, 400);
        });

        // Fallback for late-settling state
        setTimeout(bootstrapCheck, 1800);

        console.log('[QuoteEditor v1.1] Initialized.');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
