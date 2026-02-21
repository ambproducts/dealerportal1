// ============================================================
// AmeriDex Dealer Portal - Pricing Fix v1.2
// Date: 2026-02-21
// ============================================================
// FIXES:
//   - formatCurrency() returning undefined for all inputs (v1.2)
//   - "Price: $undefined/ft" display bug in line items
//   - applyTierPricing() overwriting PRODUCTS with undefined
//   - Subtotal calculations using unresolved prices
//   - Double-dollar-sign bug in post-render DOM scan (v1.1)
//   - Broadened pattern matching for $undefined, $NaN, $null
//   - MutationObserver safety net for late async renders
//
// v1.2 Changes (2026-02-21):
//   - ROOT CAUSE FIX: The inline formatCurrency() in
//     dealer-portal.html returns undefined for ALL inputs
//     (including valid numbers). This caused $undefined to
//     appear in the review modal, sent emails, print output,
//     and saved quotes list. The product selection table only
//     looked correct because the MutationObserver DOM scanner
//     was replacing $undefined text after rendering.
//   - ADD: formatCurrency() override as first patch (Section 0)
//   - ADD: healUndefinedPrices() calls before all output paths
//
// REQUIRES: ameridex-patches.js, ameridex-api.js loaded first
//
// Load order in dealer-portal.html (before </body>):
//   <script src="ameridex-patches.js"></script>
//   <script src="ameridex-api.js"></script>
//   <script src="ameridex-pricing-fix.js"></script>
//   <script src="ameridex-overrides.js"></script>
//   <script src="ameridex-roles.js"></script>
//   <script src="ameridex-admin.js"></script>
// ============================================================

(function () {
    'use strict';

    // ----------------------------------------------------------
    // 0. FIX formatCurrency() - ROOT CAUSE OF $undefined BUG
    // ----------------------------------------------------------
    // The inline formatCurrency() in dealer-portal.html is broken
    // (returns undefined for all inputs). Every code path that
    // builds a price string calls this function:
    //   - showReviewModal (Patch 8)
    //   - generatePrintHTML (Patch 5)
    //   - generateOrderTextForEmail (Patch 15)
    //   - buildFormspreePayload (Patch 15)
    //   - renderSavedQuotes (API Section 14)
    //   - updateTotalAndFasteners (Patch 13)
    //
    // This override must load BEFORE any of those run.
    // ----------------------------------------------------------
    window.formatCurrency = function (value) {
        if (value === undefined || value === null || isNaN(Number(value))) {
            return '0.00';
        }
        var num = parseFloat(value);
        if (!isFinite(num)) return '0.00';

        // Format with 2 decimal places and thousand separators
        var parts = num.toFixed(2).split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        return parts.join('.');
    };

    console.log('[PricingFix] formatCurrency() overridden. Test: formatCurrency(1234.5) = ' + window.formatCurrency(1234.5));


    // ----------------------------------------------------------
    // 1. getDisplayPrice() - Single source of truth for price
    // ----------------------------------------------------------
    window.getDisplayPrice = function (item) {
        if (!item) return 0;

        // Custom items use their own unitPrice field
        if (item.type === 'custom') {
            return parseFloat(item.unitPrice) || parseFloat(item.customUnitPrice) || 0;
        }

        // Check for approved override
        if (item.priceOverride && item.priceOverride.status === 'approved') {
            var ovr = parseFloat(item.priceOverride.requestedPrice);
            if (!isNaN(ovr) && isFinite(ovr)) return ovr;
        }

        // Try item-level tierPrice (from server sync)
        if (item.tierPrice !== undefined && item.tierPrice !== null) {
            var tp = parseFloat(item.tierPrice);
            if (!isNaN(tp) && isFinite(tp)) return tp;
        }

        // Try PRODUCTS global (updated by applyTierPricing)
        if (typeof PRODUCTS !== 'undefined' && PRODUCTS[item.type]) {
            var prodPrice = PRODUCTS[item.type].price;
            if (prodPrice !== undefined && prodPrice !== null) {
                var pp = parseFloat(prodPrice);
                if (!isNaN(pp) && isFinite(pp)) return pp;
            }
        }

        // Try PRODUCT_CONFIG fallback
        if (typeof PRODUCT_CONFIG !== 'undefined' && PRODUCT_CONFIG.categories) {
            var cats = Object.values(PRODUCT_CONFIG.categories);
            for (var c = 0; c < cats.length; c++) {
                if (cats[c].products && cats[c].products[item.type]) {
                    var cfgPrice = cats[c].products[item.type].price;
                    if (cfgPrice !== undefined && cfgPrice !== null) {
                        var cp = parseFloat(cfgPrice);
                        if (!isNaN(cp) && isFinite(cp)) return cp;
                    }
                }
            }
        }

        return 0;
    };


    // ----------------------------------------------------------
    // 2. Guard applyTierPricing() against undefined overwrites
    // ----------------------------------------------------------
    var _originalPrices = {};

    function backupPrices() {
        if (typeof PRODUCTS === 'undefined') return;
        Object.keys(PRODUCTS).forEach(function (key) {
            var p = PRODUCTS[key].price;
            if (p !== undefined && p !== null && !isNaN(Number(p))) {
                _originalPrices[key] = parseFloat(p);
            }
        });
    }

    // Take backup immediately
    backupPrices();

    function healUndefinedPrices() {
        if (typeof PRODUCTS === 'undefined') return;
        var healed = false;
        Object.keys(PRODUCTS).forEach(function (key) {
            var p = PRODUCTS[key].price;
            if (p === undefined || p === null || isNaN(Number(p))) {
                if (_originalPrices[key] !== undefined) {
                    PRODUCTS[key].price = _originalPrices[key];
                    healed = true;
                    console.warn('[PricingFix] Healed undefined price for "' + key + '" back to $' + _originalPrices[key]);
                }
            }
        });
        return healed;
    }

    // Expose healUndefinedPrices globally so other patches can call it
    window.healUndefinedPrices = healUndefinedPrices;


    // ----------------------------------------------------------
    // 3. DOM scanner: fix broken price/subtotal text in-place
    // ----------------------------------------------------------
    // Matches: "$undefined", "$NaN", "$null", "Price: $undefined",
    //          "Price: undefined", etc.
    // ----------------------------------------------------------
    var BAD_PRICE_REGEX = /\$(undefined|NaN|null)|Price:\s*\$?(undefined|NaN|null)/i;

    function fixPriceTextInRow(row, item, rowIndex) {
        if (!row || !item) return;

        var prod = (typeof PRODUCTS !== 'undefined' && PRODUCTS[item.type]) ? PRODUCTS[item.type] : null;
        var price = window.getDisplayPrice(item);
        var unit = '';
        if (prod) {
            unit = prod.isFt ? '/ft' : ' each';
        } else {
            unit = '/ft';
        }

        // Format the price without double dollar sign
        var priceNum = parseFloat(price) || 0;
        var priceText = '$' + priceNum.toFixed(2) + unit;

        // Scan first cell for price display text
        var firstCell = row.cells ? row.cells[0] : null;
        if (firstCell) {
            var allEls = firstCell.querySelectorAll('div, small, span, p');
            allEls.forEach(function (el) {
                var text = el.textContent || '';
                if (BAD_PRICE_REGEX.test(text)) {
                    el.textContent = 'Price: ' + priceText;
                    el.style.color = '#2563eb';
                }
            });
        }

        // Fix subtotal cell
        var subCell = document.getElementById('sub-' + rowIndex);
        if (subCell) {
            var subText = subCell.textContent || '';
            if (BAD_PRICE_REGEX.test(subText) || subText === '$' || subText.trim() === '') {
                var sub = (typeof getItemSubtotal === 'function') ? getItemSubtotal(item) : 0;
                var subNum = parseFloat(sub) || 0;
                subCell.textContent = '$' + subNum.toFixed(2);
            }
        }
    }

    function scanAndFixAllPrices() {
        if (typeof currentQuote === 'undefined' || !currentQuote.lineItems) return;

        // Desktop table
        var tbody = document.querySelector('#line-items tbody');
        if (tbody) {
            var rows = tbody.querySelectorAll('tr');
            currentQuote.lineItems.forEach(function (item, i) {
                if (rows[i]) fixPriceTextInRow(rows[i], item, i);
            });
        }

        // Mobile cards
        var mobileContainer = document.getElementById('mobile-items-container');
        if (mobileContainer) {
            var allEls = mobileContainer.querySelectorAll('div, span, small, p');
            allEls.forEach(function (el) {
                var text = el.textContent || '';
                if (BAD_PRICE_REGEX.test(text)) {
                    // Try to figure out which item this belongs to by context
                    // For mobile, just scan all items and fix any matching text
                    el.style.color = '#2563eb';
                    // Replace the bad text generically
                    el.textContent = text.replace(/\$undefined|\.?undefined/gi, '$0.00').replace(/\$NaN|\.?NaN/gi, '$0.00').replace(/\$null|\.?null/gi, '$0.00');
                }
            });
        }

        // Grand total
        var grandEl = document.getElementById('grand-total');
        if (grandEl) {
            var gt = grandEl.textContent || '';
            if (BAD_PRICE_REGEX.test(gt) || gt === '$' || gt.trim() === '') {
                var total = 0;
                currentQuote.lineItems.forEach(function (li) {
                    total += (typeof getItemSubtotal === 'function') ? getItemSubtotal(li) : 0;
                });
                grandEl.textContent = '$' + (parseFloat(total) || 0).toFixed(2);
            }
        }
    }


    // ----------------------------------------------------------
    // 4. Patch renderDesktop() to heal + scan
    // ----------------------------------------------------------
    var _prevRenderDesktop = window.renderDesktop;
    window.renderDesktop = function () {
        healUndefinedPrices();

        if (typeof _prevRenderDesktop === 'function') {
            _prevRenderDesktop();
        }

        // Post-render scan
        scanAndFixAllPrices();
    };


    // ----------------------------------------------------------
    // 5. Patch renderMobile() similarly
    // ----------------------------------------------------------
    var _prevRenderMobile = window.renderMobile;
    window.renderMobile = function () {
        healUndefinedPrices();

        if (typeof _prevRenderMobile === 'function') {
            _prevRenderMobile();
        }

        scanAndFixAllPrices();
    };


    // ----------------------------------------------------------
    // 6. Patch getItemPrice() to use fallback chain
    // ----------------------------------------------------------
    window.getItemPrice = function (item) {
        if (!item) return 0;
        if (item.type === 'custom') {
            return parseFloat(item.unitPrice) || parseFloat(item.customUnitPrice) || 0;
        }
        return window.getDisplayPrice(item);
    };


    // ----------------------------------------------------------
    // 7. Patch getItemSubtotal() to use fixed getItemPrice()
    // ----------------------------------------------------------
    window.getItemSubtotal = function (item) {
        if (!item) return 0;

        var price = window.getItemPrice(item);
        var qty = parseInt(item.qty, 10) || 1;

        if (item.type === 'custom') {
            return price * qty;
        }

        var prod = (typeof PRODUCTS !== 'undefined' && PRODUCTS[item.type]) ? PRODUCTS[item.type] : null;

        if (prod && prod.isFt) {
            var length = 0;
            if (item.length === 'custom') {
                length = parseFloat(item.customLength) || 0;
            } else {
                length = parseFloat(item.length) || 0;
            }
            return price * length * qty;
        }

        return price * qty;
    };

    window.getItemSubtotalFromData = function (li) {
        return window.getItemSubtotal(li);
    };


    // ----------------------------------------------------------
    // 8. Force re-render after tier pricing loads
    // ----------------------------------------------------------
    var _checkInterval = setInterval(function () {
        if (typeof window._currentTier !== 'undefined' && window._currentTier) {
            clearInterval(_checkInterval);
            backupPrices();
            if (typeof currentQuote !== 'undefined' && currentQuote.lineItems && currentQuote.lineItems.length > 0) {
                if (typeof render === 'function') {
                    render();
                }
                if (typeof updateTotalAndFasteners === 'function') {
                    updateTotalAndFasteners();
                }
            }
            console.log('[PricingFix] Tier pricing loaded, prices backed up and re-rendered.');
        }
    }, 500);

    setTimeout(function () { clearInterval(_checkInterval); }, 30000);


    // ----------------------------------------------------------
    // 9. MutationObserver safety net
    // ----------------------------------------------------------
    // Watches the line-items table body for changes and runs
    // the price scanner after any DOM mutation. This catches
    // cases where renderDesktop is called from code paths that
    // bypass our patched version (e.g. inline event handlers).
    // ----------------------------------------------------------
    var _scanDebounce = null;
    function debouncedScan() {
        if (_scanDebounce) clearTimeout(_scanDebounce);
        _scanDebounce = setTimeout(function () {
            scanAndFixAllPrices();
        }, 100);
    }

    // Start observing once the table body exists
    function startObserver() {
        var tbody = document.querySelector('#line-items tbody');
        if (!tbody) {
            // Retry after DOM is ready
            setTimeout(startObserver, 500);
            return;
        }
        var observer = new MutationObserver(debouncedScan);
        observer.observe(tbody, { childList: true, subtree: true, characterData: true });

        // Also observe mobile container
        var mobile = document.getElementById('mobile-items-container');
        if (mobile) {
            observer.observe(mobile, { childList: true, subtree: true, characterData: true });
        }
    }

    startObserver();


    console.log('[AmeriDex PricingFix] v1.2 loaded: formatCurrency fix + undefined price protection active.');
})();
