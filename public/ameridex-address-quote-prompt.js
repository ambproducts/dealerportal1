// ============================================================
// AmeriDex Dealer Portal - Address-on-Existing-Quote Prompt v1.0
// Date: 2026-03-02
// ============================================================
// PURPOSE:
//   When a user retrieves (loads) an existing quote that has NO
//   address previously saved, and then types/selects an address
//   (any of: address, city, or state), a modal dialog appears
//   asking whether to:
//     A) Update the existing quote with the new address, OR
//     B) Save the address as part of a brand-new separate quote
//        (duplicates all current line items + customer info,
//         appends the address, and saves as a new draft).
//
// LOAD ORDER:
//   Must load AFTER ameridex-customer-address.js (which injects
//   the address/city/state fields and patches loadQuote).
//   Add it as the next <script> tag or entry in script-loader.js.
//
// DEPENDENCIES:
//   - #cust-address, #cust-city, #cust-state DOM fields
//     (injected by ameridex-customer-address.js)
//   - window.loadQuote  (patched by ameridex-customer-address.js)
//   - window.saveCurrentQuote
//   - window.currentQuote / global currentQuote (let-declared)
//   - window.generateQuoteNumber (optional, for new quote numbering)
// ============================================================

(function () {
    'use strict';

    // ----------------------------------------------------------
    // SAFE GLOBAL ACCESSORS
    // (mirrors the helpers in ameridex-customer-address.js)
    // ----------------------------------------------------------
    function getQuote() {
        try { return currentQuote; } catch (e) {}
        return window.currentQuote || null;
    }
    function setQuote(q) {
        // Attempt to write back to the let-declared global by
        // calling the portal's own setter if one exists, or by
        // patching through window for var-declared variants.
        try {
            // If the portal exposes a setter use it.
            if (typeof window.setCurrentQuote === 'function') {
                window.setCurrentQuote(q);
                return;
            }
        } catch (e) {}
        window.currentQuote = q;
    }

    // ----------------------------------------------------------
    // STATE: track whether the currently-loaded quote had an
    // address when it was first retrieved from storage/server.
    // ----------------------------------------------------------
    var _loadedQuoteHadAddress = false;   // true = address existed at load time
    var _loadedQuoteId = null;             // quoteId of the retrieved quote
    var _promptPending = false;            // debounce: only show once per edit session
    var _promptShown = false;              // shown once per load cycle; reset on new load

    // ----------------------------------------------------------
    // HELPERS: check address fields
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

    // ----------------------------------------------------------
    // MODAL HTML + CSS
    // ----------------------------------------------------------
    var MODAL_ID = 'addr-quote-prompt-modal';

    function injectModalStyles() {
        if (document.getElementById('addr-quote-prompt-styles')) return;
        var style = document.createElement('style');
        style.id = 'addr-quote-prompt-styles';
        style.textContent = [
            '#' + MODAL_ID + '-overlay {',
            '  position: fixed; inset: 0;',
            '  background: rgba(0,0,0,0.55);',
            '  z-index: 9999;',
            '  display: flex; align-items: center; justify-content: center;',
            '}',
            '#' + MODAL_ID + ' {',
            '  background: #1e2130;',
            '  border: 1px solid #2d3250;',
            '  border-radius: 10px;',
            '  padding: 28px 32px 24px;',
            '  max-width: 440px; width: 92%;',
            '  box-shadow: 0 8px 40px rgba(0,0,0,0.6);',
            '  color: #e2e8f0;',
            '  font-family: inherit;',
            '}',
            '#' + MODAL_ID + ' h3 {',
            '  margin: 0 0 8px;',
            '  font-size: 1.05rem;',
            '  font-weight: 700;',
            '  color: #f8fafc;',
            '}',
            '#' + MODAL_ID + ' p {',
            '  margin: 0 0 20px;',
            '  font-size: 0.88rem;',
            '  color: #94a3b8;',
            '  line-height: 1.5;',
            '}',
            '#' + MODAL_ID + ' .addr-prompt-address-preview {',
            '  background: #131623;',
            '  border: 1px solid #2d3250;',
            '  border-radius: 6px;',
            '  padding: 10px 14px;',
            '  margin-bottom: 20px;',
            '  font-size: 0.84rem;',
            '  color: #cbd5e1;',
            '}',
            '#' + MODAL_ID + ' .addr-prompt-btns {',
            '  display: flex; gap: 10px; flex-wrap: wrap;',
            '}',
            '#' + MODAL_ID + ' .addr-prompt-btn {',
            '  flex: 1; min-width: 120px;',
            '  padding: 10px 14px;',
            '  border-radius: 6px;',
            '  border: none; cursor: pointer;',
            '  font-size: 0.88rem; font-weight: 600;',
            '  transition: opacity .15s;',
            '}',
            '#' + MODAL_ID + ' .addr-prompt-btn:hover { opacity: .85; }',
            '#' + MODAL_ID + ' .addr-prompt-btn-update {',
            '  background: #3b82f6; color: #fff;',
            '}',
            '#' + MODAL_ID + ' .addr-prompt-btn-new {',
            '  background: #10b981; color: #fff;',
            '}',
            '#' + MODAL_ID + ' .addr-prompt-btn-cancel {',
            '  background: transparent;',
            '  border: 1px solid #4b5563 !important;',
            '  color: #94a3b8;',
            '  flex: 0 0 auto;',
            '}'
        ].join('\n');
        document.head.appendChild(style);
    }

    function buildAddressPreviewHTML(snap) {
        var parts = [];
        if (snap.address) parts.push(snap.address);
        var cityState = [snap.city, snap.state].filter(Boolean).join(', ');
        if (cityState) parts.push(cityState);
        return parts.join('<br>') || '(no address entered)';
    }

    function showPromptModal(snap, onUpdate, onNewQuote, onCancel) {
        // Prevent duplicate overlays
        if (document.getElementById(MODAL_ID + '-overlay')) return;

        injectModalStyles();

        var overlay = document.createElement('div');
        overlay.id = MODAL_ID + '-overlay';

        var quoteId = _loadedQuoteId || 'this quote';

        overlay.innerHTML =
            '<div id="' + MODAL_ID + '">' +
            '  <h3>Address Added to Existing Quote</h3>' +
            '  <p>You retrieved quote <strong>' + escapeHTML(quoteId) + '</strong> which had no address on file. You have entered:</p>' +
            '  <div class="addr-prompt-address-preview">' + buildAddressPreviewHTML(snap) + '</div>' +
            '  <p>Would you like to update the existing quote with this address, or save it as a new separate quote?</p>' +
            '  <div class="addr-prompt-btns">' +
            '    <button class="addr-prompt-btn addr-prompt-btn-update" id="addr-prompt-update">Update Existing Quote</button>' +
            '    <button class="addr-prompt-btn addr-prompt-btn-new" id="addr-prompt-new">Save as New Quote</button>' +
            '    <button class="addr-prompt-btn addr-prompt-btn-cancel" id="addr-prompt-cancel">Cancel</button>' +
            '  </div>' +
            '</div>';

        document.body.appendChild(overlay);

        document.getElementById('addr-prompt-update').addEventListener('click', function () {
            closeModal();
            onUpdate();
        });
        document.getElementById('addr-prompt-new').addEventListener('click', function () {
            closeModal();
            onNewQuote();
        });
        document.getElementById('addr-prompt-cancel').addEventListener('click', function () {
            closeModal();
            onCancel();
        });

        // Click-outside-to-cancel
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) {
                closeModal();
                onCancel();
            }
        });
    }

    function closeModal() {
        var overlay = document.getElementById(MODAL_ID + '-overlay');
        if (overlay) overlay.remove();
    }

    function escapeHTML(str) {
        var d = document.createElement('div');
        d.textContent = String(str);
        return d.innerHTML;
    }

    // ----------------------------------------------------------
    // ACTION: Update existing quote (just save)
    // ----------------------------------------------------------
    function doUpdateExistingQuote() {
        if (typeof window.saveCurrentQuote === 'function') {
            window.saveCurrentQuote();
            showToast('Address saved to existing quote.');
        } else {
            console.warn('[AddrPrompt] saveCurrentQuote not available.');
        }
        // Reset prompt guard so it won't re-fire until next load
        _promptShown = true;
    }

    // ----------------------------------------------------------
    // ACTION: Save as new quote
    // Deep-clones currentQuote, strips the old quoteId/number so
    // the portal's save logic generates a fresh one, injects the
    // new address, then calls saveCurrentQuote().
    // ----------------------------------------------------------
    function doSaveAsNewQuote(snap) {
        var q = getQuote();
        if (!q) {
            console.warn('[AddrPrompt] No currentQuote found for new-quote action.');
            return;
        }

        // Deep clone via JSON round-trip
        var newQ;
        try {
            newQ = JSON.parse(JSON.stringify(q));
        } catch (e) {
            console.error('[AddrPrompt] Clone failed:', e);
            return;
        }

        // Clear identity fields so the portal assigns a fresh quote number
        newQ.id        = undefined;
        newQ._id       = undefined;
        newQ.quoteId   = undefined;
        newQ.quoteNumber = undefined;
        newQ.status    = 'draft';
        newQ.createdAt = undefined;
        newQ.updatedAt = undefined;

        // Apply the new address to the clone
        if (newQ.customer) {
            newQ.customer.address = snap.address;
            newQ.customer.city    = snap.city;
            newQ.customer.state   = snap.state;
        }

        // Write the clone back as currentQuote
        setQuote(newQ);

        // Sync address DOM fields (they already have the values the user typed)
        // No change needed; saveCurrentQuote reads them from the DOM.

        if (typeof window.saveCurrentQuote === 'function') {
            window.saveCurrentQuote();
            showToast('Address saved as a new separate quote.');
        } else {
            console.warn('[AddrPrompt] saveCurrentQuote not available.');
        }

        _promptShown = true;
    }

    // ----------------------------------------------------------
    // ACTION: Cancel - clear the address fields the user entered
    // so the quote stays pristine.
    // ----------------------------------------------------------
    function doCancelAddress() {
        var addrEl  = document.getElementById('cust-address');
        var cityEl  = document.getElementById('cust-city');
        var stateEl = document.getElementById('cust-state');
        if (addrEl)  addrEl.value  = '';
        if (cityEl)  cityEl.value  = '';
        if (stateEl) stateEl.value = '';

        var cust = getQuote() ? getQuote().customer : null;
        if (cust) {
            cust.address = '';
            cust.city    = '';
            cust.state   = '';
        }

        _promptPending = false;
        // Do NOT set _promptShown = true so user can try again if they want.
    }

    // ----------------------------------------------------------
    // TOAST NOTIFICATION
    // ----------------------------------------------------------
    function showToast(msg) {
        var toast = document.createElement('div');
        toast.textContent = msg;
        toast.style.cssText = [
            'position:fixed',
            'bottom:24px',
            'right:24px',
            'background:#10b981',
            'color:#fff',
            'padding:12px 20px',
            'border-radius:8px',
            'font-size:0.88rem',
            'font-weight:600',
            'z-index:10000',
            'box-shadow:0 4px 20px rgba(0,0,0,0.4)',
            'transition:opacity .3s'
        ].join(';');
        document.body.appendChild(toast);
        setTimeout(function () {
            toast.style.opacity = '0';
            setTimeout(function () { toast.remove(); }, 350);
        }, 3500);
    }

    // ----------------------------------------------------------
    // TRIGGER: debounced handler for address field changes
    // Fires the prompt when ALL conditions are met:
    //   1. A quote was loaded (not a fresh/blank form)
    //   2. That loaded quote had NO address at load time
    //   3. The user has now entered an address value
    //   4. Prompt has not already been shown this session
    // ----------------------------------------------------------
    var _debounceTimer = null;

    function onAddressFieldChanged() {
        clearTimeout(_debounceTimer);
        _debounceTimer = setTimeout(function () {
            // Only act if a quote was loaded with no prior address
            if (!_loadedQuoteId) return;
            if (_loadedQuoteHadAddress) return;
            if (_promptShown) return;
            if (!addressFieldsHaveValue()) return;

            _promptShown = true; // Prevent re-trigger while modal is open

            var snap = currentAddressSnapshot();
            showPromptModal(
                snap,
                function () { doUpdateExistingQuote(); },
                function () { doSaveAsNewQuote(snap); },
                function () { doCancelAddress(); _promptShown = false; }
            );
        }, 600); // 600 ms debounce - wait for user to finish typing
    }

    // ----------------------------------------------------------
    // WIRE UP: attach change listeners to address fields once
    // the DOM is ready (fields may be injected by
    // ameridex-customer-address.js, so we poll briefly).
    // ----------------------------------------------------------
    function attachAddressListeners() {
        var addrEl  = document.getElementById('cust-address');
        var cityEl  = document.getElementById('cust-city');
        var stateEl = document.getElementById('cust-state');

        if (!addrEl || !cityEl || !stateEl) {
            // Fields not yet injected; retry once after a short delay
            setTimeout(attachAddressListeners, 300);
            return;
        }

        ['input', 'change'].forEach(function (evt) {
            addrEl.addEventListener(evt,  onAddressFieldChanged);
            cityEl.addEventListener(evt,  onAddressFieldChanged);
            stateEl.addEventListener(evt, onAddressFieldChanged);
        });

        console.log('[AddrPrompt] Address field listeners attached.');
    }

    // ----------------------------------------------------------
    // PATCH: window.loadQuote
    // After any quote load, record whether the loaded quote had
    // an address. Reset prompt state for the new load session.
    // ----------------------------------------------------------
    function patchLoadQuote() {
        var _origLoad = window.loadQuote;
        if (typeof _origLoad !== 'function') {
            // loadQuote not yet defined; retry
            setTimeout(patchLoadQuote, 200);
            return;
        }

        window.loadQuote = function (idx) {
            // Call the (already-patched) loadQuote chain
            _origLoad.apply(this, arguments);

            // After load, inspect the quote that is now current
            // Use a brief timeout to let all patches in the chain settle
            setTimeout(function () {
                var q    = getQuote();
                var cust = q ? q.customer : null;

                var hadAddr = !!(
                    cust &&
                    (
                        (cust.address && cust.address.trim() !== '') ||
                        (cust.city    && cust.city.trim()    !== '') ||
                        (cust.state   && cust.state.trim()   !== '')
                    )
                );

                _loadedQuoteHadAddress = hadAddr;
                _loadedQuoteId         = (q && (q.quoteNumber || q.quoteId || q.id)) || null;
                _promptShown           = false;   // reset for this load session
                _promptPending         = false;

                console.log(
                    '[AddrPrompt] Quote loaded. ID:', _loadedQuoteId,
                    '| Had address:', _loadedQuoteHadAddress
                );
            }, 80);
        };

        console.log('[AddrPrompt] loadQuote patched.');
    }

    // ----------------------------------------------------------
    // INIT
    // ----------------------------------------------------------
    function init() {
        attachAddressListeners();
        patchLoadQuote();
        console.log('[AddrPrompt] Address-on-existing-quote prompt initialized v1.0.');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
