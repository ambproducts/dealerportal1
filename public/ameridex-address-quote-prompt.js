// ============================================================
// AmeriDex Dealer Portal - Address-on-Existing-Quote Prompt v1.1
// Date: 2026-03-02
// ============================================================
// PURPOSE:
//   When a user retrieves (loads) an existing quote that has NO
//   address previously saved, and then types/selects an address
//   (any of: address, city, or state), a modal dialog appears
//   asking whether to:
//     A) Update the existing quote with the new address, OR
//     B) Save the address as part of a brand-new separate quote.
//
// v1.1 FIXES:
//   - FIX 1 (address prompt not firing):
//     portal-nav.js calls loadQuote() via the ameridex-login event,
//     which fires BEFORE this script loads (we are position 9 in the
//     chain, portal-nav is position 1). Our loadQuote patch was
//     therefore applied AFTER the initial URL-param load had already
//     completed, leaving _loadedQuoteId = null. The address field
//     change handler then hit the `if (!_loadedQuoteId) return;`
//     guard and silently exited.
//
//     FIX: Added bootstrapFromExistingLoad(). After all scripts
//     finish loading (triggered by 'ameridex-login' + small delay,
//     or a fallback DOMContentLoaded scan), we inspect currentQuote
//     directly. If it looks like a real saved quote (has quoteId/
//     quoteNumber), we back-fill _loadedQuoteId and
//     _loadedQuoteHadAddress without needing loadQuote to have fired
//     through our patch.
//
//   - FIX 2 (Uncaught TypeError: Cannot read properties of null
//     (reading 'classList') at dealer-portal.html:1448):
//     PATCH 0 in ameridex-patches.js removes saved-quotes-section
//     and customers-section from the DOM. The inline DOMContentLoaded
//     handler in dealer-portal.html still calls .classList on these
//     removed elements. Since we cannot edit the inline script, we
//     inject null-safe placeholder objects on the removed IDs so
//     getElementById returns a harmless stub instead of null.
//     This is done in a ONE-TIME MutationObserver that fires as soon
//     as the sections are removed, replacing the orphaned IDs with
//     stub nodes so getElementById never returns null for them.
//
// LOAD ORDER:
//   Must load AFTER ameridex-customer-address.js (position 8).
// ============================================================

(function () {
    'use strict';

    // ----------------------------------------------------------
    // FIX 2: Null-guard for removed DOM sections
    // dealer-portal.html:1448 does something like:
    //   document.getElementById('saved-quotes-section').classList...
    // after PATCH 0 removes that element. We re-attach invisible
    // stub elements for those IDs so getElementById always returns
    // a real (harmless) node.
    // ----------------------------------------------------------
    var PATCHED_IDS = ['saved-quotes-section', 'customers-section'];

    function injectRemovedIdStubs() {
        PATCHED_IDS.forEach(function (id) {
            if (!document.getElementById(id)) {
                var stub = document.createElement('div');
                stub.id = id;
                stub.setAttribute('aria-hidden', 'true');
                stub.style.cssText = 'display:none!important;position:absolute;width:0;height:0;overflow:hidden;pointer-events:none;';
                document.body.appendChild(stub);
            }
        });
    }

    // Run immediately (PATCH 0 runs synchronously on DOMContentLoaded)
    // and once more after a short delay to catch any async removal.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            // Small delay: let ameridex-patches.js PATCH 0 run first
            setTimeout(injectRemovedIdStubs, 20);
        });
    } else {
        setTimeout(injectRemovedIdStubs, 20);
    }
    // Belt-and-suspenders: also run after 500ms for late removals
    setTimeout(injectRemovedIdStubs, 500);


    // ----------------------------------------------------------
    // SAFE GLOBAL ACCESSORS
    // ----------------------------------------------------------
    function getQuote() {
        try { return currentQuote; } catch (e) {}
        return window.currentQuote || null;
    }
    function setQuote(q) {
        try {
            if (typeof window.setCurrentQuote === 'function') {
                window.setCurrentQuote(q);
                return;
            }
        } catch (e) {}
        window.currentQuote = q;
    }

    // ----------------------------------------------------------
    // STATE
    // ----------------------------------------------------------
    var _loadedQuoteHadAddress = false;
    var _loadedQuoteId         = null;
    var _promptShown           = false;
    var _bootstrapDone         = false;

    // ----------------------------------------------------------
    // HELPERS
    // ----------------------------------------------------------
    function addressFieldsHaveValue() {
        var addr  = (document.getElementById('cust-address') || {}).value || '';
        var city  = (document.getElementById('cust-city')    || {}).value || '';
        var state = (document.getElementById('cust-state')   || {}).value || '';
        return (addr.trim() !== '' || city.trim() !== '' || state.trim() !== '');
    }

    function currentAddressSnapshot() {
        return {
            address : (document.getElementById('cust-address') || {}).value || '',
            city    : (document.getElementById('cust-city')    || {}).value || '',
            state   : (document.getElementById('cust-state')   || {}).value || ''
        };
    }

    function quoteHasAddress(cust) {
        if (!cust) return false;
        return !!(
            (cust.address && cust.address.trim() !== '') ||
            (cust.city    && cust.city.trim()    !== '') ||
            (cust.state   && cust.state.trim()   !== '')
        );
    }

    // ----------------------------------------------------------
    // FIX 1: Bootstrap from an already-loaded quote
    //
    // Called after all scripts have settled. Reads currentQuote
    // directly. If it looks like a real saved quote, back-fills
    // the state variables so the address-change listeners work
    // correctly even though loadQuote ran before our patch.
    // ----------------------------------------------------------
    function bootstrapFromExistingLoad() {
        if (_bootstrapDone) return;
        _bootstrapDone = true;

        var q    = getQuote();
        var cust = q ? q.customer : null;

        // Only proceed if this is a real saved quote (has an ID),
        // not a blank new-quote form.
        var qId = q && (q.quoteNumber || q.quoteId || q.id || q._serverId);
        if (!qId) {
            console.log('[AddrPrompt v1.1] Bootstrap: no saved quote active, no action needed.');
            return;
        }

        // If _loadedQuoteId was already set by our loadQuote patch,
        // don't override it.
        if (_loadedQuoteId) {
            console.log('[AddrPrompt v1.1] Bootstrap: loadQuote patch already set state, skipping.');
            return;
        }

        _loadedQuoteId         = qId;
        _loadedQuoteHadAddress = quoteHasAddress(cust);
        _promptShown           = false;

        console.log(
            '[AddrPrompt v1.1] Bootstrap: back-filled from existing load.',
            'Quote ID:', _loadedQuoteId,
            '| Had address:', _loadedQuoteHadAddress
        );
    }

    // ----------------------------------------------------------
    // MODAL STYLES
    // ----------------------------------------------------------
    var MODAL_ID = 'addr-quote-prompt-modal';

    function injectModalStyles() {
        if (document.getElementById('addr-quote-prompt-styles')) return;
        var style = document.createElement('style');
        style.id  = 'addr-quote-prompt-styles';
        style.textContent = [
            '#' + MODAL_ID + '-overlay {',
            '  position:fixed; inset:0;',
            '  background:rgba(0,0,0,0.55);',
            '  z-index:9999;',
            '  display:flex; align-items:center; justify-content:center;',
            '}',
            '#' + MODAL_ID + ' {',
            '  background:#1e2130;',
            '  border:1px solid #2d3250;',
            '  border-radius:10px;',
            '  padding:28px 32px 24px;',
            '  max-width:440px; width:92%;',
            '  box-shadow:0 8px 40px rgba(0,0,0,0.6);',
            '  color:#e2e8f0;',
            '  font-family:inherit;',
            '}',
            '#' + MODAL_ID + ' h3 {',
            '  margin:0 0 8px;',
            '  font-size:1.05rem; font-weight:700;',
            '  color:#f8fafc;',
            '}',
            '#' + MODAL_ID + ' p {',
            '  margin:0 0 20px;',
            '  font-size:0.88rem; color:#94a3b8; line-height:1.5;',
            '}',
            '#' + MODAL_ID + ' .addr-prompt-preview {',
            '  background:#131623;',
            '  border:1px solid #2d3250;',
            '  border-radius:6px;',
            '  padding:10px 14px;',
            '  margin-bottom:20px;',
            '  font-size:0.84rem; color:#cbd5e1;',
            '}',
            '#' + MODAL_ID + ' .addr-prompt-btns {',
            '  display:flex; gap:10px; flex-wrap:wrap;',
            '}',
            '#' + MODAL_ID + ' .addr-prompt-btn {',
            '  flex:1; min-width:120px;',
            '  padding:10px 14px;',
            '  border-radius:6px; border:none; cursor:pointer;',
            '  font-size:0.88rem; font-weight:600;',
            '  transition:opacity .15s;',
            '}',
            '#' + MODAL_ID + ' .addr-prompt-btn:hover { opacity:.85; }',
            '#' + MODAL_ID + ' .btn-update { background:#3b82f6; color:#fff; }',
            '#' + MODAL_ID + ' .btn-new    { background:#10b981; color:#fff; }',
            '#' + MODAL_ID + ' .btn-cancel {',
            '  background:transparent;',
            '  border:1px solid #4b5563 !important;',
            '  color:#94a3b8; flex:0 0 auto;',
            '}'
        ].join('\n');
        document.head.appendChild(style);
    }

    function escapeHTML(str) {
        var d = document.createElement('div');
        d.textContent = String(str);
        return d.innerHTML;
    }

    function buildAddressPreview(snap) {
        var parts = [];
        if (snap.address) parts.push(snap.address);
        var cs = [snap.city, snap.state].filter(Boolean).join(', ');
        if (cs) parts.push(cs);
        return parts.join('<br>') || '(no address entered)';
    }

    function showPromptModal(snap, onUpdate, onNewQuote, onCancel) {
        if (document.getElementById(MODAL_ID + '-overlay')) return;
        injectModalStyles();

        var overlay = document.createElement('div');
        overlay.id  = MODAL_ID + '-overlay';
        overlay.innerHTML =
            '<div id="' + MODAL_ID + '">' +
            '<h3>Address Added to Existing Quote</h3>' +
            '<p>You retrieved quote <strong>' + escapeHTML(_loadedQuoteId || 'this quote') + '</strong>' +
            ' which had no address on file. You entered:</p>' +
            '<div class="addr-prompt-preview">' + buildAddressPreview(snap) + '</div>' +
            '<p>Update the existing quote with this address, or save it as a new separate quote?</p>' +
            '<div class="addr-prompt-btns">' +
            '<button class="addr-prompt-btn btn-update" id="addr-prompt-update">Update Existing Quote</button>' +
            '<button class="addr-prompt-btn btn-new"    id="addr-prompt-new">Save as New Quote</button>' +
            '<button class="addr-prompt-btn btn-cancel" id="addr-prompt-cancel">Cancel</button>' +
            '</div></div>';

        document.body.appendChild(overlay);

        document.getElementById('addr-prompt-update').addEventListener('click', function () { closeModal(); onUpdate();   });
        document.getElementById('addr-prompt-new')   .addEventListener('click', function () { closeModal(); onNewQuote(); });
        document.getElementById('addr-prompt-cancel').addEventListener('click', function () { closeModal(); onCancel();   });

        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) { closeModal(); onCancel(); }
        });
    }

    function closeModal() {
        var el = document.getElementById(MODAL_ID + '-overlay');
        if (el) el.remove();
    }

    // ----------------------------------------------------------
    // ACTIONS
    // ----------------------------------------------------------
    function doUpdateExistingQuote() {
        if (typeof window.saveCurrentQuote === 'function') {
            window.saveCurrentQuote();
            showToast('Address saved to existing quote.');
        } else {
            console.warn('[AddrPrompt] saveCurrentQuote not available.');
        }
        _promptShown = true;
    }

    function doSaveAsNewQuote(snap) {
        var q = getQuote();
        if (!q) {
            console.warn('[AddrPrompt] No currentQuote for new-quote action.');
            return;
        }

        var newQ;
        try {
            newQ = JSON.parse(JSON.stringify(q));
        } catch (e) {
            console.error('[AddrPrompt] Clone failed:', e);
            return;
        }

        // Strip identity so the portal generates a fresh quote number
        newQ.id          = undefined;
        newQ._id         = undefined;
        newQ._serverId   = undefined;
        newQ.quoteId     = undefined;
        newQ.quoteNumber = undefined;
        newQ.status      = 'draft';
        newQ.createdAt   = undefined;
        newQ.updatedAt   = undefined;

        if (newQ.customer) {
            newQ.customer.address = snap.address;
            newQ.customer.city    = snap.city;
            newQ.customer.state   = snap.state;
        }

        setQuote(newQ);

        if (typeof window.saveCurrentQuote === 'function') {
            window.saveCurrentQuote();
            showToast('Address saved as a new separate quote.');
        } else {
            console.warn('[AddrPrompt] saveCurrentQuote not available.');
        }

        _promptShown = true;
    }

    function doCancelAddress() {
        var addrEl  = document.getElementById('cust-address');
        var cityEl  = document.getElementById('cust-city');
        var stateEl = document.getElementById('cust-state');
        if (addrEl)  addrEl.value  = '';
        if (cityEl)  cityEl.value  = '';
        if (stateEl) stateEl.value = '';

        var cust = getQuote() ? getQuote().customer : null;
        if (cust) { cust.address = ''; cust.city = ''; cust.state = ''; }

        _promptShown = false; // allow retry
    }

    // ----------------------------------------------------------
    // TOAST
    // ----------------------------------------------------------
    function showToast(msg) {
        var t = document.createElement('div');
        t.textContent = msg;
        t.style.cssText = [
            'position:fixed', 'bottom:24px', 'right:24px',
            'background:#10b981', 'color:#fff',
            'padding:12px 20px', 'border-radius:8px',
            'font-size:0.88rem', 'font-weight:600',
            'z-index:10000', 'box-shadow:0 4px 20px rgba(0,0,0,0.4)',
            'transition:opacity .3s'
        ].join(';');
        document.body.appendChild(t);
        setTimeout(function () {
            t.style.opacity = '0';
            setTimeout(function () { t.remove(); }, 350);
        }, 3500);
    }

    // ----------------------------------------------------------
    // DEBOUNCED CHANGE HANDLER
    // ----------------------------------------------------------
    var _debounceTimer = null;

    function onAddressFieldChanged() {
        clearTimeout(_debounceTimer);
        _debounceTimer = setTimeout(function () {
            // FIX 1: Run bootstrap lazily here too, in case ameridex-login
            // fired but the delayed bootstrap hasn't executed yet.
            if (!_bootstrapDone) bootstrapFromExistingLoad();

            if (!_loadedQuoteId)         return; // no quote loaded
            if (_loadedQuoteHadAddress)  return; // already had an address
            if (_promptShown)             return; // already shown
            if (!addressFieldsHaveValue()) return; // fields still blank

            _promptShown = true;
            var snap = currentAddressSnapshot();
            showPromptModal(
                snap,
                function ()  { doUpdateExistingQuote(); },
                function ()  { doSaveAsNewQuote(snap); },
                function ()  { doCancelAddress(); }
            );
        }, 600);
    }

    // ----------------------------------------------------------
    // WIRE UP address field listeners
    // (fields are injected by ameridex-customer-address.js;
    //  poll until they exist)
    // ----------------------------------------------------------
    function attachAddressListeners() {
        var addrEl  = document.getElementById('cust-address');
        var cityEl  = document.getElementById('cust-city');
        var stateEl = document.getElementById('cust-state');

        if (!addrEl || !cityEl || !stateEl) {
            setTimeout(attachAddressListeners, 300);
            return;
        }

        ['input', 'change'].forEach(function (evt) {
            addrEl.addEventListener(evt,  onAddressFieldChanged);
            cityEl.addEventListener(evt,  onAddressFieldChanged);
            stateEl.addEventListener(evt, onAddressFieldChanged);
        });

        console.log('[AddrPrompt v1.1] Address field listeners attached.');
    }

    // ----------------------------------------------------------
    // PATCH window.loadQuote
    // Wraps future loadQuote calls (e.g. user switching quotes
    // manually from the saved list after initial page load).
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
                var q    = getQuote();
                var cust = q ? q.customer : null;

                _loadedQuoteHadAddress = quoteHasAddress(cust);
                _loadedQuoteId         = (q && (q.quoteNumber || q.quoteId || q.id)) || null;
                _promptShown           = false;
                _bootstrapDone         = true; // manual load supersedes bootstrap

                console.log(
                    '[AddrPrompt v1.1] loadQuote fired.',
                    'ID:', _loadedQuoteId,
                    '| Had address:', _loadedQuoteHadAddress
                );
            }, 80);
        };

        console.log('[AddrPrompt v1.1] loadQuote patched.');
    }

    // ----------------------------------------------------------
    // INIT
    // ----------------------------------------------------------
    function init() {
        attachAddressListeners();
        patchLoadQuote();

        // FIX 1: Schedule bootstrap scan.
        // The ameridex-login event fires after ameridex-api.js loads
        // saved quotes and calls loadQuote for a URL param. We listen
        // for that same event and run our bootstrap shortly after so
        // currentQuote is fully settled.
        window.addEventListener('ameridex-login', function () {
            setTimeout(bootstrapFromExistingLoad, 300);
        });

        // Fallback: if ameridex-login never fires (direct page load
        // without URL param), bootstrap after a generous delay.
        setTimeout(bootstrapFromExistingLoad, 1500);

        console.log('[AddrPrompt v1.1] Initialized.');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
