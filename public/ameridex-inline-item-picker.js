// ============================================================
// AmeriDex Dealer Portal - Inline Item Picker v1.3
// Date: 2026-03-05
// ============================================================
// CHANGES IN v1.3:
//   - BUGFIX: injectPickerDesktop no longer clears firstCell.innerHTML.
//     Instead it removes only the native <select> and prepends the
//     custom .aip-picker before the remaining content (help text,
//     price display, custom-item fields).  This fixes the $0.00
//     pricing bug caused by destroying the price DOM nodes.
//
// CHANGES IN v1.2:
//   - Replaced native <select> with a fully custom dropdown widget
//     (.aip-picker) so the closed state can wrap freely and never
//     clips the selected product label, regardless of browser.
//   - Closed state: a <button> that wraps to as many lines as needed.
//   - Open state: a positioned <ul> listbox with category group
//     headers sourced from PRODUCT_CONFIG.categories.
//   - On new row add: picker is focused only (one click to open),
//     no auto-open simulation.
//   - Keyboard: Enter/Space opens, ArrowDown/Up navigates,
//     Enter selects highlighted item, Escape closes.
//   - Lock-state aware: disabled class applied when form is locked.
//   - Mobile cards get the same custom picker.
//   - All post-render hooks, rerender cycle, and MutationObserver
//     from v1.1 are preserved unchanged.
// ============================================================

(function () {
    'use strict';

    // ----------------------------------------------------------
    // 1. CSS
    // ----------------------------------------------------------
    var style = document.createElement('style');
    style.id  = 'aip-styles';
    style.textContent = `
/* ---- AmeriDex Inline Item Picker v1.3 ---- */

.aip-picker {
  position: relative;
  width: 100%;
  box-sizing: border-box;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.aip-trigger {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 6px;
  width: 100%;
  padding: 7px 10px;
  border: 2px solid #6366f1;
  border-radius: 6px;
  background: #1e2540;
  color: #e2e8f0;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  text-align: left;
  box-sizing: border-box;
  transition: border-color 0.15s, box-shadow 0.15s;
  white-space: normal;
  overflow: visible;
  word-break: break-word;
  line-height: 1.35;
}
.aip-trigger:focus {
  outline: none;
  border-color: #818cf8;
  box-shadow: 0 0 0 3px rgba(99,102,241,0.25);
}
.aip-trigger:hover:not(:disabled) {
  border-color: #818cf8;
}
.aip-trigger:disabled,
.aip-picker.aip-disabled .aip-trigger {
  opacity: 0.45;
  cursor: not-allowed;
}

.aip-trigger-label {
  flex: 1;
  white-space: normal;
  word-break: break-word;
}

.aip-trigger-chevron {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  margin-top: 2px;
  fill: none;
  stroke: #94a3b8;
  stroke-width: 2.5;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: transform 0.15s;
}
.aip-picker.aip-open .aip-trigger-chevron {
  transform: rotate(180deg);
}

.aip-listbox {
  display: none;
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 9999;
  background: #1e2540;
  border: 2px solid #6366f1;
  border-radius: 8px;
  box-shadow: 0 12px 32px rgba(0,0,0,0.45);
  max-height: 320px;
  overflow-y: auto;
  list-style: none;
  margin: 0;
  padding: 4px 0;
  box-sizing: border-box;
}
.aip-picker.aip-open .aip-listbox {
  display: block;
}

.aip-group-header {
  padding: 6px 12px 3px;
  font-size: 0.7rem;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  pointer-events: none;
  user-select: none;
}

.aip-option {
  padding: 8px 14px;
  font-size: 0.85rem;
  font-weight: 500;
  color: #e2e8f0;
  cursor: pointer;
  white-space: normal;
  word-break: break-word;
  line-height: 1.35;
  transition: background 0.1s, color 0.1s;
}
.aip-option:hover,
.aip-option.aip-highlighted {
  background: #2d3a5e;
  color: #ffffff;
}
.aip-option.aip-selected {
  color: #818cf8;
  font-weight: 700;
}
.aip-option.aip-selected.aip-highlighted {
  background: #2d3a5e;
  color: #a5b4fc;
}

.aip-group-divider {
  height: 1px;
  background: #2d3a5e;
  margin: 4px 0;
}

.aip-mobile-row {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  margin-bottom: 0.4rem;
}
.aip-mobile-label {
  font-size: 0.72rem;
  font-weight: 700;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  white-space: nowrap;
  padding-top: 0.55rem;
}
`;
    if (!document.getElementById('aip-styles')) {
        document.head.appendChild(style);
    }


    // ----------------------------------------------------------
    // 2. HELPERS
    // ----------------------------------------------------------

    function isFormLocked() {
        return document.querySelector('[data-qe-locked]') !== null;
    }

    function rerender() {
        if (typeof renderDesktop           === 'function') renderDesktop();
        if (typeof renderMobile            === 'function') renderMobile();
        if (typeof updateTotals            === 'function') updateTotals();
        if (typeof updateTotalAndFasteners === 'function') updateTotalAndFasteners();
    }

    function getProductName(typeKey) {
        var config = (typeof PRODUCT_CONFIG !== 'undefined') ? PRODUCT_CONFIG : null;
        if (config && config.categories) {
            var found = null;
            Object.values(config.categories).forEach(function (cat) {
                if (cat.products && cat.products[typeKey]) {
                    found = cat.products[typeKey].name || typeKey;
                }
            });
            if (found) return found;
        }
        var flat = (typeof PRODUCTS !== 'undefined') ? PRODUCTS : {};
        return (flat[typeKey] && flat[typeKey].name) ? flat[typeKey].name : typeKey;
    }

    function closeAllPickers(except) {
        document.querySelectorAll('.aip-picker.aip-open').forEach(function (p) {
            if (p !== except) closePicker(p);
        });
    }

    function openPicker(picker) {
        if (picker.classList.contains('aip-disabled')) return;
        closeAllPickers(picker);
        picker.classList.add('aip-open');
        var listbox = picker.querySelector('.aip-listbox');
        if (listbox) listbox.scrollTop = 0;
    }

    function closePicker(picker) {
        picker.classList.remove('aip-open');
    }

    function togglePicker(picker) {
        if (picker.classList.contains('aip-open')) {
            closePicker(picker);
        } else {
            openPicker(picker);
        }
    }


    // ----------------------------------------------------------
    // 3. BUILD CUSTOM PICKER WIDGET
    // ----------------------------------------------------------

    function buildPicker(selectedType, onSelect) {
        var config      = (typeof PRODUCT_CONFIG !== 'undefined') ? PRODUCT_CONFIG : null;
        var flatProducts = (typeof PRODUCTS !== 'undefined') ? PRODUCTS : {};
        var locked      = isFormLocked();

        var picker = document.createElement('div');
        picker.className = 'aip-picker';
        picker.setAttribute('data-aip-value', selectedType);
        if (locked) picker.classList.add('aip-disabled');

        var trigger = document.createElement('button');
        trigger.type      = 'button';
        trigger.className = 'aip-trigger';
        trigger.disabled  = locked;
        trigger.setAttribute('aria-haspopup', 'listbox');
        trigger.setAttribute('aria-expanded', 'false');

        var labelSpan = document.createElement('span');
        labelSpan.className   = 'aip-trigger-label';
        labelSpan.textContent = getProductName(selectedType);

        var chevronSVG = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        chevronSVG.setAttribute('viewBox', '0 0 16 16');
        chevronSVG.setAttribute('aria-hidden', 'true');
        chevronSVG.classList.add('aip-trigger-chevron');
        var chevronPath = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        chevronPath.setAttribute('points', '2,5 8,11 14,5');
        chevronSVG.appendChild(chevronPath);

        trigger.appendChild(labelSpan);
        trigger.appendChild(chevronSVG);

        var listbox = document.createElement('ul');
        listbox.className = 'aip-listbox';
        listbox.setAttribute('role', 'listbox');
        listbox.setAttribute('aria-label', 'Select product');

        var allOptions = [];

        function buildFromConfig() {
            var cats = Object.entries(config.categories);
            cats.forEach(function (catEntry, catIdx) {
                var category = catEntry[1];

                if (catIdx > 0) {
                    var div = document.createElement('li');
                    div.className = 'aip-group-divider';
                    div.setAttribute('role', 'presentation');
                    listbox.appendChild(div);
                }

                var header = document.createElement('li');
                header.className   = 'aip-group-header';
                header.textContent = category.label || catEntry[0];
                header.setAttribute('role', 'presentation');
                listbox.appendChild(header);

                Object.entries(category.products).forEach(function (prodEntry) {
                    var prodKey  = prodEntry[0];
                    var prodData = prodEntry[1];
                    var li       = document.createElement('li');
                    li.className   = 'aip-option';
                    li.textContent = prodData.name || prodKey;
                    li.setAttribute('role', 'option');
                    li.setAttribute('data-aip-key', prodKey);
                    li.setAttribute('aria-selected', prodKey === selectedType ? 'true' : 'false');
                    if (prodKey === selectedType) li.classList.add('aip-selected');
                    allOptions.push(li);
                    listbox.appendChild(li);
                });
            });
        }

        function buildFromFlat() {
            Object.keys(flatProducts).forEach(function (key) {
                var li = document.createElement('li');
                li.className   = 'aip-option';
                li.textContent = flatProducts[key].name || key;
                li.setAttribute('role', 'option');
                li.setAttribute('data-aip-key', key);
                li.setAttribute('aria-selected', key === selectedType ? 'true' : 'false');
                if (key === selectedType) li.classList.add('aip-selected');
                allOptions.push(li);
                listbox.appendChild(li);
            });
        }

        if (config && config.categories) {
            buildFromConfig();
        } else {
            buildFromFlat();
        }

        picker.appendChild(trigger);
        picker.appendChild(listbox);

        function selectOption(key) {
            var name = getProductName(key);
            labelSpan.textContent = name;
            picker.setAttribute('data-aip-value', key);
            trigger.setAttribute('aria-expanded', 'false');
            allOptions.forEach(function (opt) {
                var isThis = opt.getAttribute('data-aip-key') === key;
                opt.classList.toggle('aip-selected', isThis);
                opt.setAttribute('aria-selected', isThis ? 'true' : 'false');
            });
            closePicker(picker);
            onSelect(key);
        }

        listbox.addEventListener('mousedown', function (e) {
            var li = e.target.closest('.aip-option');
            if (!li) return;
            e.preventDefault();
            selectOption(li.getAttribute('data-aip-key'));
        });

        trigger.addEventListener('click', function () {
            if (locked || isFormLocked()) return;
            togglePicker(picker);
            trigger.setAttribute('aria-expanded', picker.classList.contains('aip-open') ? 'true' : 'false');
        });

        var highlightedIdx = -1;

        function highlight(idx) {
            allOptions.forEach(function (o) { o.classList.remove('aip-highlighted'); });
            if (idx >= 0 && idx < allOptions.length) {
                allOptions[idx].classList.add('aip-highlighted');
                allOptions[idx].scrollIntoView({ block: 'nearest' });
                highlightedIdx = idx;
            }
        }

        trigger.addEventListener('keydown', function (e) {
            if (locked || isFormLocked()) return;
            var open = picker.classList.contains('aip-open');

            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (!open) {
                    openPicker(picker);
                    trigger.setAttribute('aria-expanded', 'true');
                    var curIdx = allOptions.findIndex(function (o) {
                        return o.getAttribute('data-aip-key') === picker.getAttribute('data-aip-value');
                    });
                    highlight(curIdx >= 0 ? curIdx : 0);
                } else if (highlightedIdx >= 0) {
                    selectOption(allOptions[highlightedIdx].getAttribute('data-aip-key'));
                    trigger.setAttribute('aria-expanded', 'false');
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                closePicker(picker);
                trigger.setAttribute('aria-expanded', 'false');
                trigger.focus();
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (!open) {
                    openPicker(picker);
                    trigger.setAttribute('aria-expanded', 'true');
                }
                var next = Math.min(highlightedIdx + 1, allOptions.length - 1);
                if (highlightedIdx < 0) next = 0;
                highlight(next);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (!open) {
                    openPicker(picker);
                    trigger.setAttribute('aria-expanded', 'true');
                }
                var prev = Math.max(highlightedIdx - 1, 0);
                highlight(prev);
            } else if (e.key === 'Tab') {
                closePicker(picker);
                trigger.setAttribute('aria-expanded', 'false');
            }
        });

        return picker;
    }


    // ----------------------------------------------------------
    // 4. CLOSE ON OUTSIDE CLICK
    // ----------------------------------------------------------
    document.addEventListener('mousedown', function (e) {
        if (!e.target.closest('.aip-picker')) {
            closeAllPickers(null);
        }
    });


    // ----------------------------------------------------------
    // 5. DESKTOP: INJECT PICKER INTO A SPECIFIC ROW
    //    v1.3 FIX: Only remove the native <select>, preserve
    //    help-text, price display, custom fields, override rows.
    // ----------------------------------------------------------

    function injectPickerDesktop(idx) {
        if (typeof currentQuote === 'undefined' || !currentQuote.lineItems) return;
        var item = currentQuote.lineItems[idx];
        if (!item) return;

        var tbody = document.querySelector('#line-items tbody');
        if (!tbody) return;

        var rows = tbody.querySelectorAll('tr');
        var row  = rows[idx];
        if (!row) return;

        // Idempotency: already injected
        if (row.querySelector('.aip-picker')) return;

        var cells     = row.querySelectorAll('td');
        var firstCell = cells[0];
        if (!firstCell) return;

        // Build our custom picker
        var picker = buildPicker(item.type, function (newType) {
            currentQuote.lineItems[idx].type         = newType;
            currentQuote.lineItems[idx].color        = '';
            currentQuote.lineItems[idx].length       = '';
            currentQuote.lineItems[idx].customLength = '';
            currentQuote.lineItems[idx].customDesc   = '';
            rerender();
        });

        // v1.3: Remove ONLY the native <select> that renderDesktop() created.
        // Everything else (help-text div, price div, custom inputs,
        // override-info-row) stays intact.
        var nativeSelect = firstCell.querySelector('select');
        if (nativeSelect) {
            nativeSelect.remove();
        }

        // Prepend our picker as the first child so it sits above
        // the help text and price display.
        firstCell.insertBefore(picker, firstCell.firstChild);
    }

    function injectPickerIntoLastRow() {
        if (typeof currentQuote === 'undefined' || !currentQuote.lineItems) return;
        var idx = currentQuote.lineItems.length - 1;
        if (idx < 0) return;

        setTimeout(function () {
            injectPickerDesktop(idx);

            var tbody = document.querySelector('#line-items tbody');
            if (tbody) {
                var rows = tbody.querySelectorAll('tr');
                var row  = rows[idx];
                if (row) {
                    var trigger = row.querySelector('.aip-trigger');
                    if (trigger && !isFormLocked()) trigger.focus();
                }
            }
        }, 30);
    }


    // ----------------------------------------------------------
    // 6. MOBILE: INJECT PICKER INTO A SPECIFIC CARD
    // ----------------------------------------------------------

    function injectPickerMobile(idx) {
        if (typeof currentQuote === 'undefined' || !currentQuote.lineItems) return;
        var item = currentQuote.lineItems[idx];
        if (!item) return;

        var container = document.getElementById('mobile-items-container');
        if (!container) return;

        var cards = container.children;
        var card  = cards[idx];
        if (!card) return;

        if (card.querySelector('.aip-picker')) return;

        var wrapper   = document.createElement('div');
        wrapper.className = 'aip-mobile-row';

        var label       = document.createElement('span');
        label.className = 'aip-mobile-label';
        label.textContent = 'Product:';

        var picker = buildPicker(item.type, function (newType) {
            currentQuote.lineItems[idx].type         = newType;
            currentQuote.lineItems[idx].color        = '';
            currentQuote.lineItems[idx].length       = '';
            currentQuote.lineItems[idx].customLength = '';
            currentQuote.lineItems[idx].customDesc   = '';
            rerender();
        });

        wrapper.appendChild(label);
        wrapper.appendChild(picker);
        card.insertBefore(wrapper, card.firstChild);
    }


    // ----------------------------------------------------------
    // 7. POST-RENDER HOOKS
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
        console.log('[InlineItemPicker v1.3] Post-render hooks installed.');
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
    // 8. LOCK STATE SYNC
    // ----------------------------------------------------------

    function syncPickerLockState() {
        var locked = isFormLocked();
        document.querySelectorAll('.aip-picker').forEach(function (p) {
            p.classList.toggle('aip-disabled', locked);
            var trigger = p.querySelector('.aip-trigger');
            if (trigger) trigger.disabled = locked;
            if (locked) closePicker(p);
        });
    }

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
        console.log('[InlineItemPicker v1.3] Lock-state observer attached.');
    }


    // ----------------------------------------------------------
    // 9. WRAP window.addItem()
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
        console.log('[InlineItemPicker v1.3] addItem() patched.');
    }


    // ----------------------------------------------------------
    // 10. WAIT FOR RENDER FUNCTIONS
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
    // 11. INIT
    // ----------------------------------------------------------
    function init() {
        patchAddItem();
        waitForRenderFunctions();
        observeLockChanges();
        console.log('[InlineItemPicker v1.3] Initialized.');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
