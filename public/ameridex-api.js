// ============================================================
// AmeriDex Dealer Portal - API Integration Patch v2.4
// Date: 2026-02-16
// ============================================================
// REQUIRES: ameridex-patches.js (v1.0+) loaded first
//
// Load order in dealer-portal.html (before </body>):
//   <script src="ameridex-patches.js"></script>
//   <script src="ameridex-api.js"></script>
//
// v2.4 Changes (2026-02-16):
//   - FIX: Dispatch 'ameridex-login' custom event after both
//     handleServerLogin() and tryResumeSession() complete. This
//     event is consumed by ameridex-roles.js to inject role-based
//     nav buttons (GM "My Team", Admin Panel) at the correct time.
//   - Previously these buttons never appeared because the event
//     was never fired, and the DOMContentLoaded fallback ran
//     before the user had authenticated.
//
// v2.3 Changes (2026-02-14):
//   - FIX: api() helper no longer treats 401 from /api/auth/login
//     as "session expired". Login failures now show the server's
//     error message (e.g. "Invalid credentials") instead of
//     clearing the session and redirecting to login screen.
//   - FIX: applyTierPricing() guards every price assignment
//     against undefined/null/NaN to prevent $undefined display.
//   - FIX: tryResumeSession() silently falls back to login on
//     failure without flashing "Session expired" error text.
//
// v2.2 Changes (2026-02-14):
//   - FIX: Section 14 loadQuote() now resolves real savedQuotes
//     index via indexOf() instead of using filtered array index.
//
// v2.1 Changes (2026-02-14):
//   - FIX: Login now sends { dealerCode, username, password }
//   - FIX: Login/resume response unwraps { user, dealer } shape
//   - FIX: Session resume (GET /api/auth/me) unwraps nested response
//   - FIX: Self password change uses POST /api/auth/change-password
//   - ADD: Expose _authToken getter for admin-customers.js
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
    // options.skipAuthRedirect: when true, a 401 response will NOT
    //   trigger the automatic session-clear + login redirect.
    //   Used by handleServerLogin() so that bad-credentials 401s
    //   are returned to the caller as a normal rejected promise.
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
                        // Genuine session expiry on an authenticated request
                        sessionStorage.removeItem('ameridex-token');
                        _authToken = null;
                        _currentUser = null;
                        _currentDealer = null;
                        showLoginScreen();
                        showLoginError('Session expired. Please log in again.');
                    }
                    // Always reject so the caller's .catch() fires
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
    // Fires the 'ameridex-login' custom event on window.
    // Consumed by ameridex-roles.js to inject role-based buttons
    // (GM "My Team", Admin "Admin Panel") into the header.
    // Also consumed by ameridex-overrides.js for init timing.
    // ----------------------------------------------------------
    function dispatchLoginEvent() {
        try {
            window.dispatchEvent(new Event('ameridex-login'));
            console.log('[Auth] Dispatched ameridex-login event (role: ' + (_currentUser ? _currentUser.role : 'unknown') + ')');
        } catch (e) {
            // IE11 fallback (unlikely but safe)
            var evt = document.createEvent('Event');
            evt.initEvent('ameridex-login', true, true);
            window.dispatchEvent(evt);
        }
    }


    // ----------------------------------------------------------
    // 1. INJECT USERNAME + PASSWORD FIELDS INTO LOGIN CARD
    // ----------------------------------------------------------
    function injectLoginFields() {
        var loginCard = document.querySelector('.login-card');
        if (!loginCard) return;
        if (document.getElementById('dealer-password-input')) return;

        var codeField = document.getElementById('dealer-code-input').closest('.field');

        // Username field
        var userField = document.createElement('div');
        userField.className = 'field';
        userField.innerHTML =
            '<label for="dealer-username-input">Username</label>' +
            '<input type="text" id="dealer-username-input" ' +
            'placeholder="Enter username" autocomplete="username" ' +
            'style="text-transform:none; letter-spacing:normal; text-align:left;">' +
            '<div class="help-text">Your login username (provided by AmeriDex)</div>';
        codeField.parentNode.insertBefore(userField, codeField.nextSibling);

        // Password field
        var pwField = document.createElement('div');
        pwField.className = 'field';
        pwField.innerHTML =
            '<label for="dealer-password-input">Password</label>' +
            '<input type="password" id="dealer-password-input" ' +
            'placeholder="Enter password" autocomplete="current-password" ' +
            'style="text-transform:none; letter-spacing:normal; text-align:left;">' +
            '<div class="help-text">Contact AmeriDex if you need a password reset</div>';
        userField.parentNode.insertBefore(pwField, userField.nextSibling);

        // Update subtitle text
        var subtitle = loginCard.querySelector('.subtitle');
        if (subtitle) {
            subtitle.textContent = 'Enter your dealer code, username, and password to continue';
        }

        // Update error text
        var errorEl = document.getElementById('dealer-code-error');
        if (errorEl) {
            errorEl.textContent = 'Invalid credentials';
        }

        // Uppercase styling on code input
        var codeInput = document.getElementById('dealer-code-input');
        codeInput.style.textTransform = 'uppercase';

        // Enter key handlers
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

        // v2.3: Pass skipAuthRedirect so 401 from login endpoint
        // does NOT trigger "Session expired" + screen redirect.
        api('POST', '/api/auth/login', {
            dealerCode: code,
            username: username,
            password: password
        }, { skipAuthRedirect: true })
            .then(function (data) {
                _authToken = data.token;
                sessionStorage.setItem('ameridex-token', data.token);

                // Backend returns { token, user, dealer }
                _currentUser = data.user;
                _currentDealer = data.dealer;
                // Merge role from user onto dealer for compatibility
                _currentDealer.role = data.user.role;

                // Populate dealerSettings for compatibility
                dealerSettings.dealerCode = data.dealer.dealerCode;
                dealerSettings.dealerName = data.dealer.dealerName || '';
                dealerSettings.dealerContact = data.dealer.contactPerson || '';
                dealerSettings.dealerPhone = data.dealer.phone || '';
                dealerSettings.lastLogin = new Date().toISOString();
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

                    // v2.4: Dispatch login event so role-based modules
                    // (ameridex-roles.js, ameridex-overrides.js) can
                    // inject their UI now that auth is complete.
                    dispatchLoginEvent();
                });
            })
            .catch(function (err) {
                loginBtn.textContent = 'Enter Portal';
                loginBtn.disabled = false;

                // v2.3: Since we used skipAuthRedirect, we get here for
                // bad credentials (401) with err.message from the server.
                // No "Session expired" flash, no screen redirect.
                if (!_serverOnline) {
                    if (validateDealerCode(code)) {
                        showLoginError('Server unavailable. Logging in offline mode (limited features).');
                        dealerSettings.dealerCode = code;
                        dealerSettings.lastLogin = new Date().toISOString();
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

        // Role comes from _currentDealer.role (merged from user object)
        var adminBtn = document.getElementById('admin-btn');
        if (adminBtn) {
            adminBtn.style.display = (_currentDealer.role === 'admin') ? 'inline-block' : 'none';
        }
    }


    // ----------------------------------------------------------
    // 5. TIER PRICING: Fetch and apply
    // ----------------------------------------------------------
    // v2.3: Guard every price assignment against undefined/null/NaN.
    //       Only overwrite PRODUCTS[key].price if the server value
    //       is a valid finite number. This prevents the $undefined
    //       display bug caused by missing price fields in the
    //       server response.
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

                if (currentQuote.lineItems.length > 0) {
                    render();
                    updateTotalAndFasteners();
                }
            })
            .catch(function (err) {
                console.warn('[Pricing] Could not load tier pricing, using defaults:', err.message);
            });
    }


    // ----------------------------------------------------------
    // 6. QUOTE SYNC: Server with localStorage fallback
    // ----------------------------------------------------------
    function loadServerQuotes() {
        return api('GET', '/api/quotes')
            .then(function (serverQuotes) {
                var localOnly = savedQuotes.filter(function (lq) {
                    return !lq._serverId && lq.lineItems.length > 0;
                });

                savedQuotes = serverQuotes.map(function (sq) {
                    return {
                        _serverId: sq.id,
                        quoteId: sq.quoteNumber,
                        status: sq.status,
                        customer: sq.customer || { name: '', email: '', zipCode: '', company: '', phone: '' },
                        lineItems: sq.lineItems || [],
                        options: sq.options || { pictureFrame: false, stairs: false },
                        specialInstructions: sq.specialInstructions || '',
                        internalNotes: sq.internalNotes || '',
                        shippingAddress: sq.shippingAddress || '',
                        deliveryDate: sq.deliveryDate || '',
                        createdAt: sq.createdAt,
                        updatedAt: sq.updatedAt,
                        submittedAt: sq.submittedAt
                    };
                });

                localOnly.forEach(function (lq) {
                    savedQuotes.push(lq);
                    syncQuoteToServer(lq);
                });

                saveToStorage();
                return savedQuotes;
            })
            .catch(function () {
                console.warn('[Quotes] Using localStorage quotes (offline)');
                return savedQuotes;
            });
    }

    function syncQuoteToServer(quote) {
        if (!_authToken) return Promise.resolve(null);

        var payload = {
            quoteNumber: quote.quoteId,
            customer: quote.customer,
            lineItems: quote.lineItems,
            options: quote.options,
            specialInstructions: quote.specialInstructions,
            internalNotes: quote.internalNotes,
            shippingAddress: quote.shippingAddress,
            deliveryDate: quote.deliveryDate,
            totalAmount: quote.lineItems.reduce(function (sum, li) {
                return sum + getItemSubtotal(li);
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

        if (!currentQuote.quoteId) {
            currentQuote.quoteId = generateQuoteNumber();
        }

        var existingIdx = savedQuotes.findIndex(function (q) {
            return q.quoteId === currentQuote.quoteId;
        });

        var quoteData = JSON.parse(JSON.stringify(currentQuote));
        quoteData.updatedAt = new Date().toISOString();

        if (existingIdx >= 0) {
            quoteData._serverId = savedQuotes[existingIdx]._serverId;
            savedQuotes[existingIdx] = quoteData;
        } else {
            quoteData.createdAt = new Date().toISOString();
            savedQuotes.push(quoteData);
            existingIdx = savedQuotes.length - 1;
        }

        saveToStorage();
        updateCustomerHistory();
        renderSavedQuotes();

        syncQuoteToServer(savedQuotes[existingIdx >= 0 ? existingIdx : savedQuotes.length - 1]);

        return currentQuote.quoteId;
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
        if (currentQuote.lineItems.length > 0 || document.getElementById('cust-name').value.trim()) {
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

        clearTimeout(idleTimer);
        clearTimeout(warningTimer);
        clearInterval(countdownInterval);

        dealerSettings.dealerCode = '';
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

        // Remove role-injected buttons on logout so they don't
        // persist if a different user logs in next.
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

        var quote = savedQuotes.find(function (q) {
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

        dealerSettings.dealerName = newName;
        dealerSettings.dealerContact = newContact;
        dealerSettings.dealerPhone = newPhone;
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

        // Handle password change using /api/auth/change-password
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
        clearInterval(countdownInterval);

        if (typeof window.syncQuoteFromDOM === 'function') {
            window.syncQuoteFromDOM();
        }

        if (currentQuote.lineItems.length > 0 || document.getElementById('cust-name').value.trim()) {
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
        var searchQuery = (document.getElementById('quote-search').value || '').toLowerCase();
        var filtered = savedQuotes;

        if (searchQuery) {
            filtered = savedQuotes.filter(function (q) {
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
                        var realIdx = savedQuotes.indexOf(filtered[i]);
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
                    var qIdx = savedQuotes.indexOf(quote);
                    if (qIdx > -1) savedQuotes.splice(qIdx, 1);
                    saveToStorage();
                    renderSavedQuotes();
                }
            });
        });
    };


    // ----------------------------------------------------------
    // 15. QUOTE DUPLICATION
    // ----------------------------------------------------------
    function duplicateQuote(original) {
        if (currentQuote.lineItems.length > 0) {
            if (!confirm('This will replace your current work with a copy. Continue?')) return;
        }

        currentQuote = {
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

        document.getElementById('cust-name').value = '';
        document.getElementById('cust-email').value = '';
        document.getElementById('cust-zip').value = '';
        document.getElementById('cust-company').value = '';
        document.getElementById('cust-phone').value = '';

        document.getElementById('pic-frame').checked = currentQuote.options.pictureFrame;
        document.getElementById('stairs').checked = currentQuote.options.stairs;
        document.getElementById('pic-frame-note').style.display = currentQuote.options.pictureFrame ? 'block' : 'none';
        document.getElementById('stairs-note').style.display = currentQuote.options.stairs ? 'block' : 'none';

        document.getElementById('special-instr').value = currentQuote.specialInstructions;
        document.getElementById('internal-notes').value = '';
        document.getElementById('ship-addr').value = '';
        document.getElementById('del-date').value = '';

        render();
        updateTotalAndFasteners();
        updateCustomerProgress();

        document.getElementById('customer').scrollIntoView({ behavior: 'smooth' });

        if (original._serverId && _authToken) {
            api('POST', '/api/quotes/' + original._serverId + '/duplicate')
                .then(function (dup) {
                    currentQuote._serverId = dup.id;
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
    // v2.3: tryResumeSession now uses skipAuthRedirect so that a
    //       stale token does NOT flash "Session expired" before
    //       the login screen appears. It just silently clears
    //       the token and shows the login form.
    // v2.4: Dispatches ameridex-login event on successful resume.
    // ----------------------------------------------------------
    function tryResumeSession() {
        if (!_authToken) return;

        api('GET', '/api/auth/me', null, { skipAuthRedirect: true })
            .then(function (data) {
                // Backend returns { user: {...}, dealer: {...} }
                _currentUser = data.user;
                _currentDealer = data.dealer;
                _currentDealer.role = data.user.role;

                dealerSettings.dealerCode = data.dealer.dealerCode;
                dealerSettings.dealerName = data.dealer.dealerName || '';
                dealerSettings.dealerContact = data.dealer.contactPerson || '';
                dealerSettings.dealerPhone = data.dealer.phone || '';
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

                // v2.4: Dispatch login event so role-based modules
                // can inject their UI after session resume completes.
                dispatchLoginEvent();
            })
            .catch(function () {
                // v2.3: Silently clear stale session, no error flash
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
        savedQuotes.forEach(function (q) {
            if (!q._serverId && q.lineItems.length > 0) {
                syncQuoteToServer(q);
            }
        });
    });


    // ----------------------------------------------------------
    // INIT
    // ----------------------------------------------------------
    injectLoginFields();
    injectHeaderElements();
    injectChangePassword();

    if (_authToken) {
        tryResumeSession();
    }

    console.log('[AmeriDex API] v2.4 loaded: Auth + API integration active.');
})();
