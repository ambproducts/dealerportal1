// ============================================================
// AmeriDex Dealer Portal - Inline Item Picker v2.0
// Date: 2026-03-05
// ============================================================
// FIXES IN v2.0:
//
//   BUG 1 — Subtotal 0.00 after type change:
//     Root cause: onSelect called rerender() which called the
//     patched renderDesktop() which called injectAllPickersDesktop()
//     which called injectPickerDesktop() which called rerender()
//     again. During this re-entrant loop, updateTotalAndFasteners()
//     ran before PRODUCTS[item.type] was settled, so getItemSubtotal
//     returned 0 for the changed row.
//     Fix: onSelect now calls renderDesktop() and renderMobile()
//     directly (bypassing the patched wrapper via stored refs),
//     then calls updateTotalAndFasteners() in a setTimeout(0) so
//     it always runs after the render pass completes.
//
//   BUG 2 — New row defaults to first product (AmeriDex System Boards):
//     Root cause: addItem() commits whatever the first PRODUCTS key
//     is to lineItems[idx].type before the picker injects. The picker
//     showed the right label but the data was already locked in.
//     Fix: addItem() wrapper intercepts, sets type to sentinel
//     '__pick__', calls the original addItem(), then after render
//     the picker injects with '__pick__' selected and auto-opens
//     so the user's first action is choosing a product.
//     getItemSubtotal returns 0 for '__pick__' rows so they don't
//     pollute the grand total.
// ============================================================

(function () {
    'use strict';

    // ----------------------------------------------------------
    // 1. CSS
    // ----------------------------------------------------------
    var style = document.createElement('style');
    style.id  = 'aip-styles';
    style.textContent = [
        '/* ---- AmeriDex Inline Item Picker v2.0 ---- */',
        '.aip-picker {',
        '  position: relative;',
        '  width: 100%;',
        '  box-sizing: border-box;',
        '  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;',
        '}',
        '.aip-trigger {',
        '  display: flex;',
        '  align-items: flex-start;',
        '  justify-content: space-between;',
        '  gap: 6px;',
        '  width: 100%;',
        '  padding: 7px 10px;',
        '  border: 2px solid #6366f1;',
        '  border-radius: 6px;',
        '  background: #1e2540;',
        '  color: #e2e8f0;',
        '  font-size: 0.85rem;',
        '  font-weight: 600;',
        '  cursor: pointer;',
        '  text-align: left;',
        '  box-sizing: border-box;',
        '  transition: border-color 0.15s, box-shadow 0.15s;',
        '  white-space: normal;',
        '  overflow: visible;',
        '  word-break: break-word;',
        '  line-height: 1.35;',
        '}',
        '.aip-trigger:focus {',
        '  outline: none;',
        '  border-color: #818cf8;',
        '  box-shadow: 0 0 0 3px rgba(99,102,241,0.25);',
        '}',
        '.aip-trigger:hover:not(:disabled) { border-color: #818cf8; }',
        '.aip-trigger:disabled,',
        '.aip-picker.aip-disabled .aip-trigger {',
        '  opacity: 0.45;',
        '  cursor: not-allowed;',
        '}',
        '.aip-trigger-label { flex: 1; white-space: normal; word-break: break-word; }',
        '.aip-trigger-chevron {',
        '  flex-shrink: 0;',
        '  width: 16px;',
        '  height: 16px;',
        '  margin-top: 2px;',
        '  fill: none;',
        '  stroke: #94a3b8;',
        '  stroke-width: 2.5;',
        '  stroke-linecap: round;',
        '  stroke-linejoin: round;',
        '  transition: transform 0.15s;',
        '}',
        '.aip-picker.aip-open .aip-trigger-chevron { transform: rotate(180deg); }',
        '.aip-listbox {',
        '  display: none;',
        '  position: absolute;',
        '  top: calc(100% + 4px);',
        '  left: 0;',
        '  right: 0;',
        '  z-index: 9999;',
        '  background: #1e2540;',
        '  border: 2px solid #6366f1;',
        '  border-radius: 8px;',
        '  box-shadow: 0 12px 32px rgba(0,0,0,0.45);',
        '  max-height: 320px;',
        '  overflow-y: auto;',
        '  list-style: none;',
        '  margin: 0;',
        '  padding: 4px 0;',
        '  box-sizing: border-box;',
        '}',
        '.aip-picker.aip-open .aip-listbox { display: block; }',
        '.aip-group-header {',
        '  padding: 6px 12px 3px;',
        '  font-size: 0.7rem;',
        '  font-weight: 700;',
        '  color: #64748b;',
        '  text-transform: uppercase;',
        '  letter-spacing: 0.08em;',
        '  pointer-events: none;',
        '  user-select: none;',
        '}',
        '.aip-option {',
        '  padding: 8px 14px;',
        '  font-size: 0.85rem;',
        '  font-weight: 500;',
        '  color: #e2e8f0;',
        '  cursor: pointer;',
        '  white-space: normal;',
        '  word-break: break-word;',
        '  line-height: 1.35;',
        '  transition: background 0.1s, color 0.1s;',
        '}',
        '.aip-option:hover, .aip-option.aip-highlighted { background: #2d3a5e; color: #ffffff; }',
        '.aip-option.aip-selected { color: #818cf8; font-weight: 700; }',
        '.aip-option.aip-selected.aip-highlighted { background: #2d3a5e; color: #a5b4fc; }',
        '.aip-group-divider { height: 1px; background: #2d3a5e; margin: 4px 0; }',
        '.aip-pick-placeholder {',
        '  font-size: 0.8rem;',
        '  color: #94a3b8;',
        '  font-style: italic;',
        '  padding: 4px 2px 2px;',
        '}',
        '.aip-mobile-row {',
        '  display: flex;',
        '  align-items: flex-start;',
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
        '  padding-top: 0.55rem;',
        '}'
    ].join('\n');

    if (!document.getElementById('aip-styles')) {
        document.head.appendChild(style);
    }


    // ----------------------------------------------------------
    // 2. SENTINEL
    // ----------------------------------------------------------
    // '__pick__' is used as a placeholder type for brand-new rows
    // before the user has selected a product. getItemSubtotal
    // returns 0 for this type so it never pollutes the total.
    // ----------------------------------------------------------
    var SENTINEL = '__pick__';

    // Guard getItemSubtotal so sentinel rows always return 0
    var _origGetItemSubtotal = window.getItemSubtotal;
    window.getItemSubtotal = function (item) {
        if (!item || item.type === SENTINEL) return 0;
        if (typeof _origGetItemSubtotal === 'function') {
            return _origGetItemSubtotal(item);
        }
        return 0;
    };


    // ----------------------------------------------------------
    // 3. HELPERS
    // ----------------------------------------------------------

    function isFormLocked() {
        return document.querySelector('[data-qe-locked]') !== null;
    }

    function getProductName(typeKey) {
        if (typeKey === SENTINEL) return 'Select a product...';
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
    // 4. BUILD CUSTOM PICKER WIDGET
    // ----------------------------------------------------------

    function buildPicker(selectedType, onSelect) {
        var config       = (typeof PRODUCT_CONFIG !== 'undefined') ? PRODUCT_CONFIG : null;
        var flatProducts = (typeof PRODUCTS !== 'undefined') ? PRODUCTS : {};
        var locked       = isFormLocked();

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
                if (key === SENTINEL) return;
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
                if (!open) { openPicker(picker); trigger.setAttribute('aria-expanded', 'true'); }
                var next = highlightedIdx < 0 ? 0 : Math.min(highlightedIdx + 1, allOptions.length - 1);
                highlight(next);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (!open) { openPicker(picker); trigger.setAttribute('aria-expanded', 'true'); }
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
    // 5. CLOSE ON OUTSIDE CLICK
    // ----------------------------------------------------------
    document.addEventListener('mousedown', function (e) {
        if (!e.target.closest('.aip-picker')) {
            closeAllPickers(null);
        }
    });


    // ----------------------------------------------------------
    // 6. DESKTOP: INJECT PICKER INTO A SPECIFIC ROW
    //
    //    v2.0: onSelect no longer calls rerender(). Instead:
    //      1. Update lineItems[idx] data in place
    //      2. Call the RAW (pre-hook) renderDesktop + renderMobile
    //         so the row repaints with correct product info
    //      3. Call updateTotalAndFasteners() in setTimeout(0)
    //         so it always runs after the render pass settles
    //
    //    This breaks the re-entrant render loop that caused 0.00.
    // ----------------------------------------------------------

    // Stored references to the raw render functions BEFORE our
    // post-render hooks wrap them. Populated in installPostRenderHooks.
    var _rawRenderDesktop = null;
    var _rawRenderMobile  = null;

    function safeRender() {
        // Call the raw pre-hook versions to avoid re-entrancy
        if (typeof _rawRenderDesktop === 'function') {
            try { _rawRenderDesktop(); } catch(e) { console.warn('[AIP] renderDesktop error:', e); }
        } else if (typeof window.renderDesktop === 'function') {
            try { window.renderDesktop(); } catch(e) { console.warn('[AIP] renderDesktop error:', e); }
        }
        if (typeof _rawRenderMobile === 'function') {
            try { _rawRenderMobile(); } catch(e) { console.warn('[AIP] renderMobile error:', e); }
        } else if (typeof window.renderMobile === 'function') {
            try { window.renderMobile(); } catch(e) { console.warn('[AIP] renderMobile error:', e); }
        }
        // Re-inject pickers after raw render rebuilt the DOM
        injectAllPickersDesktop();
        injectAllPickersMobile();
        // Totals after DOM is fully settled
        setTimeout(function () {
            if (typeof window.updateTotalAndFasteners === 'function') {
                window.updateTotalAndFasteners();
            }
        }, 0);
    }

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

        var picker = buildPicker(item.type, function (newType) {
            // Update data
            currentQuote.lineItems[idx].type         = newType;
            currentQuote.lineItems[idx].color        = '';
            currentQuote.lineItems[idx].length       = '';
            currentQuote.lineItems[idx].customLength = '';
            currentQuote.lineItems[idx].customDesc   = '';
            // Re-render cleanly without re-entrancy
            safeRender();
        });

        // Remove only the native <select> renderDesktop() created
        var nativeSelect = firstCell.querySelector('select');
        if (nativeSelect) nativeSelect.remove();

        // Prepend above help-text and price display
        firstCell.insertBefore(picker, firstCell.firstChild);

        // If this is a sentinel (new unselected row), show placeholder
        // and clear the price/help text that renderDesktop painted for
        // whatever product it defaulted to
        if (item.type === SENTINEL) {
            // Hide the help-text and price divs until a product is chosen
            firstCell.querySelectorAll('div, small, span').forEach(function (el) {
                if (el.closest('.aip-picker')) return;
                el.style.display = 'none';
                el.setAttribute('data-aip-hidden', '1');
            });
        }
    }

    function injectPickerIntoLastRow(autoOpen) {
        if (typeof currentQuote === 'undefined' || !currentQuote.lineItems) return;
        var idx = currentQuote.lineItems.length - 1;
        if (idx < 0) return;

        setTimeout(function () {
            injectPickerDesktop(idx);
            injectPickerMobile(idx);

            var tbody = document.querySelector('#line-items tbody');
            if (tbody) {
                var rows = tbody.querySelectorAll('tr');
                var row  = rows[idx];
                if (row) {
                    var trigger = row.querySelector('.aip-trigger');
                    if (trigger && !isFormLocked()) {
                        trigger.focus();
                        if (autoOpen) {
                            var pickerEl = row.querySelector('.aip-picker');
                            if (pickerEl) openPicker(pickerEl);
                        }
                    }
                }
            }
        }, 30);
    }


    // ----------------------------------------------------------
    // 7. MOBILE: INJECT PICKER INTO A SPECIFIC CARD
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

        var wrapper       = document.createElement('div');
        wrapper.className = 'aip-mobile-row';

        var label         = document.createElement('span');
        label.className   = 'aip-mobile-label';
        label.textContent = 'Product:';

        var picker = buildPicker(item.type, function (newType) {
            currentQuote.lineItems[idx].type         = newType;
            currentQuote.lineItems[idx].color        = '';
            currentQuote.lineItems[idx].length       = '';
            currentQuote.lineItems[idx].customLength = '';
            currentQuote.lineItems[idx].customDesc   = '';
            safeRender();
        });

        wrapper.appendChild(label);
        wrapper.appendChild(picker);
        card.insertBefore(wrapper, card.firstChild);
    }


    // ----------------------------------------------------------
    // 8. POST-RENDER HOOKS
    // ----------------------------------------------------------
    var _hooksInstalled = false;

    function installPostRenderHooks() {
        if (_hooksInstalled) return;

        // Store raw references BEFORE wrapping
        _rawRenderDesktop = window.renderDesktop;
        _rawRenderMobile  = window.renderMobile;

        window.renderDesktop = function () {
            if (typeof _rawRenderDesktop === 'function') _rawRenderDesktop();
            injectAllPickersDesktop();
            // NOTE: We do NOT call updateTotalAndFasteners here.
            // The caller chain (render() -> updateTotalAndFasteners())
            // handles totals. We only re-inject picker widgets.
        };

        window.renderMobile = function () {
            if (typeof _rawRenderMobile === 'function') _rawRenderMobile();
            injectAllPickersMobile();
        };

        _hooksInstalled = true;
        console.log('[InlineItemPicker v2.0] Post-render hooks installed.');
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
    // 9. LOCK STATE SYNC
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
        console.log('[InlineItemPicker v2.0] Lock-state observer attached.');
    }


    // ----------------------------------------------------------
    // 10. WRAP window.addItem()
    //
    //  v2.0: Instead of letting addItem() commit the first product
    //  key as the default type, we:
    //    1. Call the original addItem() (which adds a line item
    //       with whatever the default type is)
    //    2. Immediately overwrite that type with SENTINEL
    //    3. Inject the picker with auto-open so the user's first
    //       action is choosing a product
    // ----------------------------------------------------------
    function patchAddItem() {
        if (typeof window.addItem !== 'function') {
            setTimeout(patchAddItem, 150);
            return;
        }
        var _origAddItem = window.addItem;
        window.addItem = function () {
            _origAddItem.apply(this, arguments);
            // Overwrite the committed default type with the sentinel
            if (typeof currentQuote !== 'undefined' &&
                currentQuote.lineItems &&
                currentQuote.lineItems.length > 0) {
                var idx = currentQuote.lineItems.length - 1;
                currentQuote.lineItems[idx].type   = SENTINEL;
                currentQuote.lineItems[idx].color  = '';
                currentQuote.lineItems[idx].length = '';
                // Re-render so the row shows the sentinel state
                if (_rawRenderDesktop) {
                    try { _rawRenderDesktop(); } catch(e) {}
                }
                if (_rawRenderMobile) {
                    try { _rawRenderMobile(); } catch(e) {}
                }
                if (typeof window.updateTotalAndFasteners === 'function') {
                    window.updateTotalAndFasteners();
                }
            }
            // Inject picker and auto-open it
            injectPickerIntoLastRow(true);
        };
        console.log('[InlineItemPicker v2.0] addItem() patched.');
    }


    // ----------------------------------------------------------
    // 11. WAIT FOR RENDER FUNCTIONS
    // ----------------------------------------------------------
    function waitForRenderFunctions() {
        if (typeof window.renderDesktop === 'function' &&
            typeof window.renderMobile  === 'function') {
            installPostRenderHooks();
            patchAddItem();
        } else {
            setTimeout(waitForRenderFunctions, 150);
        }
    }


    // ----------------------------------------------------------
    // 12. INIT
    // ----------------------------------------------------------
    function init() {
        waitForRenderFunctions();
        observeLockChanges();
        console.log('[InlineItemPicker v2.0] Initialized.');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
