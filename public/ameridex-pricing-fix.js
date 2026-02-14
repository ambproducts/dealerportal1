// ============================================================
// AmeriDex Dealer Portal - Pricing Fix v1.0
// Date: 2026-02-14
// ============================================================
// FIXES:
//   - "Price: undefined/ft" display bug in line items
//   - applyTierPricing() overwriting PRODUCTS with undefined
//   - Subtotal calculations using unresolved prices
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
    // 1. getDisplayPrice() - Single source of truth for price
    // ----------------------------------------------------------
    // Resolves the correct per-unit price for display:
    //   1. Approved override price (highest priority)
    //   2. Item-level tierPrice (set by server sync)
    //   3. PRODUCTS[type].price (set by applyTierPricing)
    //   4. PRODUCT_CONFIG fallback
    //   5. 0 (absolute fallback)
    // ----------------------------------------------------------
    window.getDisplayPrice = function (item) {
        if (!item) return 0;

        // Custom items use their own unitPrice field
        if (item.type === 'custom') {
            return parseFloat(item.unitPrice) || 0;
        }

        // Check for approved override
        if (item.priceOverride && item.priceOverride.status === 'approved') {
            return parseFloat(item.priceOverride.requestedPrice) || 0;
        }

        // Try item-level tierPrice (from server sync)
        if (item.tierPrice !== undefined && item.tierPrice !== null && !isNaN(item.tierPrice)) {
            return parseFloat(item.tierPrice);
        }

        // Try PRODUCTS global (updated by applyTierPricing)
        if (typeof PRODUCTS !== 'undefined' && PRODUCTS[item.type]) {
            var prodPrice = PRODUCTS[item.type].price;
            if (prodPrice !== undefined && prodPrice !== null && !isNaN(prodPrice)) {
                return parseFloat(prodPrice);
            }
        }

        // Try PRODUCT_CONFIG fallback
        if (typeof PRODUCT_CONFIG !== 'undefined' && PRODUCT_CONFIG.categories) {
            var cats = Object.values(PRODUCT_CONFIG.categories);
            for (var c = 0; c < cats.length; c++) {
                if (cats[c].products && cats[c].products[item.type]) {
                    var cfgPrice = cats[c].products[item.type].price;
                    if (cfgPrice !== undefined && cfgPrice !== null && !isNaN(cfgPrice)) {
                        return parseFloat(cfgPrice);
                    }
                }
            }
        }

        return 0;
    };


    // ----------------------------------------------------------
    // 2. Guard applyTierPricing() against undefined overwrites
    // ----------------------------------------------------------
    // The original applyTierPricing in ameridex-api.js does:
    //   PRODUCTS[key].price = data.products[key].price;
    // If the server response is missing a price field, this
    // overwrites the hardcoded default with undefined.
    //
    // We store a backup of original prices and restore on bad data.
    // ----------------------------------------------------------
    var _originalPrices = {};

    function backupPrices() {
        if (typeof PRODUCTS === 'undefined') return;
        Object.keys(PRODUCTS).forEach(function (key) {
            if (PRODUCTS[key].price !== undefined && PRODUCTS[key].price !== null) {
                _originalPrices[key] = PRODUCTS[key].price;
            }
        });
    }

    // Take backup immediately
    backupPrices();

    // Patch: After any render cycle, check for undefined prices and restore
    function healUndefinedPrices() {
        if (typeof PRODUCTS === 'undefined') return;
        Object.keys(PRODUCTS).forEach(function (key) {
            if (PRODUCTS[key].price === undefined || PRODUCTS[key].price === null || isNaN(PRODUCTS[key].price)) {
                if (_originalPrices[key] !== undefined) {
                    PRODUCTS[key].price = _originalPrices[key];
                    console.warn('[PricingFix] Healed undefined price for "' + key + '" back to $' + _originalPrices[key]);
                }
            }
        });
    }


    // ----------------------------------------------------------
    // 3. Patch renderDesktop() to use getDisplayPrice()
    // ----------------------------------------------------------
    var _prevRenderDesktop = window.renderDesktop;
    window.renderDesktop = function () {
        // Heal any undefined prices before rendering
        healUndefinedPrices();

        // Call the existing renderDesktop (which may be the
        // patches.js version that handles empty state)
        if (typeof _prevRenderDesktop === 'function') {
            _prevRenderDesktop();
        }

        // Post-render: fix any "Price: undefined" or "Price: NaN" text
        if (typeof currentQuote === 'undefined' || !currentQuote.lineItems) return;

        currentQuote.lineItems.forEach(function (item, i) {
            // Find the price display element for this row
            // The main file creates elements like: priceDiv with text "Price: X.XX/ft"
            var tbody = document.querySelector('#line-items tbody');
            if (!tbody) return;
            var rows = tbody.querySelectorAll('tr');
            if (!rows[i]) return;

            var row = rows[i];
            var priceDivs = row.querySelectorAll('.product-description, div[style*="color"], small');
            var prod = (typeof PRODUCTS !== 'undefined' && PRODUCTS[item.type]) ? PRODUCTS[item.type] : null;

            // Scan all child elements in the first cell for price text
            var firstCell = row.cells ? row.cells[0] : null;
            if (firstCell) {
                var allDivs = firstCell.querySelectorAll('div, small, span');
                allDivs.forEach(function (el) {
                    var text = el.textContent || '';
                    if (text.indexOf('Price:') !== -1 && (text.indexOf('undefined') !== -1 || text.indexOf('NaN') !== -1)) {
                        var price = window.getDisplayPrice(item);
                        var unit = '';
                        if (prod) {
                            unit = prod.isFt ? '/ft' : ' each';
                        } else {
                            unit = '/ft';
                        }
                        el.textContent = 'Price: $' + (typeof formatCurrency === 'function' ? formatCurrency(price) : price.toFixed(2)) + unit;
                        el.style.color = '#2563eb';
                    }
                });
            }

            // Also fix subtotal cell if it shows NaN or undefined
            var subCell = document.getElementById('sub-' + i);
            if (subCell) {
                var subText = subCell.textContent || '';
                if (subText.indexOf('NaN') !== -1 || subText.indexOf('undefined') !== -1 || subText === '$') {
                    var sub = (typeof getItemSubtotal === 'function') ? getItemSubtotal(item) : 0;
                    subCell.textContent = '$' + (typeof formatCurrency === 'function' ? formatCurrency(sub) : sub.toFixed(2));
                }
            }
        });
    };


    // ----------------------------------------------------------
    // 4. Patch renderMobile() similarly
    // ----------------------------------------------------------
    var _prevRenderMobile = window.renderMobile;
    window.renderMobile = function () {
        healUndefinedPrices();

        if (typeof _prevRenderMobile === 'function') {
            _prevRenderMobile();
        }

        // Post-render: fix mobile price displays
        var container = document.getElementById('mobile-items-container');
        if (!container) return;
        if (typeof currentQuote === 'undefined' || !currentQuote.lineItems) return;

        var cards = container.querySelectorAll('.mobile-item-card, div[class*="mobile"]');
        currentQuote.lineItems.forEach(function (item, i) {
            if (!cards[i]) return;
            var allEls = cards[i].querySelectorAll('div, span, small');
            allEls.forEach(function (el) {
                var text = el.textContent || '';
                if (text.indexOf('Price:') !== -1 && (text.indexOf('undefined') !== -1 || text.indexOf('NaN') !== -1)) {
                    var price = window.getDisplayPrice(item);
                    var prod = (typeof PRODUCTS !== 'undefined' && PRODUCTS[item.type]) ? PRODUCTS[item.type] : null;
                    var unit = (prod && prod.isFt) ? '/ft' : ' each';
                    el.textContent = 'Price: $' + (typeof formatCurrency === 'function' ? formatCurrency(price) : price.toFixed(2)) + unit;
                    el.style.color = '#2563eb';
                }
            });
        });
    };


    // ----------------------------------------------------------
    // 5. Patch getItemPrice() to use fallback chain
    // ----------------------------------------------------------
    var _origGetItemPrice = window.getItemPrice;
    window.getItemPrice = function (item) {
        if (!item) return 0;

        // Custom items
        if (item.type === 'custom') {
            return parseFloat(item.unitPrice) || 0;
        }

        // Use getDisplayPrice for the full fallback chain
        return window.getDisplayPrice(item);
    };


    // ----------------------------------------------------------
    // 6. Patch getItemSubtotal() to use fixed getItemPrice()
    // ----------------------------------------------------------
    var _origGetItemSubtotal = window.getItemSubtotal;
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

    // Keep getItemSubtotalFromData in sync
    window.getItemSubtotalFromData = function (li) {
        return window.getItemSubtotal(li);
    };


    // ----------------------------------------------------------
    // 7. Force re-render after tier pricing loads
    // ----------------------------------------------------------
    // Listen for the tier pricing to finish loading, then backup
    // the new prices and force a re-render.
    // ----------------------------------------------------------
    var _checkInterval = setInterval(function () {
        if (typeof window._currentTier !== 'undefined' && window._currentTier) {
            clearInterval(_checkInterval);
            // Re-backup with server-loaded prices
            backupPrices();
            // Force re-render if items exist
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

    // Stop checking after 30 seconds (server might be offline)
    setTimeout(function () { clearInterval(_checkInterval); }, 30000);


    console.log('[AmeriDex PricingFix] v1.0 loaded: undefined price protection active.');
})();
