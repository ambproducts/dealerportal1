// ============================================================
// AmeriDex Dealer Portal - Inline Item Picker v1.0
// Date: 2026-03-05
// ============================================================
// PURPOSE:
//   Replace the two-step flow of:
//     1. Click "+ Add Line Item"  -->  row appended with default type
//     2. User scrolls down and changes the type via the AmeriDex board
//
//   With a single inline experience:
//     1. Click "+ Add Line Item"  -->  row appears with a <select>
//        dropdown ALREADY open in the product cell
//     2. User picks the product directly in the row. Done.
//
// HOW IT WORKS:
//   - Wraps window.addItem() to call injectPickerIntoLastRow()
//     immediately after the native function appends the new item.
//   - Also installs a post-render hook (same pattern as
//     ameridex-overrides.js v1.7) so pickers survive any
//     subsequent renderDesktop() / renderMobile() call.
//   - Mobile cards (#mobile-items-container) get the same treatment.
//   - Fully edit-mode aware: pickers are disabled when the
//     quote-editor has locked the form, re-enabled on unlock.
//
// DEPENDENCIES (must be loaded before this file):
//   - dealer-portal.html inline script (defines PRODUCTS, addItem,
//     renderDesktop, renderMobile, currentQuote, updateTotals,
//     updateTotalAndFasteners)
//   - ameridex-patches.js  (defines escapeHTML)
//   - ameridex-quote-editor.js  (defines _editMode lock mechanism)
//
// LOAD ORDER (managed by EXTRA_SCRIPTS in ameridex-patches.js):
//   ameridex-addrow-fix.js  -->  ameridex-inline-item-picker.js  --> ...
// ============================================================

(function () {
    'use strict';

    // ----------------------------------------------------------
    // 1. INJECT CSS
    // ----------------------------------------------------------
    var style = document.createElement('style');
    style.id  = 'aip-styles';
    style.textContent = [
        '/* ---- Inline Item Picker ---- */',
        '.aip-select {',
        '  width: 100%;',
        '  padding: 5px 8px;',
        '  border: 2px solid #6366f1;',
        '  border-radius: 6px;',
        '  background: #1e2540;',
        '  color: #e2e8f0;',
        '  font-size: 0.85rem;',
        '  font-weight: 600;',
        '  cursor: pointer;',
        '  outline: none;',
        '  transition: border-color 0.15s, box-shadow 0.15s;',
        '  box-sizing: border-box;',
        '}',
        '.aip-select:focus {',
        '  border-color: #818cf8;',
        '  box-shadow: 0 0 0 3px rgba(99,102,241,0.25);',
        '}',
        '.aip-select:disabled {',
        '  opacity: 0.45;',
        '  cursor: not-allowed;',
        '}',
        '/* Mobile picker wrapper */',
        '.aip-mobile-row {',
        '  display: flex;',
        '  align-items: center;',
        '  gap: 0.5rem;',
        '  margin-bottom: 0.4rem;',
        '}',
        '.aip-mobile-label {',
        '  font-size: 0.72rem;',
        '  font-weight: 700;',
        '  color: #94a3b8;',
        '  text-transform: uppercase;',
        '  letter-spacing: 0.04em;',
        '  white-space: nowrap;',
        '}'
    ].join('\n');
    if (!document.getElementById('aip-styles')) {
        document.head.appendChild(style);
    }


    // ----------------------------------------------------------
    // 2. HELPERS
    // ----------------------------------------------------------

    /**
     * Returns true when the quote-editor has locked the form.
     * We read the module-private _editMode flag exposed via the
     * banner button's text as a fallback if the variable is not
     * accessible from outside the IIFE.
     */
    function isFormLocked() {
        // quote-editor.js exposes lock state through data-qe-locked
        // on form elements. If any locked element exists, form is locked.
        return document.querySelector('[data-qe-locked]') !== null;
    }

    /**
     * Build a <select> element populated with every entry in PRODUCTS.
     * selectedType: the currently selected product type key.
     * onChangeCallback: function(newTypeKey) called when user picks.
     */
    function buildSelect(selectedType, onChangeCallback) {
        var products = (typeof PRODUCTS !== 'undefined') ? PRODUCTS : {};
        var keys     = Object.keys(products);

        var sel = document.createElement('select');
        sel.className = 'aip-select';
        sel.disabled  = isFormLocked();

        keys.forEach(function (key) {
            var opt       = document.createElement('option');
            opt.value     = key;
            opt.textContent = products[key].name || key;
            if (key === selectedType) opt.selected = true;
            sel.appendChild(opt);
        });

        sel.addEventListener('change', function () {
            onChangeCallback(sel.value);
        });

        return sel;
    }

    /**
     * Trigger a full re-render + totals update cycle.
     */
    function rerender() {
        if (typeof renderDesktop           === 'function') renderDesktop();
        if (typeof renderMobile            === 'function') renderMobile();
        if (typeof updateTotals            === 'function') updateTotals();
        if (typeof updateTotalAndFasteners === 'function') updateTotalAndFasteners();
    }


    // ----------------------------------------------------------
    // 3. DESKTOP: INJECT PICKER INTO A SPECIFIC ROW
    // ----------------------------------------------------------

    /**
     * Replace the product-name text in row[idx] with an inline
     * <select> picker. Idempotent: skips if picker already present.
     */
    function injectPickerDesktop(idx) {
        if (typeof currentQuote === 'undefined' || !currentQuote.lineItems) return;
        var item = currentQuote.lineItems[idx];
        if (!item) return;

        var tbody = document.querySelector('#line-items tbody');
        if (!tbody) return;

        var rows = tbody.querySelectorAll('tr');
        var row  = rows[idx];
        if (!row) return;

        // Idempotency guard
        if (row.querySelector('.aip-select')) return;

        var cells     = row.querySelectorAll('td');
        var firstCell = cells[0];
        if (!firstCell) return;

        var sel = buildSelect(item.type, function (newType) {
            currentQuote.lineItems[idx].type        = newType;
            currentQuote.lineItems[idx].color       = '';
            currentQuote.lineItems[idx].length      = '';
            currentQuote.lineItems[idx].customLength = '';
            currentQuote.lineItems[idx].customDesc  = '';
            // Full re-render rebuilds the row with correct length/color
            // controls for the newly selected product type
            rerender();
        });

        // Preserve any override info that might already be in this cell
        var overrideInfoRow = firstCell.querySelector('.override-info-row');

        // Clear cell and insert picker first
        firstCell.innerHTML = '';
        firstCell.appendChild(sel);

        // Re-attach override info below picker if it existed
        if (overrideInfoRow) {
            firstCell.appendChild(overrideInfoRow);
        }
    }

    /**
     * Inject a picker into the LAST row only.
     * Called immediately after addItem() appends a new row.
     */
    function injectPickerIntoLastRow() {
        if (typeof currentQuote === 'undefined' || !currentQuote.lineItems) return;
        var idx = currentQuote.lineItems.length - 1;
        if (idx < 0) return;

        // Give renderDesktop() a tick to paint the row before we inject
        setTimeout(function () {
            injectPickerDesktop(idx);

            // Auto-open the dropdown so the user does not need an
            // extra click (supported in Chrome/Edge/Safari desktop)
            var tbody = document.querySelector('#line-items tbody');
            if (tbody) {
                var rows = tbody.querySelectorAll('tr');
                var row  = rows[idx];
                if (row) {
                    var sel = row.querySelector('.aip-select');
                    if (sel && !isFormLocked()) {
                        sel.focus();
                        // Simulate a mousedown to pop the native dropdown
                        try {
                            var evt = new MouseEvent('mousedown', { bubbles: true });
                            sel.dispatchEvent(evt);
                        } catch (e) { /* ignore in IE */ }
                    }
                }
            }
        }, 30);
    }


    // ----------------------------------------------------------
    // 4. MOBILE: INJECT PICKER INTO A SPECIFIC CARD
    // ----------------------------------------------------------

    /**
     * Prepend an inline product picker row at the top of a
     * mobile item card for lineItems[idx].
     */
    function injectPickerMobile(idx) {
        if (typeof currentQuote === 'undefined' || !currentQuote.lineItems) return;
        var item = currentQuote.lineItems[idx];
        if (!item) return;

        var container = document.getElementById('mobile-items-container');
        if (!container) return;

        var cards = container.children;
        var card  = cards[idx];
        if (!card) return;

        // Idempotency guard
        if (card.querySelector('.aip-select')) return;

        var wrapper   = document.createElement('div');
        wrapper.className = 'aip-mobile-row';

        var label       = document.createElement('span');
        label.className = 'aip-mobile-label';
        label.textContent = 'Product:';

        var sel = buildSelect(item.type, function (newType) {
            currentQuote.lineItems[idx].type         = newType;
            currentQuote.lineItems[idx].color        = '';
            currentQuote.lineItems[idx].length       = '';
            currentQuote.lineItems[idx].customLength = '';
            currentQuote.lineItems[idx].customDesc   = '';
            rerender();
        });

        wrapper.appendChild(label);
        wrapper.appendChild(sel);

        // Insert at the very top of the card so it is the first
        // thing the user sees without scrolling
        card.insertBefore(wrapper, card.firstChild);
    }


    // ----------------------------------------------------------
    // 5. POST-RENDER HOOK
    // Mirrors the same pattern used in ameridex-overrides.js v1.7.
    // After every renderDesktop/renderMobile call, scan ALL rows
    // and inject pickers for any row that is missing one.
    // This keeps pickers alive after the form re-renders.
    // ----------------------------------------------------------
    var _hooksInstalled = false;

    function installPostRenderHooks() {
        if (_hooksInstalled) return;

        var _prevRenderDesktop = window.renderDesktop;
        window.renderDesktop = function () {
            if (typeof _prevRenderDesktop === 'function') _prevRenderDesktop();
            injectAllPickersDesktop();
        };

        var _prevRenderMobile = window.renderMobile;
        window.renderMobile = function () {
            if (typeof _prevRenderMobile === 'function') _prevRenderMobile();
            injectAllPickersMobile();
        };

        _hooksInstalled = true;
        console.log('[InlineItemPicker v1.0] Post-render hooks installed.');
    }

    function injectAllPickersDesktop() {
        if (typeof currentQuote === 'undefined' || !currentQuote.lineItems) return;
        currentQuote.lineItems.forEach(function (item, idx) {
            injectPickerDesktop(idx);
        });
        syncPickerLockState();
    }

    function injectAllPickersMobile() {
        if (typeof currentQuote === 'undefined' || !currentQuote.lineItems) return;
        currentQuote.lineItems.forEach(function (item, idx) {
            injectPickerMobile(idx);
        });
        syncPickerLockState();
    }


    // ----------------------------------------------------------
    // 6. LOCK STATE SYNC
    // When quote-editor locks or unlocks the form, keep the
    // pickers in sync. We observe attribute mutations on
    // #order-form (quote-editor sets data-qe-locked on its
    // children), and also patch lockForm/unlockForm if accessible.
    // ----------------------------------------------------------

    function syncPickerLockState() {
        var locked = isFormLocked();
        document.querySelectorAll('.aip-select').forEach(function (sel) {
            sel.disabled = locked;
        });
    }

    // MutationObserver: watch for data-qe-locked attributes appearing
    // or disappearing anywhere under #order-form
    function observeLockChanges() {
        var form = document.getElementById('order-form');
        if (!form) {
            setTimeout(observeLockChanges, 400);
            return;
        }
        var observer = new MutationObserver(function (mutations) {
            var relevant = mutations.some(function (m) {
                return m.attributeName === 'data-qe-locked' ||
                       m.attributeName === 'disabled';
            });
            if (relevant) syncPickerLockState();
        });
        observer.observe(form, {
            attributes: true,
            subtree: true,
            attributeFilter: ['data-qe-locked', 'disabled']
        });
        console.log('[InlineItemPicker v1.0] Lock-state observer attached.');
    }


    // ----------------------------------------------------------
    // 7. WRAP window.addItem()
    // ----------------------------------------------------------
    function patchAddItem() {
        if (typeof window.addItem !== 'function') {
            setTimeout(patchAddItem, 150);
            return;
        }
        var _origAddItem = window.addItem;
        window.addItem = function () {
            _origAddItem.apply(this, arguments);
            injectPickerIntoLastRow();
        };
        console.log('[InlineItemPicker v1.0] addItem() patched.');
    }


    // ----------------------------------------------------------
    // 8. WRAP renderDesktop / renderMobile
    // We must wait until both functions exist (they are defined
    // in the inline script of dealer-portal.html and may not yet
    // be present when this file first executes).
    // ----------------------------------------------------------
    function waitForRenderFunctions() {
        if (typeof window.renderDesktop === 'function' &&
            typeof window.renderMobile  === 'function') {
            installPostRenderHooks();
        } else {
            setTimeout(waitForRenderFunctions, 150);
        }
    }


    // ----------------------------------------------------------
    // 9. INIT
    // ----------------------------------------------------------
    function init() {
        patchAddItem();
        waitForRenderFunctions();
        observeLockChanges();
        console.log('[InlineItemPicker v1.0] Initialized.');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
