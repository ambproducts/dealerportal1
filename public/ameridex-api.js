// ============================================================
// AmeriDex Dealer Portal - API Integration Patch v2.23
// Date: 2026-03-05
// ============================================================
// REQUIRES: ameridex-patches.js (v1.0+) loaded first
//
// v2.23 Changes (2026-03-05):
//   - FIX: applyTierPricing() now calls window.backupPrices()
//     after updating PRODUCTS and PRODUCT_CONFIG from the server.
//     This prevents ameridex-pricing-fix.js healUndefinedPrices()
//     from reverting server prices back to stale hardcoded values.
//   - ADD: Dispatches 'ameridex-prices-loaded' event after tier
//     pricing is applied so other scripts can react.
//
// v2.22 Changes (2026-03-02):
//   - FIX: loadQuoteFromUrlParam() now ALWAYS waits for the
//     'ameridex-login' event before fetching. Previously, if
//     _authToken existed in sessionStorage, doLoad() fired
//     immediately, racing with tryResumeSession() which had
//     not yet finished hydrating _currentUser, _currentDealer,
//     or the dealer middleware. This caused 401/404 errors and
//     stale state when opening a quote via URL.
//   - Added 10-second safety timeout for the login listener.
//
// v2.21 Changes (2026-03-02):
//   - CLEANUP: Removed client-side Formspree fallback from
//     sendFormalRequest (section 11).
//     The server now handles all Formspree notification via
//     POST /api/quotes/:id/submit -> notifySubmissionViaFormspree().
//     The fallback path now shows a clear user-facing error
//     instead of silently attempting a browser-side email.
//     No Formspree form ID is ever present in the browser.
//
// v2.20 Changes (2026-03-02):
//   - FEAT: window.requestQuoteRevision() added.
//
// v2.19 Changes (2026-03-02):
//   - FIX: mapServerCustomerToFrontend() now includes address,
//     city, and state fields.
//   - FIX: restoreQuoteToDOM() now populates cust-address,
//     cust-city, cust-state and is exposed on window.
//
// v2.18 Changes (2026-03-01):
//   - CRITICAL FIX: saveCurrentQuote() no longer creates
//     duplicate quotes when _serverId exists but findIndex=-1.
//   - FIX: loadServerQuotes() re-links currentQuote after
//     rebuilding savedQuotes from server.
//   - FIX: syncQuoteToServer() blocks POST for server-format
//     quoteIds.
//
// v2.17 - v2.1: See previous changelogs.
// ============================================================

(function () {
    'use strict';

    var API_BASE = window.AMERIDEX_API_BASE || '';

    var _authToken    = sessionStorage.getItem('ameridex-token') || null;
    var _currentUser  = null;
    var _currentDealer = null;
    var _serverOnline = true;


    // ----------------------------------------------------------
    // API HELPER
    // ----------------------------------------------------------
    function api(method, path, body, options) {
        var opts = {
            method: method,
            headers: { 'Content-Type': 'application/json' }
        };
        if (_authToken) opts.headers['Authorization'] = 'Bearer ' + _authToken;
        if (body && method !== 'GET') opts.body = JSON.stringify(body);

        var skipAuthRedirect = (options && options.skipAuthRedirect) || false;

        return fetch(API_BASE + path, opts)
            .then(function (res) {
                _serverOnline = true;
                if (res.status === 401) {
                    if (!skipAuthRedirect) {
                        sessionStorage.removeItem('ameridex-token');
                        _authToken = null; _currentUser = null; _currentDealer = null;
                        showLoginScreen();
                        showLoginError('Session expired. Please log in again.');
                    }
                    return res.json().catch(function () { return {}; }).then(function (b) {
                        return Promise.reject(new Error(b.error || (skipAuthRedirect ? 'Invalid credentials' : 'Unauthorized')));
                    });
                }
                if (res.status === 403) {
                    return res.json().catch(function () { return {}; }).then(function (b) {
                        return Promise.reject(new Error(b.error || 'Access denied'));
                    });
                }
                if (!res.ok) {
                    return res.json().catch(function () { return {}; }).then(function (b) {
                        return Promise.reject(new Error(b.error || 'Request failed'));
                    });
                }
                var ct = res.headers.get('content-type') || '';
                if (ct.includes('text/csv')) return res.text();
                return res.json();
            })
            .catch(function (err) {
                if (['Unauthorized','Invalid credentials','Access denied'].indexOf(err.message) > -1) throw err;
                if (err.message === 'Failed to fetch' || err.name === 'TypeError') {
                    _serverOnline = false;
                    console.warn('[API] Server unreachable, falling back to localStorage');
                }
                throw err;
            });
    }

    window.ameridexAPI      = api;
    window.getAuthToken     = function () { return _authToken; };
    window.getCurrentDealer = function () { return _currentDealer; };
    window.getCurrentUser   = function () { return _currentUser; };


    // ----------------------------------------------------------
    // EVENT DISPATCH
    // ----------------------------------------------------------
    function dispatchLoginEvent() {
        try {
            window.dispatchEvent(new Event('ameridex-login'));
        } catch (e) {
            var evt = document.createEvent('Event');
            evt.initEvent('ameridex-login', true, true);
            window.dispatchEvent(evt);
        }
        console.log('[Auth] Dispatched ameridex-login event (role: ' + (_currentUser ? _currentUser.role : 'unknown') + ')');
    }

    function dispatchPricesLoadedEvent() {
        try {
            window.dispatchEvent(new Event('ameridex-prices-loaded'));
        } catch (e) {
            var evt = document.createEvent('Event');
            evt.initEvent('ameridex-prices-loaded', true, true);
            window.dispatchEvent(evt);
        }
        console.log('[Pricing] Dispatched ameridex-prices-loaded event.');
    }


    // ----------------------------------------------------------
    // SHARED HELPER: Restore quote to DOM (v2.19)
    // Includes address/city/state. Exposed on window.
    // ----------------------------------------------------------
    function restoreQuoteToDOM(quoteObj) {
        var c = quoteObj.customer || {};
        document.getElementById('cust-name').value    = c.name    || '';
        document.getElementById('cust-email').value   = c.email   || '';
        document.getElementById('cust-zip').value     = c.zipCode || '';
        document.getElementById('cust-company').value = c.company || '';
        document.getElementById('cust-phone').value   = c.phone   || '';

        var addrEl  = document.getElementById('cust-address');
        var cityEl  = document.getElementById('cust-city');
        var stateEl = document.getElementById('cust-state');
        if (addrEl)  addrEl.value  = c.address || '';
        if (cityEl)  cityEl.value  = c.city    || '';
        if (stateEl) stateEl.value = c.state   || '';

        var opts = quoteObj.options || { pictureFrame: false, stairs: false };
        document.getElementById('pic-frame').checked = !!opts.pictureFrame;
        document.getElementById('stairs').checked    = !!opts.stairs;
        var picFrameNote = document.getElementById('pic-frame-note');
        var stairsNote   = document.getElementById('stairs-note');
        if (picFrameNote) picFrameNote.style.display = opts.pictureFrame ? 'block' : 'none';
        if (stairsNote)   stairsNote.style.display   = opts.stairs       ? 'block' : 'none';

        document.getElementById('special-instr').value  = quoteObj.specialInstructions || '';
        document.getElementById('internal-notes').value = quoteObj.internalNotes       || '';
        document.getElementById('ship-addr').value      = quoteObj.shippingAddress     || '';
        document.getElementById('del-date').value       = quoteObj.deliveryDate        || '';

        render();
        updateTotalAndFasteners();
        if (typeof updateCustomerProgress === 'function') updateCustomerProgress();
    }
    window.restoreQuoteToDOM = restoreQuoteToDOM;


    // ----------------------------------------------------------
    // 1. LOGIN FIELD INJECTION
    // ----------------------------------------------------------
    function injectLoginFields() {
        var loginCard = document.querySelector('.login-card');
        if (!loginCard || document.getElementById('dealer-password-input')) return;

        var codeField = document.getElementById('dealer-code-input').closest('.field');

        var userField = document.createElement('div');
        userField.className = 'field';
        userField.innerHTML =
            '<label for="dealer-username-input">Username</label>' +
            '<input type="text" id="dealer-username-input" placeholder="Enter username" autocomplete="username" ' +
            'style="text-transform:none;letter-spacing:normal;text-align:left;">' +
            '<div class="help-text">Your login username (provided by AmeriDex)</div>';
        codeField.parentNode.insertBefore(userField, codeField.nextSibling);

        var pwField = document.createElement('div');
        pwField.className = 'field';
        pwField.innerHTML =
            '<label for="dealer-password-input">Password</label>' +
            '<input type="password" id="dealer-password-input" placeholder="Enter password" autocomplete="current-password" ' +
            'style="text-transform:none;letter-spacing:normal;text-align:left;">' +
            '<div class="help-text">Contact AmeriDex if you need a password reset</div>';
        userField.parentNode.insertBefore(pwField, userField.nextSibling);

        var subtitle = loginCard.querySelector('.subtitle');
        if (subtitle) subtitle.textContent = 'Enter your dealer code, username, and password to continue';

        var errorEl = document.getElementById('dealer-code-error');
        if (errorEl) errorEl.textContent = 'Invalid credentials';

        document.getElementById('dealer-code-input').style.textTransform = 'uppercase';

        document.getElementById('dealer-username-input').addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                var pw = document.getElementById('dealer-password-input');
                if (pw && !pw.value) pw.focus(); else handleServerLogin();
            }
        });
        document.getElementById('dealer-password-input').addEventListener('keypress', function (e) {
            if (e.key === 'Enter') handleServerLogin();
        });
    }


    // ----------------------------------------------------------
    // 2. HEADER BADGES
    // ----------------------------------------------------------
    function injectHeaderElements() {
        var headerActions = document.querySelector('.header-actions');
        if (!headerActions) return;

        if (!document.getElementById('header-tier-badge')) {
            var tierBadge = document.createElement('span');
            tierBadge.id = 'header-tier-badge';
            tierBadge.style.cssText =
                'font-size:0.7rem;font-weight:600;background:rgba(255,255,255,0.2);' +
                'padding:0.2rem 0.6rem;border-radius:999px;text-transform:uppercase;' +
                'letter-spacing:0.08em;display:none;margin-right:0.25rem;';
            headerActions.insertBefore(tierBadge, document.getElementById('header-dealer-code'));
        }

        if (!document.getElementById('admin-btn')) {
            var adminBtn = document.createElement('button');
            adminBtn.type = 'button';
            adminBtn.className = 'header-btn';
            adminBtn.id = 'admin-btn';
            adminBtn.textContent = 'Admin';
            adminBtn.style.cssText = 'display:none;background:rgba(220,38,38,0.2);border-color:rgba(220,38,38,0.4);';
            adminBtn.addEventListener('click', function () {
                if (typeof window.toggleAdminPanel === 'function') window.toggleAdminPanel();
                else alert('Admin panel will be available in the next update.');
            });
            headerActions.insertBefore(adminBtn, document.getElementById('settings-btn'));
        }
    }


    // ----------------------------------------------------------
    // 3. CHANGE PASSWORD IN SETTINGS
    // ----------------------------------------------------------
    function injectChangePassword() {
        var settingsContent = document.querySelector('.settings-modal-content');
        if (!settingsContent || document.getElementById('settings-change-pw-section')) return;

        var section = document.createElement('div');
        section.className = 'settings-section';
        section.id = 'settings-change-pw-section';
        section.innerHTML =
            '<h3>Change Password</h3>' +
            '<div class="field" style="margin-bottom:0.75rem;"><label for="settings-current-pw">Current Password</label>' +
            '<input type="password" id="settings-current-pw" placeholder="Enter current password" style="text-transform:none;letter-spacing:normal;"></div>' +
            '<div class="field" style="margin-bottom:0.75rem;"><label for="settings-new-pw">New Password</label>' +
            '<input type="password" id="settings-new-pw" placeholder="Min 8 characters" style="text-transform:none;letter-spacing:normal;"></div>' +
            '<div class="field"><label for="settings-confirm-pw">Confirm New Password</label>' +
            '<input type="password" id="settings-confirm-pw" placeholder="Re-enter password" style="text-transform:none;letter-spacing:normal;"></div>' +
            '<div id="pw-change-error" style="color:var(--danger);font-size:0.85rem;margin-top:0.5rem;display:none;"></div>' +
            '<div id="pw-change-success" style="color:var(--success);font-size:0.85rem;margin-top:0.5rem;display:none;"></div>';

        settingsContent.insertBefore(section, settingsContent.querySelector('.settings-actions'));
    }


    // ----------------------------------------------------------
    // 4. SERVER AUTH
    // ----------------------------------------------------------
    function showLoginError(msg) {
        var el = document.getElementById('dealer-code-error');
        if (el) { el.textContent = msg; el.style.display = 'block'; }
    }
    function hideLoginError() {
        var el = document.getElementById('dealer-code-error');
        if (el) el.style.display = 'none';
    }

    function handleServerLogin() {
        var code     = document.getElementById('dealer-code-input').value.trim().toUpperCase();
        var userInput = document.getElementById('dealer-username-input');
        var pwInput   = document.getElementById('dealer-password-input');
        var loginBtn  = document.getElementById('login-btn');
        var username  = userInput ? userInput.value.trim() : '';
        var password  = pwInput  ? pwInput.value : '';

        hideLoginError();
        if (!code || code.length !== 6) { showLoginError('Dealer code must be 6 characters'); return; }
        if (!username) { showLoginError('Username is required'); if (userInput) userInput.focus(); return; }
        if (!password) { showLoginError('Password is required'); if (pwInput) pwInput.focus(); return; }

        loginBtn.textContent = 'Signing in...';
        loginBtn.disabled = true;

        api('POST', '/api/auth/login', { dealerCode: code, username: username, password: password }, { skipAuthRedirect: true })
            .then(function (data) {
                _authToken = data.token;
                sessionStorage.setItem('ameridex-token', data.token);
                _currentUser   = data.user;
                _currentDealer = data.dealer;
                _currentDealer.role = data.user.role;

                window.dealerSettings.dealerCode    = data.dealer.dealerCode;
                window.dealerSettings.dealerName    = data.dealer.dealerName    || '';
                window.dealerSettings.dealerContact = data.dealer.contactPerson || '';
                window.dealerSettings.dealerPhone   = data.dealer.phone         || '';
                window.dealerSettings.lastLogin     = new Date().toISOString();
                window.dealerSettings.role          = data.user.role;
                saveDealerSettings();

                applyTierPricing();
                loadServerQuotes().then(function () {
                    showMainApp();
                    updateHeaderForDealer();
                    renderSavedQuotes();
                    loginBtn.textContent = 'Enter Portal';
                    loginBtn.disabled = false;
                    if (pwInput) pwInput.value = '';
                    console.log('[Auth] Logged in as', data.user.username, '(' + data.user.role + ') | Dealer:', data.dealer.dealerCode);
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
                        window.dealerSettings.lastLogin  = new Date().toISOString();
                        saveDealerSettings();
                        setTimeout(function () { showMainApp(); renderSavedQuotes(); }, 1500);
                    } else { showLoginError('Invalid dealer code format'); }
                } else {
                    showLoginError(err.message || 'Invalid credentials');
                    if (pwInput) { pwInput.value = ''; pwInput.focus(); }
                }
            });
    }

    function updateHeaderForDealer() {
        if (!_currentDealer) return;
        var display = _currentDealer.dealerName
            ? _currentDealer.dealerCode + ' | ' + _currentDealer.dealerName
            : 'Dealer ' + _currentDealer.dealerCode;
        document.getElementById('header-dealer-code').textContent = display;

        var badge = document.getElementById('header-tier-badge');
        if (badge && _currentDealer.pricingTier) {
            badge.textContent = _currentDealer.pricingTier;
            badge.style.display = 'inline-block';
            if (_currentDealer.pricingTier === 'vip') { badge.style.background = 'rgba(250,204,21,0.3)'; badge.style.color = '#fef9c3'; }
            else if (_currentDealer.pricingTier === 'preferred') { badge.style.background = 'rgba(34,197,94,0.25)'; badge.style.color = '#dcfce7'; }
        }
        var adminBtn = document.getElementById('admin-btn');
        if (adminBtn) adminBtn.style.display = (_currentDealer.role === 'admin') ? 'inline-block' : 'none';
    }


    // ----------------------------------------------------------
    // 5. TIER PRICING (v2.23)
    //
    // v2.23 FIX: After updating PRODUCTS and PRODUCT_CONFIG from
    // the server, we now:
    //   a) Call window.backupPrices() so ameridex-pricing-fix.js
    //      has the correct server prices as its backup, not the
    //      stale hardcoded values from dealer-portal.html.
    //   b) Dispatch 'ameridex-prices-loaded' event.
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
                    if (PRODUCTS[key] && isValidPrice(data.products[key].price))
                        PRODUCTS[key].price = parseFloat(data.products[key].price);
                    if (PRODUCTS[key] && isValidPrice(data.products[key].basePrice))
                        PRODUCTS[key].basePrice = parseFloat(data.products[key].basePrice);
                });
                Object.values(PRODUCT_CONFIG.categories).forEach(function (cat) {
                    Object.keys(cat.products).forEach(function (k) {
                        if (data.products[k] && isValidPrice(data.products[k].price))
                            cat.products[k].price = parseFloat(data.products[k].price);
                        if (data.products[k] && isValidPrice(data.products[k].basePrice))
                            cat.products[k].basePrice = parseFloat(data.products[k].basePrice);
                    });
                });
                window._currentTier = data.tier;
                console.log('[Pricing] Tier:', data.tier.label, '(x' + data.tier.multiplier + ')');

                // v2.23 FIX: Re-snapshot prices AFTER server data is applied.
                // This prevents healUndefinedPrices() from reverting to stale
                // hardcoded values.
                if (typeof window.backupPrices === 'function') {
                    window.backupPrices();
                    console.log('[Pricing v2.23] backupPrices() refreshed with server prices.');
                }

                // Notify other scripts that fresh prices are available
                dispatchPricesLoadedEvent();

                if (window.currentQuote.lineItems.length > 0) { render(); updateTotalAndFasteners(); }
            })
            .catch(function (err) { console.warn('[Pricing] Could not load tier pricing:', err.message); });
    }
    window.applyTierPricing = applyTierPricing;


    // ----------------------------------------------------------
    // 6a. SERVER-TO-FRONTEND MAPPING (v2.19)
    // ----------------------------------------------------------
    function mapServerCustomerToFrontend(c) {
        if (!c) return { name:'', email:'', zipCode:'', company:'', phone:'', address:'', city:'', state:'' };
        return {
            name:    c.name    || c.customerName  || c.customer_name  || '',
            email:   c.email   || c.customerEmail || c.customer_email || '',
            zipCode: c.zipCode || c.zipcode || c.zip_code || c.zip || '',
            company: c.company || c.companyName   || c.company_name   || '',
            phone:   c.phone   || c.phoneNumber   || c.phone_number   || '',
            address: c.address || c.streetAddress || c.street_address || '',
            city:    c.city  || '',
            state:   c.state || ''
        };
    }

    function mapServerLineItemToFrontend(li) {
        if (!li) return null;
        var type = li.type || li.productId || 'custom';
        if (typeof PRODUCTS !== 'undefined' && !PRODUCTS[type]) {
            console.warn('[v2.9] Unknown product type "' + type + '", falling back to custom');
            type = 'custom';
        }
        var prod = (typeof PRODUCTS !== 'undefined' && PRODUCTS[type]) ? PRODUCTS[type] : null;
        var qty = parseInt(li.qty, 10) || parseInt(li.quantity, 10) || 1;
        var length = li.length;
        if (length === null || length === undefined) {
            if (type === 'dexerdry') length = 240;
            else if (prod && prod.isFt) length = 16;
            else length = null;
        }
        var customLength = li.customLength ? (parseFloat(li.customLength) || null) : null;
        var color = li.color || li.color1 || '';
        if (!color && prod && prod.hasColor) color = window.selectedColor1 || 'Driftwood';
        var customDesc = li.customDesc || li.productName || '';
        var customUnitPrice = parseFloat(li.customUnitPrice) || 0;
        if (type === 'custom' && customUnitPrice === 0 && li.basePrice)
            customUnitPrice = parseFloat(li.basePrice) || 0;
        return {
            type: type, qty: qty, length: length, customLength: customLength,
            color: color, color2: li.color2 || '',
            customDesc: customDesc, customUnitPrice: customUnitPrice,
            priceOverride: li.priceOverride || null, unitPrice: li.unitPrice || null
        };
    }


    // ----------------------------------------------------------
    // 6b. QUOTE SYNC (v2.18)
    // ----------------------------------------------------------
    function loadServerQuotes() {
        var activeServerId = window.currentQuote ? window.currentQuote._serverId : null;

        return api('GET', '/api/quotes')
            .then(function (serverQuotes) {
                var localOnly = window.savedQuotes.filter(function (lq) {
                    return !lq._serverId && lq.lineItems.length > 0;
                });

                window.savedQuotes = serverQuotes.map(function (sq) {
                    return {
                        _serverId:           sq.id,
                        quoteId:             sq.quoteNumber,
                        status:              sq.status,
                        customer:            mapServerCustomerToFrontend(sq.customer),
                        lineItems:           (sq.lineItems || []).map(function (li) {
                            return mapServerLineItemToFrontend(li) || li;
                        }).filter(Boolean),
                        options:             sq.options || { pictureFrame: false, stairs: false },
                        specialInstructions: sq.specialInstructions || '',
                        internalNotes:       sq.internalNotes       || '',
                        shippingAddress:     sq.shippingAddress     || '',
                        deliveryDate:        sq.deliveryDate        || '',
                        createdAt:           sq.createdAt,
                        updatedAt:           sq.updatedAt,
                        submittedAt:         sq.submittedAt
                    };
                });

                localOnly.forEach(function (lq) {
                    window.savedQuotes.push(lq);
                    syncQuoteToServer(lq);
                });

                if (activeServerId && window.currentQuote && window.currentQuote._serverId === activeServerId) {
                    var matchIdx = window.savedQuotes.findIndex(function (q) {
                        return String(q._serverId) === String(activeServerId);
                    });
                    if (matchIdx >= 0) {
                        window.currentQuote.quoteId = window.savedQuotes[matchIdx].quoteId;
                        console.log('[v2.18] Re-linked currentQuote to savedQuotes[' + matchIdx + '] (_serverId=' + activeServerId + ', quoteId=' + window.currentQuote.quoteId + ')');
                    }
                }

                saveToStorage();
                console.log('[Quotes v2.22] Loaded', window.savedQuotes.length, 'quotes (address + all fields mapped)');
                return window.savedQuotes;
            })
            .catch(function () {
                console.warn('[Quotes] Using localStorage quotes (offline)');
                return window.savedQuotes;
            });
    }

    function isServerQuoteNumber(quoteId) {
        return quoteId && /^Q\d{6}-[A-Z0-9]{4}$/.test(quoteId);
    }

    function syncQuoteToServer(quote) {
        if (!_authToken) return Promise.resolve(null);

        var mappedLineItems = quote.lineItems.map(function (li) {
            var prod = (typeof PRODUCTS !== 'undefined' && PRODUCTS[li.type]) ? PRODUCTS[li.type] : null;
            var dealerPrice = (typeof getItemPrice     === 'function') ? getItemPrice(li)     : 0;
            var subtotal    = (typeof getItemSubtotal  === 'function') ? getItemSubtotal(li)  : 0;
            var catalogBase = (li.type === 'custom' || !prod)
                ? (parseFloat(li.customUnitPrice) || dealerPrice)
                : ((prod && prod.basePrice !== undefined) ? parseFloat(prod.basePrice) : dealerPrice);
            return {
                productId: li.productId || li.type || '',
                productName: li.productName || (prod ? prod.name : '') || li.type || 'Custom Item',
                basePrice: Math.round(catalogBase   * 100) / 100,
                price:     Math.round(dealerPrice   * 100) / 100,
                quantity:  parseInt(li.qty, 10) || parseInt(li.quantity, 10) || 1,
                length: li.length || null, customLength: li.customLength || null,
                total: subtotal,
                unitPrice: li.unitPrice || null, customUnitPrice: li.customUnitPrice || null,
                priceOverride: li.priceOverride || null,
                type: li.type || '', color: li.color || li.color1 || '', color2: li.color2 || ''
            };
        });

        var payload = {
            quoteNumber: quote.quoteId,
            customer: quote.customer,
            lineItems: mappedLineItems,
            options: quote.options,
            specialInstructions: quote.specialInstructions,
            internalNotes:       quote.internalNotes,
            shippingAddress:     quote.shippingAddress,
            deliveryDate:        quote.deliveryDate,
            totalAmount: quote.lineItems.reduce(function (sum, li) {
                return sum + ((typeof getItemSubtotal === 'function') ? getItemSubtotal(li) : 0);
            }, 0)
        };

        if (quote._serverId) {
            return api('PUT', '/api/quotes/' + quote._serverId, payload)
                .then(function (u) { quote._serverId = u.id; quote.status = u.status; return u; })
                .catch(function (err) { console.warn('[Sync] Update failed:', err.message); return null; });
        } else {
            if (isServerQuoteNumber(quote.quoteId)) {
                console.error('[Sync v2.18] BLOCKED POST for server-originated quote', quote.quoteId);
                return Promise.resolve(null);
            }
            return api('POST', '/api/quotes', payload)
                .then(function (c) { quote._serverId = c.id; quote.status = c.status; return c; })
                .catch(function (err) { console.warn('[Sync] Create failed:', err.message); return null; });
        }
    }


    // ----------------------------------------------------------
    // 7. saveCurrentQuote (v2.18)
    // ----------------------------------------------------------
    window.saveCurrentQuote = function () {
        if (typeof window.syncQuoteFromDOM === 'function') window.syncQuoteFromDOM();
        if (!window.currentQuote.quoteId) window.currentQuote.quoteId = generateQuoteNumber();

        var existingIdx = -1;
        if (window.currentQuote._serverId) {
            existingIdx = window.savedQuotes.findIndex(function (q) {
                return q._serverId && String(q._serverId) === String(window.currentQuote._serverId);
            });
        }
        if (existingIdx < 0 && window.currentQuote.quoteId) {
            existingIdx = window.savedQuotes.findIndex(function (q) {
                return q.quoteId && q.quoteId === window.currentQuote.quoteId;
            });
        }

        var quoteData = JSON.parse(JSON.stringify(window.currentQuote));
        quoteData.updatedAt = new Date().toISOString();

        if (existingIdx >= 0) {
            if (!quoteData._serverId && window.savedQuotes[existingIdx]._serverId)
                quoteData._serverId = window.savedQuotes[existingIdx]._serverId;
            window.savedQuotes[existingIdx] = quoteData;
        } else if (window.currentQuote._serverId) {
            console.warn('[v2.18] Force-inserting quote with _serverId to prevent duplicate POST.');
            window.savedQuotes.push(quoteData);
            existingIdx = window.savedQuotes.length - 1;
        } else {
            quoteData.createdAt = new Date().toISOString();
            window.savedQuotes.push(quoteData);
            existingIdx = window.savedQuotes.length - 1;
        }

        saveToStorage();
        updateCustomerHistory();
        try { renderSavedQuotes(); } catch (e) { console.warn('[API] renderSavedQuotes() skipped:', e.message); }
        syncQuoteToServer(window.savedQuotes[existingIdx]);
        return window.currentQuote.quoteId;
    };


    // ----------------------------------------------------------
    // 8. LOGIN BUTTON WIRING
    // ----------------------------------------------------------
    document.getElementById('login-btn').onclick = null;
    document.getElementById('login-btn').addEventListener('click', handleServerLogin);
    document.getElementById('dealer-code-input').onkeypress = null;
    document.getElementById('dealer-code-input').addEventListener('keypress', function (e) {
        if (e.key !== 'Enter') return;
        var u = document.getElementById('dealer-username-input');
        if (u && !u.value) { u.focus(); return; }
        var p = document.getElementById('dealer-password-input');
        if (p && !p.value) { p.focus(); return; }
        handleServerLogin();
    });


    // ----------------------------------------------------------
    // 9. LOGOUT
    // ----------------------------------------------------------
    window.handleLogout = function () {
        if (window.currentQuote.lineItems.length > 0 || document.getElementById('cust-name').value.trim()) {
            if (!confirm('Are you sure you want to log out? Any unsaved changes will be lost.')) return;
        }
        if (_authToken) api('POST', '/api/auth/logout', null, { skipAuthRedirect: true }).catch(function () {});
        _authToken = null; _currentUser = null; _currentDealer = null;
        sessionStorage.removeItem('ameridex-token');
        clearTimeout(window.idleTimer); clearTimeout(window.warningTimer); clearInterval(window.countdownInterval);
        window.dealerSettings.dealerCode = ''; window.dealerSettings.role = '';
        saveDealerSettings();
        resetFormOnly();
        ['dealer-code-input','dealer-username-input','dealer-password-input'].forEach(function (id) {
            var el = document.getElementById(id); if (el) el.value = '';
        });
        var adminBtn = document.getElementById('admin-btn'); if (adminBtn) adminBtn.style.display = 'none';
        var tierBadge = document.getElementById('header-tier-badge'); if (tierBadge) tierBadge.style.display = 'none';
        document.querySelectorAll('.role-injected').forEach(function (el) { el.remove(); });
        document.getElementById('main-app').classList.add('app-hidden');
        document.getElementById('login-screen').style.display = 'flex';
        document.getElementById('dealer-code-input').focus();
    };


    // ----------------------------------------------------------
    // 10. DELETE QUOTE (server)
    // ----------------------------------------------------------
    window.deleteQuoteFromServer = function (quote) {
        if (quote._serverId && _authToken)
            api('DELETE', '/api/quotes/' + quote._serverId).catch(function (err) {
                console.warn('[Delete] Server delete failed:', err.message);
            });
    };


    // ----------------------------------------------------------
    // 11. SUBMIT FORMAL REQUEST  (v2.21)
    //
    // The server now handles all Formspree notification via
    // POST /api/quotes/:id/submit -> notifySubmissionViaFormspree().
    //
    // The old _origSendFormalRequest fallback used to fire a
    // client-side Formspree POST from the browser, which exposed
    // the form ID in JS and could fire even when the quote was
    // not yet saved to the server. That path is removed.
    //
    // Fallback behavior (server unreachable or no _serverId):
    //   Show a clear user-facing error. No silent email attempt.
    //   The user should try again once connectivity is restored.
    // ----------------------------------------------------------
    window.sendFormalRequest = function () {
        var quoteId = saveCurrentQuote();
        var quote = window.savedQuotes.find(function (q) { return q.quoteId === quoteId; });

        if (quote && quote._serverId && _authToken) {
            api('POST', '/api/quotes/' + quote._serverId + '/submit')
                .then(function (updatedQuote) {
                    quote.status = 'submitted';
                    saveToStorage();
                    document.getElementById('reviewModal').classList.remove('active');
                    document.getElementById('success-order-number').textContent = quoteId;
                    document.getElementById('success-confirmation').classList.add('visible');
                    console.log('[Submit v2.22] Quote', quoteId, 'submitted to server. Formspree handled server-side.');
                })
                .catch(function (err) {
                    var msg = err.message || 'Submission failed. Please try again.';
                    console.warn('[Submit v2.22] Server submit failed:', msg);
                    alert('Could not submit quote: ' + msg);
                });
        } else {
            var reason = !_authToken
                ? 'Your session has expired. Please log in again and retry.'
                : 'This quote has not synced to the server yet. Please wait a moment and try again.';
            console.warn('[Submit v2.22] Cannot submit:', reason);
            alert(reason);
        }
    };


    // ----------------------------------------------------------
    // 12. SETTINGS SAVE
    // ----------------------------------------------------------
    document.getElementById('settings-save').onclick = null;
    document.getElementById('settings-save').addEventListener('click', function () {
        var newName    = document.getElementById('settings-dealer-name').value.trim();
        var newContact = document.getElementById('settings-dealer-contact').value.trim();
        var newPhone   = document.getElementById('settings-dealer-phone').value.trim();
        window.dealerSettings.dealerName    = newName;
        window.dealerSettings.dealerContact = newContact;
        window.dealerSettings.dealerPhone   = newPhone;
        saveDealerSettings();

        if (_authToken) {
            api('PUT', '/api/dealer/profile', { dealerName: newName, contactPerson: newContact, phone: newPhone })
                .then(function (u) {
                    if (_currentDealer) {
                        _currentDealer.dealerName    = u.dealerName;
                        _currentDealer.contactPerson = u.contactPerson;
                        _currentDealer.phone         = u.phone;
                    }
                    updateHeaderForDealer();
                })
                .catch(function (err) { console.warn('[Settings] Server update failed:', err.message); });
        }

        var currentPw = document.getElementById('settings-current-pw');
        var newPw     = document.getElementById('settings-new-pw');
        var confirmPw = document.getElementById('settings-confirm-pw');
        var pwError   = document.getElementById('pw-change-error');
        var pwSuccess = document.getElementById('pw-change-success');

        if (newPw && newPw.value) {
            pwError.style.display = 'none'; pwSuccess.style.display = 'none';
            if (!currentPw || !currentPw.value) { pwError.textContent = 'Current password is required'; pwError.style.display = 'block'; return; }
            if (newPw.value.length < 8) { pwError.textContent = 'Password must be at least 8 characters'; pwError.style.display = 'block'; return; }
            if (newPw.value !== confirmPw.value) { pwError.textContent = 'Passwords do not match'; pwError.style.display = 'block'; return; }
            if (_authToken) {
                api('POST', '/api/auth/change-password', { currentPassword: currentPw.value, newPassword: newPw.value })
                    .then(function () {
                        pwSuccess.textContent = 'Password changed successfully!';
                        pwSuccess.style.display = 'block';
                        currentPw.value = ''; newPw.value = ''; confirmPw.value = '';
                        setTimeout(function () { pwSuccess.style.display = 'none'; }, 3000);
                    })
                    .catch(function (err) { pwError.textContent = err.message || 'Failed to change password'; pwError.style.display = 'block'; });
            }
            return;
        }
        document.getElementById('settingsModal').classList.remove('active');
        alert('Settings saved!');
    });


    // ----------------------------------------------------------
    // 13. saveAndClose
    // ----------------------------------------------------------
    window.saveAndClose = function () {
        document.getElementById('timeout-warning').classList.remove('visible');
        clearInterval(window.countdownInterval);
        if (typeof window.syncQuoteFromDOM === 'function') window.syncQuoteFromDOM();
        if (window.currentQuote.lineItems.length > 0 || document.getElementById('cust-name').value.trim()) {
            var quoteId = saveCurrentQuote();
            alert('Quote saved! ID: ' + quoteId);
        }
        resetFormOnly();
    };


    // ----------------------------------------------------------
    // 14. renderSavedQuotes
    // ----------------------------------------------------------
    window.renderSavedQuotes = function () {
        var list = document.getElementById('saved-quotes-list');
        if (!list) return;

        var searchEl    = document.getElementById('quote-search');
        var searchQuery = (searchEl ? searchEl.value : '').toLowerCase();
        var filtered    = searchQuery
            ? window.savedQuotes.filter(function (q) {
                return (q.customer.name    && q.customer.name.toLowerCase().includes(searchQuery))
                    || (q.customer.company && q.customer.company.toLowerCase().includes(searchQuery))
                    || (q.quoteId          && q.quoteId.toLowerCase().includes(searchQuery));
              })
            : window.savedQuotes;

        filtered.sort(function (a, b) {
            return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
        });

        if (filtered.length === 0) {
            list.innerHTML = '<div class="no-saved-quotes">' +
                (searchQuery ? 'No quotes match your search' : 'No saved quotes yet') + '</div>';
            return;
        }

        list.innerHTML = '';
        var statusColors = {
            draft:     'background:#f3f4f6;color:#374151;',
            submitted: 'background:#dbeafe;color:#1d4ed8;',
            reviewed:  'background:#fef3c7;color:#92400e;',
            approved:  'background:#dcfce7;color:#16a34a;',
            revision:  'background:#fee2e2;color:#dc2626;'
        };

        filtered.forEach(function (quote, idx) {
            var item     = document.createElement('div');
            item.className = 'saved-quote-item';
            var dateStr  = new Date(quote.updatedAt || quote.createdAt).toLocaleDateString();
            var total    = quote.lineItems.reduce(function (s, li) { return s + getItemSubtotal(li); }, 0);
            var status   = quote.status || 'draft';
            var editable = ['draft','revision'].includes(status);
            var syncDot  = quote._serverId
                ? '<span title="Synced" style="color:#16a34a;font-size:0.7rem;margin-left:0.35rem;">&#9679;</span>'
                : '<span title="Local only" style="color:#f59e0b;font-size:0.7rem;margin-left:0.35rem;">&#9679;</span>';
            var statusBadge =
                '<span style="display:inline-block;padding:0.15rem 0.5rem;border-radius:999px;' +
                'font-size:0.7rem;font-weight:600;text-transform:uppercase;margin-left:0.5rem;' +
                (statusColors[status] || statusColors.draft) + '">' + status + '</span>';

            item.innerHTML =
                '<div class="saved-quote-info">' +
                    '<div class="saved-quote-id">' + escapeHTML(quote.quoteId || 'Draft') + statusBadge + syncDot + '</div>' +
                    '<div class="saved-quote-customer">' + (escapeHTML(quote.customer.name) || 'No name') +
                        (quote.customer.company ? ' &middot; ' + escapeHTML(quote.customer.company) : '') + '</div>' +
                    '<div class="saved-quote-date">' + dateStr + ' &middot; ' + quote.lineItems.length + ' items</div>' +
                '</div>' +
                '<div class="saved-quote-total">$' + formatCurrency(total) + '</div>' +
                '<div class="saved-quote-actions">' +
                    '<button type="button" class="btn-load" data-idx="' + idx + '">' + (editable ? 'Load' : 'View') + '</button>' +
                    '<button type="button" class="btn-load" data-idx="' + idx + '" data-action="duplicate" style="background:#f0fdf4;color:#16a34a;">Copy</button>' +
                    (status === 'draft' ? '<button type="button" class="btn-delete-quote" data-idx="' + idx + '">Delete</button>' : '') +
                '</div>';
            list.appendChild(item);
        });

        list.querySelectorAll('.btn-load').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var i      = parseInt(btn.getAttribute('data-idx'), 10);
                var action = btn.getAttribute('data-action');
                if (action === 'duplicate') {
                    duplicateQuote(filtered[i]);
                } else {
                    var realIdx = window.savedQuotes.indexOf(filtered[i]);
                    if (realIdx > -1 && typeof window.loadQuote === 'function') window.loadQuote(realIdx);
                }
            });
        });

        list.querySelectorAll('.btn-delete-quote').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var i = parseInt(btn.getAttribute('data-idx'), 10);
                if (!confirm('Delete this quote?')) return;
                var quote = filtered[i];
                deleteQuoteFromServer(quote);
                var qIdx = window.savedQuotes.indexOf(quote);
                if (qIdx > -1) window.savedQuotes.splice(qIdx, 1);
                saveToStorage();
                renderSavedQuotes();
            });
        });
    };


    // ----------------------------------------------------------
    // 14b. loadQuote (v2.19)
    // ----------------------------------------------------------
    window.loadQuote = function (idx) {
        if (idx < 0 || idx >= window.savedQuotes.length) {
            console.warn('[v2.22] loadQuote: invalid index', idx);
            return;
        }
        if (window.currentQuote.lineItems.length > 0) {
            if (!confirm('Loading this quote will replace your current work. Continue?')) return;
        }
        var source = window.savedQuotes[idx];
        window.currentQuote = JSON.parse(JSON.stringify(source));
        restoreQuoteToDOM(window.currentQuote);
        console.log('[v2.22] loadQuote(' + idx + '): "' + (window.currentQuote.quoteId || 'Draft') + '" restored (incl. address). Status:', window.currentQuote.status);
    };


    // ----------------------------------------------------------
    // 15. QUOTE DUPLICATION
    // ----------------------------------------------------------
    function duplicateQuote(original) {
        if (window.currentQuote.lineItems.length > 0) {
            if (!confirm('This will replace your current work with a copy. Continue?')) return;
        }
        window.currentQuote = {
            quoteId: null, status: 'draft',
            customer: { name:'', email:'', zipCode:'', company:'', phone:'', address:'', city:'', state:'' },
            lineItems:   JSON.parse(JSON.stringify(original.lineItems)),
            options:     JSON.parse(JSON.stringify(original.options || { pictureFrame: false, stairs: false })),
            specialInstructions: original.specialInstructions || '',
            internalNotes: '', shippingAddress: '', deliveryDate: ''
        };
        restoreQuoteToDOM(window.currentQuote);
        document.getElementById('customer').scrollIntoView({ behavior: 'smooth' });
        if (original._serverId && _authToken) {
            api('POST', '/api/quotes/' + original._serverId + '/duplicate')
                .then(function (dup) { window.currentQuote._serverId = dup.id; })
                .catch(function () { console.warn('[Duplicate] Server duplication failed, will sync on save'); });
        }
    }


    // ----------------------------------------------------------
    // 16. SESSION RESUME
    // ----------------------------------------------------------
    function tryResumeSession() {
        if (!_authToken) return;
        api('GET', '/api/auth/me', null, { skipAuthRedirect: true })
            .then(function (data) {
                _currentUser   = data.user;
                _currentDealer = data.dealer;
                _currentDealer.role = data.user.role;
                window.dealerSettings.dealerCode    = data.dealer.dealerCode;
                window.dealerSettings.dealerName    = data.dealer.dealerName    || '';
                window.dealerSettings.dealerContact = data.dealer.contactPerson || '';
                window.dealerSettings.dealerPhone   = data.dealer.phone         || '';
                window.dealerSettings.role          = data.user.role;
                saveDealerSettings();
                return applyTierPricing().then(function () { return loadServerQuotes(); });
            })
            .then(function () {
                showMainApp();
                updateHeaderForDealer();
                renderSavedQuotes();
                console.log('[Session] Resumed as', _currentUser.username, '(' + _currentUser.role + ')');
                dispatchLoginEvent();
            })
            .catch(function () {
                sessionStorage.removeItem('ameridex-token');
                _authToken = null; _currentUser = null; _currentDealer = null;
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
            if (!q._serverId && q.lineItems.length > 0) syncQuoteToServer(q);
        });
    });


    // ----------------------------------------------------------
    // 18. LOAD QUOTE FROM URL PARAM (v2.22)
    //
    // CRITICAL FIX: Always wait for 'ameridex-login' before
    // fetching. Previously, when _authToken existed in
    // sessionStorage, doLoad() fired immediately. But
    // tryResumeSession() is async and had not yet finished
    // hydrating _currentUser, _currentDealer, or the server-side
    // dealer middleware. This caused 401/404 errors and stale
    // state when opening a quote from the Quotes & Customers
    // page (which navigates to ?quoteId=Q260228-OOD9).
    //
    // Flow now:
    //   1. loadQuoteFromUrlParam() always registers a one-shot
    //      listener on 'ameridex-login'.
    //   2. tryResumeSession() dispatches 'ameridex-login' AFTER
    //      auth is verified, tier pricing is loaded, and
    //      loadServerQuotes() has finished.
    //   3. handleServerLogin() dispatches 'ameridex-login' after
    //      the same full-hydration sequence.
    //   4. Either way, doLoad() runs only when the session is
    //      fully ready.
    //   5. A 10-second safety timeout cleans up the listener
    //      if login never fires (e.g. expired token + user
    //      does not re-login).
    // ----------------------------------------------------------
    function loadQuoteFromUrlParam() {
        var urlParams = new URLSearchParams(window.location.search);
        var serverId  = urlParams.get('quoteId');
        if (!serverId) return;

        function applyQuoteToDOM(sq) {
            var frontendLineItems = (sq.lineItems || []).map(function (li) {
                return mapServerLineItemToFrontend(li) || li;
            }).filter(Boolean);
            var mappedCustomer = mapServerCustomerToFrontend(sq.customer);

            window.currentQuote.quoteId             = sq.quoteNumber || sq.quoteId || null;
            window.currentQuote._serverId           = sq.id || sq._serverId || null;
            window.currentQuote.status              = sq.status || 'draft';
            window.currentQuote.customer            = mappedCustomer;
            window.currentQuote.lineItems           = frontendLineItems;
            window.currentQuote.options             = sq.options || { pictureFrame: false, stairs: false };
            window.currentQuote.specialInstructions = sq.specialInstructions || '';
            window.currentQuote.internalNotes       = sq.internalNotes       || '';
            window.currentQuote.shippingAddress     = sq.shippingAddress     || '';
            window.currentQuote.deliveryDate        = sq.deliveryDate        || '';

            restoreQuoteToDOM(window.currentQuote);
            console.log('[v2.22] Loaded from URL param:', window.currentQuote.quoteId || serverId, '| status:', window.currentQuote.status);

            try { window.history.replaceState(null, '', window.location.pathname); } catch (e) {}
        }

        function doLoad() {
            api('GET', '/api/quotes/' + serverId)
                .then(applyQuoteToDOM)
                .catch(function (err) {
                    console.warn('[v2.22] Server fetch failed for', serverId, err.message);
                    var found = window.savedQuotes.find(function (q) {
                        return String(q._serverId) === String(serverId) || String(q.quoteId) === String(serverId);
                    });
                    if (found) applyQuoteToDOM(found);
                    else console.error('[v2.22] Quote not found:', serverId);
                });
        }

        // v2.22: ALWAYS wait for the login event, even if _authToken
        // already exists. tryResumeSession() is async; the token in
        // sessionStorage does NOT mean the session is hydrated yet.
        var loginTimeout;
        function onLogin() {
            window.removeEventListener('ameridex-login', onLogin);
            clearTimeout(loginTimeout);
            console.log('[v2.22] ameridex-login received, loading quote from URL param:', serverId);
            doLoad();
        }
        window.addEventListener('ameridex-login', onLogin);

        // Safety: clean up listener after 10s if login never fires
        // (e.g. expired token and user doesn't re-login)
        loginTimeout = setTimeout(function () {
            window.removeEventListener('ameridex-login', onLogin);
            console.warn('[v2.22] Timed out waiting for ameridex-login. Quote URL param "' + serverId + '" abandoned.');
        }, 10000);
    }


    // ----------------------------------------------------------
    // INIT
    // ----------------------------------------------------------
    injectLoginFields();
    injectHeaderElements();
    injectChangePassword();
    if (_authToken) tryResumeSession();
    loadQuoteFromUrlParam();

    console.log('[AmeriDex API] v2.23 loaded.');
})();
