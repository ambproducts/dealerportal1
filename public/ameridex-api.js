// ============================================================
// AmeriDex Dealer Portal - API Integration Patch v2.16
// Date: 2026-02-27
// ============================================================
// REQUIRES: ameridex-patches.js (v1.0+) loaded first
//
// Load order in dealer-portal.html (before </body>):
//   <script src="ameridex-patches.js"></script>
//   <script src="ameridex-api.js"></script>
//
// v2.16 Changes (2026-02-27):
//   - FIX: applyQuoteToDOM() in loadQuoteFromUrlParam() (Section 18)
//     now maps server line items through mapServerLineItemToFrontend()
//     before assigning to currentQuote.lineItems. This was removed in
//     v2.14 causing line items to not render when opening quotes from
//     the My Quotes page (server field names not converted to frontend).
//
// v2.15 Changes (2026-02-27):
//   - FIX: Override window.loadQuote() (new Section 14b) to restore
//     all 11 DOM fields when loading a saved quote. The inline
//     loadQuote(idx) in dealer-portal.html only restored 5 fields
//     (customer name/email/zip/company/phone), silently dropping:
//       - pic-frame checkbox
//       - stairs checkbox
//       - special-instr textarea
//       - internal-notes textarea
//       - ship-addr textarea
//       - del-date input
//     Data was saved correctly by syncQuoteFromDOM() but lost on
//     every reload. Both loadQuote() and applyQuoteToDOM() now
//     share the same restoreQuoteToDOM() helper for consistency.
//
// v2.14 Changes (2026-02-27):
//   - FIX: loadQuoteFromUrlParam() Section 18 applyQuoteToDOM()
//     no longer calls mapServerLineItemToFrontend() on line items.
//
// v2.13 Changes (2026-02-27):
//   - FIX: syncQuoteToServer() now sends the original catalog base
//     price (pre-tier) instead of the already tier-adjusted price.
//
// v2.12 Changes (2026-02-27):
//   - FIX: All bare `currentQuote` and `savedQuotes` references
//     inside the IIFE now use `window.currentQuote` and
//     `window.savedQuotes` throughout.
//
// v2.11 Changes (2026-02-27):
//   - FIX: saveCurrentQuote() (Section 7) now matches by _serverId
//     first before falling back to quoteId string comparison.
//
// v2.10 Changes (2026-02-27):
//   - FIX: loadQuoteFromUrlParam() (Section 18) added to handle
//     the ?quoteId= URL parameter set by the My Quotes page.
//
// v2.9 Changes (2026-02-27):
//   - FIX: loadServerQuotes() now reverse-maps server line items
//     back to frontend format using mapServerLineItemToFrontend().
//
// v2.8 Changes (2026-02-27):
//   - FIX: syncQuoteToServer() now maps frontend line item fields
//     to the backend's expected format before sending the payload.
//
// v2.7 Changes (2026-02-27):
//   - FIX: handleServerLogin() now writes dealerSettings.role.
//
// v2.6 Changes (2026-02-27):
//   - FIX: renderSavedQuotes() now null-guards #quote-search and
//     #saved-quotes-list.
//
// v2.5 Changes (2026-02-26):
//   - FIX: Expose applyTierPricing to window object.
//
// v2.4 Changes (2026-02-16):
//   - FIX: Dispatch 'ameridex-login' custom event after auth.
//
// v2.3 Changes (2026-02-14):
//   - FIX: api() helper no longer treats 401 from /api/auth/login
//     as "session expired".
//
// v2.2 Changes (2026-02-14):
//   - FIX: Section 14 loadQuote() now resolves real savedQuotes
//     index via indexOf().
//
// v2.1 Changes (2026-02-14):
//   - FIX: Login now sends { dealerCode, username, password }
// ============================================================

(function () {
    'use strict';

    // ----------------------------------------------------------
    // CONFIG
    // ----------------------------------------------------------
    var API_BASE = window.AMERIDEX_API_BASE || '';


    // ----------------------------------------------------------
    // SESSION STATE
    // ----------------------------------------------------------
    var _authToken = sessionStorage.getItem('ameridex-token') || null;
    var _currentUser = null;
    var _currentDealer = null;
    var _serverOnline = true;
    var _quoteSyncQueue = [];


    // ----------------------------------------------------------
    // API HELPER
    // ----------------------------------------------------------
    function api(method, path, body, options) {
        var opts = {
            method: method,
            headers: { 'Content-Type': 'application/json' }
        };
        if (_authToken) {
            opts.headers['Authorization'] = 'Bearer ' + _authToken;
        }
        if (body && method !== 'GET') {
            opts.body = JSON.stringify(body);
        }

        var skipAuthRedirect = (options && options.skipAuthRedirect) || false;

        return fetch(API_BASE + path, opts)
            .then(function (res) {
                _serverOnline = true;

                if (res.status === 401) {
                    if (!skipAuthRedirect) {
                        sessionStorage.removeItem('ameridex-token');
                        _authToken = null;
                        _currentUser = null;
                        _currentDealer = null;
                        showLoginScreen();
                        showLoginError('Session expired. Please log in again.');
                    }
                    return res.json().catch(function () { return {}; }).then(function (errBody) {
                        return Promise.reject(new Error(
                            errBody.error || (skipAuthRedirect ? 'Invalid credentials' : 'Unauthorized')
                        ));
                    });
                }

                if (res.status === 403) {
                    return res.json().catch(function () { return {}; }).then(function (errBody) {
                        return Promise.reject(new Error(errBody.error || 'Access denied'));
                    });
                }

                if (!res.ok) {
                    return res.json().catch(function () { return {}; }).then(function (err) {
                        return Promise.reject(new Error(err.error || 'Request failed'));
                    });
                }
                var ct = res.headers.get('content-type') || '';
                if (ct.includes('text/csv')) return res.text();
                return res.json();
            })
            .catch(function (err) {
                if (err.message === 'Unauthorized' || err.message === 'Invalid credentials' || err.message === 'Access denied') throw err;
                if (err.message === 'Failed to fetch' || err.name === 'TypeError') {
                    _serverOnline = false;
                    console.warn('[API] Server unreachable, falling back to localStorage');
                }
                throw err;
            });
    }

    // Expose for admin panel and admin-customers
    window.ameridexAPI = api;
    window.getAuthToken = function () { return _authToken; };
    window.getCurrentDealer = function () { return _currentDealer; };
    window.getCurrentUser = function () { return _currentUser; };


    // ----------------------------------------------------------
    // EVENT DISPATCH HELPER
    // ----------------------------------------------------------
    function dispatchLoginEvent() {
        try {
            window.dispatchEvent(new Event('ameridex-login'));
            console.log('[Auth] Dispatched ameridex-login event (role: ' + (_currentUser ? _currentUser.role : 'unknown') + ')');
        } catch (e) {
            var evt = document.createEvent('Event');
            evt.initEvent('ameridex-login', true, true);
            window.dispatchEvent(evt);
        }
    }


    // ----------------------------------------------------------
    // SHARED HELPER: Restore a quote object to the DOM (v2.15)
    // ----------------------------------------------------------
    // Used by both loadQuote() (Section 14b) and
    // applyQuoteToDOM() (Section 18) so all fields are
    // restored consistently in every code path.
    // ----------------------------------------------------------
    function restoreQuoteToDOM(quoteObj) {
        // Customer fields
        var c = quoteObj.customer || {};
        document.getElementById('cust-name').value    = c.name    || '';
        document.getElementById('cust-email').value   = c.email   || '';
        document.getElementById('cust-zip').value     = c.zipCode || '';
        document.getElementById('cust-company').value = c.company || '';
        document.getElementById('cust-phone').value   = c.phone   || '';

        // Options checkboxes
        var opts = quoteObj.options || { pictureFrame: false, stairs: false };
        document.getElementById('pic-frame').checked = !!opts.pictureFrame;
        document.getElementById('stairs').checked    = !!opts.stairs;

        var picFrameNote = document.getElementById('pic-frame-note');
        var stairsNote   = document.getElementById('stairs-note');
        if (picFrameNote) picFrameNote.style.display = opts.pictureFrame ? 'block' : 'none';
        if (stairsNote)   stairsNote.style.display   = opts.stairs       ? 'block' : 'none';

        // Text fields that the inline loadQuote() missed
        document.getElementById('special-instr').value  = quoteObj.specialInstructions || '';
        document.getElementById('internal-notes').value = quoteObj.internalNotes       || '';
        document.getElementById('ship-addr').value      = quoteObj.shippingAddress     || '';
        document.getElementById('del-date').value       = quoteObj.deliveryDate        || '';

        // Re-render line items table and totals
        render();
        updateTotalAndFasteners();
        if (typeof updateCustomerProgress === 'function') updateCustomerProgress();
    }


    // ----------------------------------------------------------
    // 1. INJECT USERNAME + PASSWORD FIELDS INTO LOGIN CARD
    // ----------------------------------------------------------
    function injectLoginFields() {
        var loginCard = document.querySelector('.login-card');
        if (!loginCard) return;
        if (document.getElementById('dealer-password-input')) return;

        var codeField = document.getElementById('dealer-code-input').closest('.field');

        var userField = document.createElement('div');
        userField.className = 'field';
        userField.innerHTML =
            '<label for="dealer-username-input">Username</label>' +
            '<input type="text" id="dealer-username-input" ' +
            'placeholder="Enter username" autocomplete="username" ' +
            'style="text-transform:none; letter-spacing:normal; text-align:left;">' +
            '<div class="help-text">Your login username (provided by AmeriDex)</div>';
        codeField.parentNode.insertBefore(userField, codeField.nextSibling);

        var pwField = document.createElement('div');
        pwField.className = 'field';
        pwField.innerHTML =
            '<label for="dealer-password-input">Password</label>' +
            '<input type="password" id="dealer-password-input" ' +
            'placeholder="Enter password" autocomplete="current-password" ' +
            'style="text-transform:none; letter-spacing:normal; text-align:left;">' +
            '<div class="help-text">Contact AmeriDex if you need a password reset</div>';
        userField.parentNode.insertBefore(pwField, userField.nextSibling);

        var subtitle = loginCard.querySelector('.subtitle');
        if (subtitle) {
            subtitle.textContent = 'Enter your dealer code, username, and password to continue';
        }

        var errorEl = document.getElementById('dealer-code-error');
        if (errorEl) {
            errorEl.textContent = 'Invalid credentials';
        }

        var codeInput = document.getElementById('dealer-code-input');
        codeInput.style.textTransform = 'uppercase';

        document.getElementById('dealer-username-input').addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                var pwInput = document.getElementById('dealer-password-input');
                if (pwInput && !pwInput.value) { pwInput.focus(); } else { handleServerLogin(); }
            }
        });
        document.getElementById('dealer-password-input').addEventListener('keypress', function (e) {
            if (e.key === 'Enter') handleServerLogin();
        });
    }


    // ----------------------------------------------------------
    // 2. INJECT HEADER BADGES (Tier + Admin)
    // ----------------------------------------------------------
    function injectHeaderElements() {
        var headerActions = document.querySelector('.header-actions');
        if (!headerActions) return;

        if (!document.getElementById('header-tier-badge')) {
            var tierBadge = document.createElement('span');
            tierBadge.id = 'header-tier-badge';
            tierBadge.style.cssText =
                'font-size:0.7rem; font-weight:600; background:rgba(255,255,255,0.2);' +
                'padding:0.2rem 0.6rem; border-radius:999px; text-transform:uppercase;' +
                'letter-spacing:0.08em; display:none; margin-right:0.25rem;';
            var dealerInfo = document.getElementById('header-dealer-code');
            headerActions.insertBefore(tierBadge, dealerInfo);
        }

        if (!document.getElementById('admin-btn')) {
            var adminBtn = document.createElement('button');
            adminBtn.type = 'button';
            adminBtn.className = 'header-btn';
            adminBtn.id = 'admin-btn';
            adminBtn.textContent = 'Admin';
            adminBtn.style.cssText =
                'display:none; background:rgba(220,38,38,0.2);' +
                'border-color:rgba(220,38,38,0.4);';
            adminBtn.addEventListener('click', function () {
                if (typeof window.toggleAdminPanel === 'function') {
                    window.toggleAdminPanel();
                } else {
                    alert('Admin panel will be available in the next update.');
                }
            });
            var settingsBtn = document.getElementById('settings-btn');
            headerActions.insertBefore(adminBtn, settingsBtn);
        }
    }


    // ----------------------------------------------------------
    // 3. INJECT CHANGE PASSWORD INTO SETTINGS MODAL
    // ----------------------------------------------------------
    function injectChangePassword() {
        var settingsContent = document.querySelector('.settings-modal-content');
        if (!settingsContent || document.getElementById('settings-change-pw-section')) return;

        var section = document.createElement('div');
        section.className = 'settings-section';
        section.id = 'settings-change-pw-section';
        section.innerHTML =
            '<h3>Change Password</h3>' +
            '<div class="field" style="margin-bottom:0.75rem;">' +
                '<label for="settings-current-pw">Current Password</label>' +
                '<input type="password" id="settings-current-pw" placeholder="Enter current password" ' +
                'style="text-transform:none; letter-spacing:normal;">' +
            '</div>' +
            '<div class="field" style="margin-bottom:0.75rem;">' +
                '<label for="settings-new-pw">New Password</label>' +
                '<input type="password" id="settings-new-pw" placeholder="Min 8 characters" ' +
                'style="text-transform:none; letter-spacing:normal;">' +
            '</div>' +
            '<div class="field">' +
                '<label for="settings-confirm-pw">Confirm New Password</label>' +
                '<input type="password" id="settings-confirm-pw" placeholder="Re-enter password" ' +
                'style="text-transform:none; letter-spacing:normal;">' +
            '</div>' +
            '<div id="pw-change-error" style="color:var(--danger);font-size:0.85rem;margin-top:0.5rem;display:none;"></div>' +
            '<div id="pw-change-success" style="color:var(--success);font-size:0.85rem;margin-top:0.5rem;display:none;"></div>';

        var actionsRow = settingsContent.querySelector('.settings-actions');
        settingsContent.insertBefore(section, actionsRow);
    }


    // ----------------------------------------------------------
    // 4. LOGIN: SERVER AUTH
    // ----------------------------------------------------------
    function showLoginError(msg) {
        var errorEl = document.getElementById('dealer-code-error');
        if (errorEl) {
            errorEl.textContent = msg;
            errorEl.style.display = 'block';
        }
    }

    function hideLoginError() {
        var errorEl = document.getElementById('dealer-code-error');
        if (errorEl) errorEl.style.display = 'none';
    }

    function handleServerLogin() {
        var codeInput = document.getElementById('dealer-code-input');
        var userInput = document.getElementById('dealer-username-input');
        var pwInput = document.getElementById('dealer-password-input');
        var loginBtn = document.getElementById('login-btn');
        var code = codeInput.value.trim().toUpperCase();
        var username = userInput ? userInput.value.trim() : '';
        var password = pwInput ? pwInput.value : '';

        hideLoginError();

        if (!code || code.length !== 6) {
            showLoginError('Dealer code must be 6 characters');
            codeInput.focus();
            return;
        }
        if (!username) {
            showLoginError('Username is required');
            if (userInput) userInput.focus();
            return;
        }
        if (!password) {
            showLoginError('Password is required');
            if (pwInput) pwInput.focus();
            return;
        }

        loginBtn.textContent = 'Signing in...';
        loginBtn.disabled = true;

        api('POST', '/api/auth/login', {
            dealerCode: code,
            username: username,
            password: password
        }, { skipAuthRedirect: true })
            .then(function (data) {
                _authToken = data.token;
                sessionStorage.setItem('ameridex-token', data.token);

                _currentUser = data.user;
                _currentDealer = data.dealer;
                _currentDealer.role = data.user.role;

                window.dealerSettings.dealerCode = data.dealer.dealerCode;
                window.dealerSettings.dealerName = data.dealer.dealerName || '';
                window.dealerSettings.dealerContact = data.dealer.contactPerson || '';
                window.dealerSettings.dealerPhone = data.dealer.phone || '';
                window.dealerSettings.lastLogin = new Date().toISOString();
                window.dealerSettings.role = data.user.role;
                saveDealerSettings();

                applyTierPricing();

                loadServerQuotes().then(function () {
                    showMainApp();
                    updateHeaderForDealer();
                    renderSavedQuotes();
                    loginBtn.textContent = 'Enter Portal';
                    loginBtn.disabled = false;
                    if (pwInput) pwInput.value = '';
                    console.log('[Auth] Logged in as ' + data.user.username + ' (' + data.user.role + ') | Dealer: ' + data.dealer.dealerCode);
                    dispatchLoginEvent();
                });
            })
            .catch(function (err) {
                loginBtn.textContent = 'Enter Portal';
                loginBtn.disabled = false;

                if (!_serverOnline) {
                    if (validateDealerCode(code)) {
                        showLoginError('Server unavailable. Logging in offline mode (limited features).');
                        window.dealerSettings.dealerCode = code;
                        window.dealerSettings.lastLogin = new Date().toISOString();
                        saveDealerSettings();
                        setTimeout(function () {
                            showMainApp();
                            renderSavedQuotes();
                        }, 1500);
                    } else {
                        showLoginError('Invalid dealer code format');
                    }
                } else {
                    showLoginError(err.message || 'Invalid credentials');
                    if (pwInput) { pwInput.value = ''; pwInput.focus(); }
                }
            });
    }

    function updateHeaderForDealer() {
        if (!_currentDealer) return;

        var dealerDisplay = _currentDealer.dealerName
            ? _currentDealer.dealerCode + ' | ' + _currentDealer.dealerName
            : 'Dealer ' + _currentDealer.dealerCode;
        document.getElementById('header-dealer-code').textContent = dealerDisplay;

        var tierBadge = document.getElementById('header-tier-badge');
        if (tierBadge && _currentDealer.pricingTier) {
            tierBadge.textContent = _currentDealer.pricingTier;
            tierBadge.style.display = 'inline-block';
            if (_currentDealer.pricingTier === 'vip') {
                tierBadge.style.background = 'rgba(250,204,21,0.3)';
                tierBadge.style.color = '#fef9c3';
            } else if (_currentDealer.pricingTier === 'preferred') {
                tierBadge.style.background = 'rgba(34,197,94,0.25)';
                tierBadge.style.color = '#dcfce7';
            }
        }

        var adminBtn = document.getElementById('admin-btn');
        if (adminBtn) {
            adminBtn.style.display = (_currentDealer.role === 'admin') ? 'inline-block' : 'none';
        }
    }


    // ----------------------------------------------------------
    // 5. TIER PRICING: Fetch and apply
    // ----------------------------------------------------------
    function isValidPrice(val) {
        if (val === undefined || val === null) return false;
        var n = Number(val);
        return !isNaN(n) && isFinite(n);
    }

    function applyTierPricing() {
        return api('GET', '/api/products')
            .then(function (data) {
                if (!data || !data.products) return;

                Object.keys(data.products).forEach(function (key) {
                    if (PRODUCTS[key] && isValidPrice(data.products[key].price)) {
                        PRODUCTS[key].price = parseFloat(data.products[key].price);
                    } else if (PRODUCTS[key] && !isValidPrice(data.products[key].price)) {
                        console.warn('[Pricing] Server returned invalid price for "' + key + '": ' + data.products[key].price + '. Keeping default: $' + PRODUCTS[key].price);
                    }
                });

                Object.values(PRODUCT_CONFIG.categories).forEach(function (cat) {
                    Object.keys(cat.products).forEach(function (prodKey) {
                        if (data.products[prodKey] && isValidPrice(data.products[prodKey].price)) {
                            cat.products[prodKey].price = parseFloat(data.products[prodKey].price);
                        }
                    });
                });

                window._currentTier = data.tier;
                console.log('[Pricing] Tier: ' + data.tier.label + ' (x' + data.tier.multiplier + ')');

                if (window.currentQuote.lineItems.length > 0) {
                    render();
                    updateTotalAndFasteners();
                }
            })
            .catch(function (err) {
                console.warn('[Pricing] Could not load tier pricing, using defaults:', err.message);
            });
    }

    window.applyTierPricing = applyTierPricing;


    // ----------------------------------------------------------
    // 6a. SERVER-TO-FRONTEND MAPPING HELPERS (v2.9)
    // ----------------------------------------------------------
    function mapServerCustomerToFrontend(serverCustomer) {
        if (!serverCustomer) {
            return { name: '', email: '', zipCode: '', company: '', phone: '' };
        }
        var c = serverCustomer;
        return {
            name:    c.name || c.customerName || c.customer_name || '',
            email:   c.email || c.customerEmail || c.customer_email || '',
            zipCode: c.zipCode || c.zipcode || c.zip_code || c.zip || '',
            company: c.company || c.companyName || c.company_name || '',
            phone:   c.phone || c.phoneNumber || c.phone_number || ''
        };
    }

    function mapServerLineItemToFrontend(serverItem) {
        if (!serverItem) return null;
        var li = serverItem;

        var type = li.type || li.productId || 'custom';

        if (typeof PRODUCTS !== 'undefined' && !PRODUCTS[type]) {
            console.warn('[v2.9] Unknown product type "' + type + '", falling back to custom');
            type = 'custom';
        }

        var prod = (typeof PRODUCTS !== 'undefined' && PRODUCTS[type])
            ? PRODUCTS[type] : null;

        var qty = parseInt(li.qty, 10) || parseInt(li.quantity, 10) || 1;

        var length = li.length;
        if (length === null || length === undefined) {
            if (type === 'dexerdry') {
                length = 240;
            } else if (prod && prod.isFt) {
                length = 16;
            } else {
                length = null;
            }
        }

        var customLength = li.customLength || null;
        if (customLength !== null) {
            customLength = parseFloat(customLength) || null;
        }

        var color = li.color || li.color1 || '';
        if (!color && prod && prod.hasColor) {
            color = window.selectedColor1 || 'Driftwood';
        }

        var customDesc = li.customDesc || li.productName || '';
        var customUnitPrice = parseFloat(li.customUnitPrice) || 0;

        if (type === 'custom' && customUnitPrice === 0 && li.basePrice) {
            customUnitPrice = parseFloat(li.basePrice) || 0;
        }

        var priceOverride = li.priceOverride || null;
        var unitPrice = li.unitPrice || null;

        return {
            type:            type,
            qty:             qty,
            length:          length,
            customLength:    customLength,
            color:           color,
            color2:          li.color2 || '',
            customDesc:      customDesc,
            customUnitPrice: customUnitPrice,
            priceOverride:   priceOverride,
            unitPrice:       unitPrice
        };
    }


    // ----------------------------------------------------------
    // 6b. QUOTE SYNC: Server with localStorage fallback
    // ----------------------------------------------------------
    function loadServerQuotes() {
        return api('GET', '/api/quotes')
            .then(function (serverQuotes) {
                var localOnly = window.savedQuotes.filter(function (lq) {
                    return !lq._serverId && lq.lineItems.length > 0;
                });

                window.savedQuotes = serverQuotes.map(function (sq) {
                    var mappedLineItems = (sq.lineItems || []).map(function (serverLI) {
                        var mapped = mapServerLineItemToFrontend(serverLI);
                        return mapped || serverLI;
                    }).filter(function (li) { return li !== null; });

                    var mappedCustomer = mapServerCustomerToFrontend(sq.customer);

                    return {
                        _serverId:           sq.id,
                        quoteId:             sq.quoteNumber,
                        status:              sq.status,
                        customer:            mappedCustomer,
                        lineItems:           mappedLineItems,
                        options:             sq.options || { pictureFrame: false, stairs: false },
                        specialInstructions: sq.specialInstructions || '',
                        internalNotes:       sq.internalNotes || '',
                        shippingAddress:     sq.shippingAddress || '',
                        deliveryDate:        sq.deliveryDate || '',
                        createdAt:           sq.createdAt,
                        updatedAt:           sq.updatedAt,
                        submittedAt:         sq.submittedAt
                    };
                });

                localOnly.forEach(function (lq) {
                    window.savedQuotes.push(lq);
                    syncQuoteToServer(lq);
                });

                saveToStorage();
                console.log('[Quotes v2.9] Loaded ' + window.savedQuotes.length + ' quotes with reverse-mapped line items');
                return window.savedQuotes;
            })
            .catch(function () {
                console.warn('[Quotes] Using localStorage quotes (offline)');
                return window.savedQuotes;
            });
    }

    function syncQuoteToServer(quote) {
        if (!_authToken) return Promise.resolve(null);

        var tierMultiplier = (window._currentTier && window._currentTier.multiplier)
            ? window._currentTier.multiplier : 1;

        var mappedLineItems = quote.lineItems.map(function (li) {
            var prod = (typeof PRODUCTS !== 'undefined' && PRODUCTS[li.type])
                ? PRODUCTS[li.type] : null;
            var tierAdjustedPrice = (typeof getItemPrice === 'function') ? getItemPrice(li) : 0;
            var subtotal = (typeof getItemSubtotal === 'function') ? getItemSubtotal(li) : 0;

            var originalBase;
            if (li.type === 'custom' || !prod) {
                originalBase = parseFloat(li.customUnitPrice) || tierAdjustedPrice;
            } else if (tierMultiplier && tierMultiplier !== 1) {
                originalBase = Math.round((tierAdjustedPrice / tierMultiplier) * 100) / 100;
            } else {
                originalBase = tierAdjustedPrice;
            }

            return {
                productId: li.productId || li.type || '',
                productName: li.productName || (prod ? prod.name : '') || li.type || 'Custom Item',
                basePrice: originalBase,
                price: originalBase,
                quantity: parseInt(li.qty, 10) || parseInt(li.quantity, 10) || 1,
                length: li.length || null,
                customLength: li.customLength || null,
                total: subtotal,
                unitPrice: li.unitPrice || null,
                customUnitPrice: li.customUnitPrice || null,
                priceOverride: li.priceOverride || null,
                type: li.type || '',
                color: li.color || li.color1 || '',
                color2: li.color2 || ''
            };
        });

        var payload = {
            quoteNumber: quote.quoteId,
            customer: quote.customer,
            lineItems: mappedLineItems,
            options: quote.options,
            specialInstructions: quote.specialInstructions,
            internalNotes: quote.internalNotes,
            shippingAddress: quote.shippingAddress,
            deliveryDate: quote.deliveryDate,
            totalAmount: quote.lineItems.reduce(function (sum, li) {
                return sum + ((typeof getItemSubtotal === 'function') ? getItemSubtotal(li) : 0);
            }, 0)
        };

        if (quote._serverId) {
            return api('PUT', '/api/quotes/' + quote._serverId, payload)
                .then(function (updated) {
                    quote._serverId = updated.id;
                    quote.status = updated.status;
                    return updated;
                })
                .catch(function (err) {
                    console.warn('[Sync] Update failed, queued:', err.message);
                    return null;
                });
        } else {
            return api('POST', '/api/quotes', payload)
                .then(function (created) {
                    quote._serverId = created.id;
                    quote.status = created.status;
                    return created;
                })
                .catch(function (err) {
                    console.warn('[Sync] Create failed, queued:', err.message);
                    return null;
                });
        }
    }


    // ----------------------------------------------------------
    // 7. OVERRIDE: saveCurrentQuote (server + local)
    // ----------------------------------------------------------
    var _origSaveCurrentQuote = window.saveCurrentQuote;
    window.saveCurrentQuote = function () {
        if (typeof window.syncQuoteFromDOM === 'function') {
            window.syncQuoteFromDOM();
        }

        if (!window.currentQuote.quoteId) {
            window.currentQuote.quoteId = generateQuoteNumber();
        }

        var existingIdx = window.savedQuotes.findIndex(function (q) {
            return (window.currentQuote._serverId && q._serverId &&
                    String(q._serverId) === String(window.currentQuote._serverId))
                || q.quoteId === window.currentQuote.quoteId;
        });

        var quoteData = JSON.parse(JSON.stringify(window.currentQuote));
        quoteData.updatedAt = new Date().toISOString();

        if (existingIdx >= 0) {
            if (!quoteData._serverId && window.savedQuotes[existingIdx]._serverId) {
                quoteData._serverId = window.savedQuotes[existingIdx]._serverId;
            }
            window.savedQuotes[existingIdx] = quoteData;
        } else {
            quoteData.createdAt = new Date().toISOString();
            window.savedQuotes.push(quoteData);
            existingIdx = window.savedQuotes.length - 1;
        }

        saveToStorage();
        updateCustomerHistory();

        try {
            renderSavedQuotes();
        } catch (e) {
            console.warn('[API v2.6] renderSavedQuotes() skipped (DOM elements removed):', e.message);
        }

        syncQuoteToServer(window.savedQuotes[existingIdx]);

        return window.currentQuote.quoteId;
    };


    // ----------------------------------------------------------
    // 8. OVERRIDE: handleLogin (use server auth)
    // ----------------------------------------------------------
    document.getElementById('login-btn').onclick = null;
    document.getElementById('login-btn').addEventListener('click', handleServerLogin);

    document.getElementById('dealer-code-input').onkeypress = null;
    document.getElementById('dealer-code-input').addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            var userInput = document.getElementById('dealer-username-input');
            if (userInput && !userInput.value) {
                userInput.focus();
            } else {
                var pwInput = document.getElementById('dealer-password-input');
                if (pwInput && !pwInput.value) {
                    pwInput.focus();
                } else {
                    handleServerLogin();
                }
            }
        }
    });


    // ----------------------------------------------------------
    // 9. OVERRIDE: handleLogout (clear session)
    // ----------------------------------------------------------
    var _origHandleLogout = window.handleLogout;
    window.handleLogout = function () {
        if (window.currentQuote.lineItems.length > 0 || document.getElementById('cust-name').value.trim()) {
            if (!confirm('Are you sure you want to log out? Any unsaved changes will be lost.')) {
                return;
            }
        }

        if (_authToken) {
            api('POST', '/api/auth/logout', null, { skipAuthRedirect: true }).catch(function () {});
        }

        _authToken = null;
        _currentUser = null;
        _currentDealer = null;
        sessionStorage.removeItem('ameridex-token');

        clearTimeout(window.idleTimer);
        clearTimeout(window.warningTimer);
        clearInterval(window.countdownInterval);

        window.dealerSettings.dealerCode = '';
        window.dealerSettings.role = '';
        saveDealerSettings();

        resetFormOnly();

        document.getElementById('dealer-code-input').value = '';
        var userInput = document.getElementById('dealer-username-input');
        if (userInput) userInput.value = '';
        var pwInput = document.getElementById('dealer-password-input');
        if (pwInput) pwInput.value = '';

        var adminBtn = document.getElementById('admin-btn');
        if (adminBtn) adminBtn.style.display = 'none';

        var tierBadge = document.getElementById('header-tier-badge');
        if (tierBadge) tierBadge.style.display = 'none';

        document.querySelectorAll('.role-injected').forEach(function (el) { el.remove(); });

        document.getElementById('main-app').classList.add('app-hidden');
        document.getElementById('login-screen').style.display = 'flex';
        document.getElementById('dealer-code-input').focus();
    };


    // ----------------------------------------------------------
    // 10. OVERRIDE: deleteQuote (server + local)
    // ----------------------------------------------------------
    var _origRenderSavedQuotes = window.renderSavedQuotes;
    window.deleteQuoteFromServer = function (quote) {
        if (quote._serverId && _authToken) {
            api('DELETE', '/api/quotes/' + quote._serverId).catch(function (err) {
                console.warn('[Delete] Server delete failed:', err.message);
            });
        }
    };


    // ----------------------------------------------------------
    // 11. OVERRIDE: sendFormalRequest (server submit)
    // ----------------------------------------------------------
    var _origSendFormalRequest = window.sendFormalRequest;
    window.sendFormalRequest = function () {
        var quoteId = saveCurrentQuote();

        var quote = window.savedQuotes.find(function (q) {
            return q.quoteId === quoteId;
        });

        if (quote && quote._serverId && _authToken) {
            api('POST', '/api/quotes/' + quote._serverId + '/submit')
                .then(function (result) {
                    quote.status = 'submitted';
                    saveToStorage();

                    document.getElementById('reviewModal').classList.remove('active');
                    document.getElementById('success-order-number').textContent = quoteId;
                    document.getElementById('success-confirmation').classList.add('visible');

                    console.log('[Submit] Quote ' + quoteId + ' submitted to server');
                })
                .catch(function (err) {
                    console.warn('[Submit] Server submit failed, falling back to email:', err.message);
                    if (typeof _origSendFormalRequest === 'function') {
                        _origSendFormalRequest();
                    }
                });
        } else {
            if (typeof _origSendFormalRequest === 'function') {
                _origSendFormalRequest();
            }
        }
    };


    // ----------------------------------------------------------
    // 12. OVERRIDE: Settings save (server + local + password)
    // ----------------------------------------------------------
    document.getElementById('settings-save').onclick = null;
    document.getElementById('settings-save').addEventListener('click', function () {
        var newName = document.getElementById('settings-dealer-name').value.trim();
        var newContact = document.getElementById('settings-dealer-contact').value.trim();
        var newPhone = document.getElementById('settings-dealer-phone').value.trim();

        window.dealerSettings.dealerName = newName;
        window.dealerSettings.dealerContact = newContact;
        window.dealerSettings.dealerPhone = newPhone;
        saveDealerSettings();

        if (_authToken) {
            api('PUT', '/api/dealer/profile', {
                dealerName: newName,
                contactPerson: newContact,
                phone: newPhone
            }).then(function (updated) {
                if (_currentDealer) {
                    _currentDealer.dealerName = updated.dealerName;
                    _currentDealer.contactPerson = updated.contactPerson;
                    _currentDealer.phone = updated.phone;
                }
                updateHeaderForDealer();
            }).catch(function (err) {
                console.warn('[Settings] Server update failed:', err.message);
            });
        }

        var currentPw = document.getElementById('settings-current-pw');
        var newPw = document.getElementById('settings-new-pw');
        var confirmPw = document.getElementById('settings-confirm-pw');
        var pwError = document.getElementById('pw-change-error');
        var pwSuccess = document.getElementById('pw-change-success');

        if (newPw && newPw.value) {
            pwError.style.display = 'none';
            pwSuccess.style.display = 'none';

            if (!currentPw || !currentPw.value) {
                pwError.textContent = 'Current password is required';
                pwError.style.display = 'block';
                return;
            }
            if (newPw.value.length < 8) {
                pwError.textContent = 'Password must be at least 8 characters';
                pwError.style.display = 'block';
                return;
            }
            if (newPw.value !== confirmPw.value) {
                pwError.textContent = 'Passwords do not match';
                pwError.style.display = 'block';
                return;
            }

            if (_authToken) {
                api('POST', '/api/auth/change-password', {
                    currentPassword: currentPw.value,
                    newPassword: newPw.value
                }).then(function () {
                    pwSuccess.textContent = 'Password changed successfully!';
                    pwSuccess.style.display = 'block';
                    currentPw.value = '';
                    newPw.value = '';
                    confirmPw.value = '';
                    setTimeout(function () { pwSuccess.style.display = 'none'; }, 3000);
                }).catch(function (err) {
                    pwError.textContent = err.message || 'Failed to change password';
                    pwError.style.display = 'block';
                });
            }
            return;
        }

        document.getElementById('settingsModal').classList.remove('active');
        alert('Settings saved!');
    });


    // ----------------------------------------------------------
    // 13. OVERRIDE: saveAndClose
    // ----------------------------------------------------------
    window.saveAndClose = function () {
        document.getElementById('timeout-warning').classList.remove('visible');
        clearInterval(window.countdownInterval);

        if (typeof window.syncQuoteFromDOM === 'function') {
            window.syncQuoteFromDOM();
        }

        if (window.currentQuote.lineItems.length > 0 || document.getElementById('cust-name').value.trim()) {
            var quoteId = saveCurrentQuote();
            alert('Quote saved! ID: ' + quoteId);
        }

        resetFormOnly();
    };


    // ----------------------------------------------------------
    // 14. OVERRIDE: renderSavedQuotes (status badges + duplicate)
    // ----------------------------------------------------------
    window.renderSavedQuotes = function () {
        var list = document.getElementById('saved-quotes-list');

        if (!list) {
            return;
        }

        var searchEl = document.getElementById('quote-search');
        var searchQuery = (searchEl ? searchEl.value : '').toLowerCase();
        var filtered = window.savedQuotes;

        if (searchQuery) {
            filtered = window.savedQuotes.filter(function (q) {
                return (q.customer.name && q.customer.name.toLowerCase().includes(searchQuery))
                    || (q.customer.company && q.customer.company.toLowerCase().includes(searchQuery))
                    || (q.quoteId && q.quoteId.toLowerCase().includes(searchQuery));
            });
        }

        filtered.sort(function (a, b) {
            return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
        });

        if (filtered.length === 0) {
            list.innerHTML = '<div class="no-saved-quotes">' +
                (searchQuery ? 'No quotes match your search' : 'No saved quotes yet') + '</div>';
            return;
        }

        list.innerHTML = '';

        filtered.forEach(function (quote, idx) {
            var item = document.createElement('div');
            item.className = 'saved-quote-item';
            var dateStr = new Date(quote.updatedAt || quote.createdAt).toLocaleDateString();
            var total = quote.lineItems.reduce(function (sum, li) {
                return sum + getItemSubtotal(li);
            }, 0);

            var statusHTML = '';
            var status = quote.status || 'draft';
            var statusColors = {
                draft: 'background:#f3f4f6;color:#374151;',
                submitted: 'background:#dbeafe;color:#1d4ed8;',
                reviewed: 'background:#fef3c7;color:#92400e;',
                approved: 'background:#dcfce7;color:#16a34a;',
                revision: 'background:#fee2e2;color:#dc2626;'
            };
            statusHTML = '<span style="display:inline-block;padding:0.15rem 0.5rem;border-radius:999px;' +
                'font-size:0.7rem;font-weight:600;text-transform:uppercase;margin-left:0.5rem;' +
                (statusColors[status] || statusColors.draft) + '">' +
                status + '</span>';

            var editable = ['draft', 'revision'].includes(status);
            var syncIndicator = quote._serverId
                ? '<span title="Synced to server" style="color:#16a34a;font-size:0.7rem;margin-left:0.35rem;">&#9679;</span>'
                : '<span title="Local only" style="color:#f59e0b;font-size:0.7rem;margin-left:0.35rem;">&#9679;</span>';

            item.innerHTML =
                '<div class="saved-quote-info">' +
                    '<div class="saved-quote-id">' +
                        escapeHTML(quote.quoteId || 'Draft') + statusHTML + syncIndicator +
                    '</div>' +
                    '<div class="saved-quote-customer">' +
                        (escapeHTML(quote.customer.name) || 'No name') +
                        (quote.customer.company ? ' &middot; ' + escapeHTML(quote.customer.company) : '') +
                    '</div>' +
                    '<div class="saved-quote-date">' + dateStr + ' &middot; ' + quote.lineItems.length + ' items</div>' +
                '</div>' +
                '<div class="saved-quote-total">$' + formatCurrency(total) + '</div>' +
                '<div class="saved-quote-actions">' +
                    (editable
                        ? '<button type="button" class="btn-load" data-idx="' + idx + '">Load</button>'
                        : '<button type="button" class="btn-load" data-idx="' + idx + '" title="Read-only (submitted)">View</button>') +
                    '<button type="button" class="btn-load" data-idx="' + idx + '" data-action="duplicate" ' +
                        'style="background:#f0fdf4;color:#16a34a;">Copy</button>' +
                    (status === 'draft'
                        ? '<button type="button" class="btn-delete-quote" data-idx="' + idx + '">Delete</button>'
                        : '') +
                '</div>';

            list.appendChild(item);
        });

        list.querySelectorAll('.btn-load').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var i = parseInt(btn.getAttribute('data-idx'), 10);
                var action = btn.getAttribute('data-action');

                if (action === 'duplicate') {
                    duplicateQuote(filtered[i]);
                } else {
                    if (typeof window.loadQuote === 'function') {
                        var realIdx = window.savedQuotes.indexOf(filtered[i]);
                        if (realIdx > -1) window.loadQuote(realIdx);
                    }
                }
            });
        });

        list.querySelectorAll('.btn-delete-quote').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var i = parseInt(btn.getAttribute('data-idx'), 10);
                if (confirm('Delete this quote?')) {
                    var quote = filtered[i];
                    deleteQuoteFromServer(quote);
                    var qIdx = window.savedQuotes.indexOf(quote);
                    if (qIdx > -1) window.savedQuotes.splice(qIdx, 1);
                    saveToStorage();
                    renderSavedQuotes();
                }
            });
        });
    };


    // ----------------------------------------------------------
    // 14b. OVERRIDE: loadQuote (full field restoration) (v2.15)
    // ----------------------------------------------------------
    // The inline loadQuote(idx) in dealer-portal.html only restores
    // 5 customer fields. It does NOT restore:
    //   - pic-frame checkbox
    //   - stairs checkbox
    //   - special-instr textarea
    //   - internal-notes textarea
    //   - ship-addr textarea
    //   - del-date input
    //
    // This override deep-clones savedQuotes[idx] into currentQuote
    // (same as the inline version), then calls restoreQuoteToDOM()
    // which sets ALL 11 fields consistently.
    // ----------------------------------------------------------
    window.loadQuote = function (idx) {
        if (idx < 0 || idx >= window.savedQuotes.length) {
            console.warn('[v2.15] loadQuote: invalid index ' + idx);
            return;
        }

        if (window.currentQuote.lineItems.length > 0) {
            if (!confirm('Loading this quote will replace your current work. Continue?')) return;
        }

        // Deep-clone the saved quote into currentQuote
        var source = window.savedQuotes[idx];
        window.currentQuote = JSON.parse(JSON.stringify(source));

        // Restore all 11 DOM fields via the shared helper
        restoreQuoteToDOM(window.currentQuote);

        console.log('[v2.15] loadQuote(' + idx + '): Loaded "'
            + (window.currentQuote.quoteId || 'Draft') + '" with '
            + window.currentQuote.lineItems.length + ' line items, all fields restored.');
    };


    // ----------------------------------------------------------
    // 15. QUOTE DUPLICATION
    // ----------------------------------------------------------
    function duplicateQuote(original) {
        if (window.currentQuote.lineItems.length > 0) {
            if (!confirm('This will replace your current work with a copy. Continue?')) return;
        }

        window.currentQuote = {
            quoteId: null,
            status: 'draft',
            customer: { name: '', email: '', zipCode: '', company: '', phone: '' },
            lineItems: JSON.parse(JSON.stringify(original.lineItems)),
            options: JSON.parse(JSON.stringify(original.options || { pictureFrame: false, stairs: false })),
            specialInstructions: original.specialInstructions || '',
            internalNotes: '',
            shippingAddress: '',
            deliveryDate: ''
        };

        // Use shared helper for full DOM restoration
        restoreQuoteToDOM(window.currentQuote);

        document.getElementById('customer').scrollIntoView({ behavior: 'smooth' });

        if (original._serverId && _authToken) {
            api('POST', '/api/quotes/' + original._serverId + '/duplicate')
                .then(function (dup) {
                    window.currentQuote._serverId = dup.id;
                    console.log('[Duplicate] Server copy created:', dup.id);
                })
                .catch(function () {
                    console.warn('[Duplicate] Server duplication failed, will sync on save');
                });
        }
    }


    // ----------------------------------------------------------
    // 16. AUTO-RESUME SESSION ON PAGE LOAD
    // ----------------------------------------------------------
    function tryResumeSession() {
        if (!_authToken) return;

        api('GET', '/api/auth/me', null, { skipAuthRedirect: true })
            .then(function (data) {
                _currentUser = data.user;
                _currentDealer = data.dealer;
                _currentDealer.role = data.user.role;

                window.dealerSettings.dealerCode = data.dealer.dealerCode;
                window.dealerSettings.dealerName = data.dealer.dealerName || '';
                window.dealerSettings.dealerContact = data.dealer.contactPerson || '';
                window.dealerSettings.dealerPhone = data.dealer.phone || '';
                window.dealerSettings.role = data.user.role;
                saveDealerSettings();

                return applyTierPricing().then(function () {
                    return loadServerQuotes();
                });
            })
            .then(function () {
                showMainApp();
                updateHeaderForDealer();
                renderSavedQuotes();
                console.log('[Session] Resumed as ' + _currentUser.username + ' (' + _currentUser.role + ')');
                dispatchLoginEvent();
            })
            .catch(function () {
                sessionStorage.removeItem('ameridex-token');
                _authToken = null;
                _currentUser = null;
                _currentDealer = null;
                showLoginScreen();
            });
    }


    // ----------------------------------------------------------
    // 17. ONLINE/OFFLINE SYNC
    // ----------------------------------------------------------
    window.addEventListener('online', function () {
        _serverOnline = true;
        console.log('[Network] Back online, syncing...');
        window.savedQuotes.forEach(function (q) {
            if (!q._serverId && q.lineItems.length > 0) {
                syncQuoteToServer(q);
            }
        });
    });


    // ----------------------------------------------------------
    // 18. LOAD QUOTE FROM URL PARAM (?quoteId=) (v2.16)
    // ----------------------------------------------------------
    function loadQuoteFromUrlParam() {
        var urlParams = new URLSearchParams(window.location.search);
        var serverId = urlParams.get('quoteId');
        if (!serverId) return;

        function applyQuoteToDOM(sq) {
            // v2.16: Restore mapServerLineItemToFrontend() mapping
            // that was removed in v2.14. Server field names (quantity,
            // productName, basePrice) must be converted to frontend
            // format (qty, customDesc, customUnitPrice) for render().
            var frontendLineItems = (sq.lineItems || []).map(function (serverLI) {
                return mapServerLineItemToFrontend(serverLI) || serverLI;
            }).filter(function (li) { return li !== null; });

            var mappedCustomer = mapServerCustomerToFrontend(sq.customer);

            // Write all fields to currentQuote
            window.currentQuote.quoteId             = sq.quoteNumber || sq.quoteId || null;
            window.currentQuote._serverId           = sq.id || sq._serverId || null;
            window.currentQuote.status              = sq.status || 'draft';
            window.currentQuote.customer            = mappedCustomer;
            window.currentQuote.lineItems           = frontendLineItems;
            window.currentQuote.options             = sq.options || { pictureFrame: false, stairs: false };
            window.currentQuote.specialInstructions = sq.specialInstructions || '';
            window.currentQuote.internalNotes       = sq.internalNotes || '';
            window.currentQuote.shippingAddress     = sq.shippingAddress || '';
            window.currentQuote.deliveryDate        = sq.deliveryDate || '';

            // v2.15: Use shared helper for full DOM restoration
            restoreQuoteToDOM(window.currentQuote);

            console.log('[v2.16] Loaded quote from URL param: '
                + (window.currentQuote.quoteId || serverId)
                + ' | ' + frontendLineItems.length + ' line items (mapped and restored)');

            try {
                var cleanUrl = window.location.pathname;
                window.history.replaceState(null, '', cleanUrl);
            } catch (e) { /* ignore */ }
        }

        function doLoad() {
            api('GET', '/api/quotes/' + serverId)
                .then(function (sq) {
                    applyQuoteToDOM(sq);
                })
                .catch(function (err) {
                    console.warn('[v2.16] Server fetch failed for quoteId=' + serverId + ', falling back to savedQuotes[]:', err.message);

                    var found = window.savedQuotes.find(function (q) {
                        return String(q._serverId) === String(serverId)
                            || String(q.quoteId)   === String(serverId);
                    });

                    if (found) {
                        applyQuoteToDOM(found);
                    } else {
                        console.error('[v2.16] Quote not found in savedQuotes[] either. quoteId=' + serverId);
                    }
                });
        }

        if (_authToken) {
            doLoad();
        } else {
            window.addEventListener('ameridex-login', function onLogin() {
                window.removeEventListener('ameridex-login', onLogin);
                doLoad();
            });
        }
    }


    // ----------------------------------------------------------
    // INIT
    // ----------------------------------------------------------
    injectLoginFields();
    injectHeaderElements();
    injectChangePassword();

    if (_authToken) {
        tryResumeSession();
    }

    loadQuoteFromUrlParam();

    console.log('[AmeriDex API] v2.16 loaded: Auth + API integration active.');
})();
