// ============================================================
// AmeriDex Dealer Portal - Customer Sync Script v1.1
// Date: 2026-02-28
// ============================================================
// PURPOSE:
//   The old dashboard stored customers in a client-side array
//   called `customerHistory` (persisted in localStorage under
//   `ameridex_customer_history` or embedded in savedQuotes).
//   The new My Quotes page (quotes-customers.html) reads from
//   the server API: GET /api/customers.
//
//   This script bridges the gap by:
//   1. Reading all customer records from localStorage sources
//   2. POSTing each to POST /api/customers (which upserts)
//   3. Marking the sync as complete so it only runs once
//
// v1.1 Changes (2026-02-28):
//   - FIX: gatherLocalCustomers() no longer requires email for
//     inclusion. Email is now optional on the quote form.
//     Dedup key is email.toLowerCase() when present, otherwise
//     name.toLowerCase() + '|' + zipCode.
//   - FIX: All 4 data sources updated with the new dedup logic.
//   - FIX: syncCustomer() payload sends email || '' (not null).
//   - FIX: Log messages use customer name as primary identifier
//     instead of email, with zip as fallback secondary.
//   - ADD: customerKey() and customerLabel() helpers.
//
// LOAD ORDER:
//   Must load AFTER ameridex-api.js (needs window.ameridexAPI
//   and window.getAuthToken).
// ============================================================

(function () {
    'use strict';

    var SYNC_FLAG = 'ameridex_customer_sync_complete';
    var API_BASE = window.AMERIDEX_API_BASE || '';

    function getSyncToken() {
        return window.getAuthToken ? window.getAuthToken() : sessionStorage.getItem('ameridex-token');
    }

    // ----------------------------------------------------------
    // HELPERS: Dedup key and log label for customers
    // ----------------------------------------------------------
    // When email exists, dedup by email (case-insensitive).
    // When email is absent, dedup by name + zip to avoid
    // creating duplicate server records for the same person.
    // ----------------------------------------------------------
    function customerKey(c) {
        if (c.email) return 'email:' + c.email.toLowerCase();
        var name = (c.name || '').toLowerCase().trim();
        var zip = (c.zipCode || c.zip || '').trim();
        return 'namez:' + name + '|' + zip;
    }

    function customerLabel(c) {
        var parts = [c.name || 'Unknown'];
        if (c.email) {
            parts.push(c.email);
        } else if (c.zipCode || c.zip) {
            parts.push('zip:' + (c.zipCode || c.zip));
        }
        return parts.join(' | ');
    }

    // Gather customers from all possible localStorage sources
    function gatherLocalCustomers() {
        var customers = [];
        var seen = {}; // dedupe by customerKey

        // Shared filter: must have at least a name to be useful
        function tryAdd(c) {
            if (!c) return;
            if (!c.name && !c.email) return; // skip completely empty records
            var key = customerKey(c);
            if (seen[key]) return;
            seen[key] = true;
            customers.push(c);
        }

        // Source 1: customerHistory global variable (set by inline script)
        if (typeof customerHistory !== 'undefined' && Array.isArray(customerHistory)) {
            customerHistory.forEach(function (c) {
                tryAdd(c);
            });
        }

        // Source 2: localStorage key 'ameridex_customer_history'
        try {
            var raw = localStorage.getItem('ameridex_customer_history');
            if (raw) {
                var parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    parsed.forEach(function (c) {
                        tryAdd(c);
                    });
                }
            }
        } catch (e) {
            console.warn('[CustomerSync] Could not parse ameridex_customer_history:', e);
        }

        // Source 3: Extract unique customers from savedQuotes in localStorage
        try {
            var quotesRaw = localStorage.getItem('ameridex_saved_quotes');
            if (quotesRaw) {
                var quotes = JSON.parse(quotesRaw);
                if (Array.isArray(quotes)) {
                    quotes.forEach(function (q) {
                        if (q && q.customer) {
                            tryAdd(q.customer);
                        }
                    });
                }
            }
        } catch (e) {
            console.warn('[CustomerSync] Could not parse savedQuotes for customers:', e);
        }

        // Source 4: Also try the global savedQuotes array if available
        if (typeof savedQuotes !== 'undefined' && Array.isArray(savedQuotes)) {
            savedQuotes.forEach(function (q) {
                if (q && q.customer) {
                    tryAdd(q.customer);
                }
            });
        }

        return customers;
    }

    function syncCustomer(customer) {
        var token = getSyncToken();
        if (!token) {
            console.warn('[CustomerSync] No auth token, skipping sync for:', customerLabel(customer));
            return Promise.resolve(null);
        }

        var payload = {
            name: customer.name || 'Unknown',
            email: customer.email || '',
            company: customer.company || '',
            phone: customer.phone || '',
            zipCode: customer.zipCode || customer.zip || ''
        };

        return fetch(API_BASE + '/api/customers', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify(payload)
        })
        .then(function (res) {
            if (!res.ok) {
                return res.json().then(function (err) {
                    console.warn('[CustomerSync] Failed to sync ' + customerLabel(customer) + ':', err.error || res.status);
                    return null;
                });
            }
            return res.json();
        })
        .catch(function (err) {
            console.warn('[CustomerSync] Network error syncing ' + customerLabel(customer) + ':', err.message);
            return null;
        });
    }

    function runSync() {
        // Check if already synced
        if (localStorage.getItem(SYNC_FLAG)) {
            console.log('[CustomerSync] Already synced, skipping.');
            return;
        }

        // Must have auth token
        var token = getSyncToken();
        if (!token) {
            console.log('[CustomerSync] No auth token yet, will retry after login.');
            return;
        }

        var customers = gatherLocalCustomers();

        if (customers.length === 0) {
            console.log('[CustomerSync] No local customers found to sync.');
            localStorage.setItem(SYNC_FLAG, new Date().toISOString());
            return;
        }

        console.log('[CustomerSync] Found ' + customers.length + ' local customer(s) to sync to server...');

        // Sync sequentially to avoid overwhelming the server
        var index = 0;
        var synced = 0;
        var failed = 0;

        function next() {
            if (index >= customers.length) {
                console.log('[CustomerSync] Complete. Synced: ' + synced + ', Failed: ' + failed);
                localStorage.setItem(SYNC_FLAG, new Date().toISOString());
                return;
            }

            var customer = customers[index];
            index++;

            syncCustomer(customer)
                .then(function (result) {
                    if (result) {
                        synced++;
                        console.log('[CustomerSync] Synced: ' + customerLabel(customer));
                    } else {
                        failed++;
                    }
                    next();
                });
        }

        next();
    }

    // Run sync after login event (fired by ameridex-api.js)
    window.addEventListener('ameridex-login', function () {
        // Small delay to let other post-login tasks finish first
        setTimeout(runSync, 2000);
    });

    // Also try immediately in case login already happened
    if (getSyncToken()) {
        setTimeout(runSync, 3000);
    }

    console.log('[CustomerSync] v1.1 loaded. Waiting for auth to sync local customers to server.');

})();
