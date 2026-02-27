// ============================================================
// AmeriDex Dealer Portal - Quotes & Customers Page v2.0
// Date: 2026-02-27
// ============================================================
// v2.0 Changes:
//   - Customers tab: switched from card grid to table/list layout
//     so no data is cut off. Columns: Name, Company, Contact,
//     Quotes, Total Value, Last Quote, Dealers (GM/Admin only),
//     Actions.
//   - GM/Admin dealer scope: added a scope toggle bar that lets
//     GM and Admin users switch between "My Dealer" (default,
//     filtered to their dealer code) and "Global" (all dealers).
//     The dealer code input lets them type a specific code to
//     filter. Customer rows show dealer tags so you can see
//     which locations a customer belongs to.
//   - "View Quotes" on a customer now links to that customer's
//     quotes at the currently-scoped dealer location.
//   - Clear filters resets dealer scope back to local/my dealer.
//   - Stats bar shows "At This Dealer" count when scope is not
//     global.
//
// v1.x: original card-based layout, no dealer scope switching
// ============================================================

(function () {
    'use strict';

    var API_BASE = window.AMERIDEX_API_BASE || '';
    var authToken = null;
    var dealerCode = null;
    var userRole = null;

    // --- State ---
    var quotesState = {
        page: 1,
        limit: 20,
        sort: '-updatedAt',
        status: '',
        search: '',
        since: '',
        data: null,
        allData: null
    };

    var customersState = {
        page: 1,
        limit: 20,
        sort: '-lastContact',
        search: '',
        hasQuotes: false,
        data: null,
        allData: null
    };

    // Dealer scope state (GM/Admin feature)
    var dealerScope = {
        mode: 'local',       // 'local' = my dealer code, 'global' = all dealers, 'specific' = typed code
        filterCode: ''       // when mode is 'specific', this holds the typed dealer code
    };

    var activeTab = 'quotes';

    // ============================================================
    // AUTH
    // ============================================================
    function checkAuth() {
        authToken = sessionStorage.getItem('ameridex-token') || null;

        var settings = null;
        try {
            var raw = localStorage.getItem('ameridex_dealer_settings');
            if (raw) settings = JSON.parse(raw);
        } catch (e) {}

        dealerCode = (settings && settings.dealerCode) ? settings.dealerCode : null;
        userRole = (settings && settings.role) ? settings.role : null;

        if (!authToken && !dealerCode) {
            window.location.href = 'dealer-portal.html';
            return false;
        }

        var dealerInfo = document.getElementById('header-dealer-code');
        if (dealerInfo && settings) {
            var parts = [];
            if (settings.dealerCode) parts.push('Dealer: ' + settings.dealerCode);
            if (settings.dealerName) parts.push(settings.dealerName);
            if (settings.role) parts.push(settings.role.toUpperCase());
            dealerInfo.textContent = parts.join(' | ') || '';
        }

        return true;
    }

    function handleLogout() {
        try {
            sessionStorage.removeItem('ameridex-token');
            var raw = localStorage.getItem('ameridex_dealer_settings');
            if (raw) {
                var settings = JSON.parse(raw);
                settings.dealerCode = '';
                localStorage.setItem('ameridex_dealer_settings', JSON.stringify(settings));
            }
        } catch (e) {}
        window.location.href = 'dealer-portal.html';
    }

    function isElevatedRole() {
        return userRole === 'gm' || userRole === 'admin';
    }

    // ============================================================
    // API HELPERS
    // ============================================================
    function apiFetch(path) {
        var headers = { 'Content-Type': 'application/json' };
        if (authToken) {
            headers['Authorization'] = 'Bearer ' + authToken;
        } else if (dealerCode) {
            headers['X-Dealer-Code'] = dealerCode;
        }

        return fetch(API_BASE + path, { method: 'GET', headers: headers })
            .then(function (res) {
                if (res.status === 401 || res.status === 403) {
                    handleLogout();
                    throw new Error('Unauthorized');
                }
                if (!res.ok) throw new Error('API error: ' + res.status);
                return res.json();
            });
    }

    // ============================================================
    // UTILITY
    // ============================================================
    function escapeHTML(str) {
        if (!str) return '';
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function formatCurrency(amt) {
        var n = Number(amt) || 0;
        return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
    }

    function formatDate(isoStr) {
        if (!isoStr) return '';
        var d = new Date(isoStr);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    function formatDateShort(isoStr) {
        if (!isoStr) return '';
        var d = new Date(isoStr);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    function computeSinceDate(filterValue) {
        if (!filterValue) return '';
        var now = new Date();
        if (filterValue === 'today') {
            now.setHours(0, 0, 0, 0);
            return now.toISOString();
        }
        if (filterValue === 'year') {
            return new Date(now.getFullYear(), 0, 1).toISOString();
        }
        var days = parseInt(filterValue);
        if (!isNaN(days)) {
            now.setDate(now.getDate() - days);
            now.setHours(0, 0, 0, 0);
            return now.toISOString();
        }
        return '';
    }

    // ============================================================
    // DEALER SCOPE BAR (GM/Admin only)
    // ============================================================
    function renderDealerScopeBar(containerId) {
        var container = document.getElementById(containerId);
        if (!container) return;

        if (!isElevatedRole()) {
            container.innerHTML = '';
            return;
        }

        var isLocal = dealerScope.mode === 'local';
        var isGlobal = dealerScope.mode === 'global';

        var modeLabel = 'Viewing: My Location (' + escapeHTML(dealerCode) + ')';
        var dotClass = 'scope-dot-local';
        if (isGlobal) {
            modeLabel = 'Viewing: All Dealers (Global)';
            dotClass = 'scope-dot-global';
        } else if (dealerScope.mode === 'specific' && dealerScope.filterCode) {
            modeLabel = 'Viewing: Dealer ' + escapeHTML(dealerScope.filterCode.toUpperCase());
            dotClass = 'scope-dot-global';
        }

        var html = '<div class="dealer-scope-bar">';
        html += '<label>Dealer Scope:</label>';
        html += '<div class="scope-toggle">';
        html += '<button class="scope-toggle-btn' + (isLocal ? ' active' : '') + '" data-scope="local">My Dealer</button>';
        html += '<button class="scope-toggle-btn' + (isGlobal ? ' active' : '') + '" data-scope="global">Global</button>';
        html += '</div>';
        html += '<input type="text" id="' + containerId + '-code-input" placeholder="Dealer code..." value="' + escapeHTML(dealerScope.filterCode || dealerCode || '') + '" title="Type a dealer code and press Enter to filter">';
        html += '<div class="scope-indicator"><span class="scope-dot ' + dotClass + '"></span>' + modeLabel + '</div>';
        html += '</div>';

        container.innerHTML = html;

        // Wire up toggle buttons
        container.querySelectorAll('.scope-toggle-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var scope = btn.getAttribute('data-scope');
                if (scope === 'local') {
                    dealerScope.mode = 'local';
                    dealerScope.filterCode = '';
                    var codeInput = document.getElementById(containerId + '-code-input');
                    if (codeInput) codeInput.value = dealerCode || '';
                } else {
                    dealerScope.mode = 'global';
                    dealerScope.filterCode = '';
                    var codeInput = document.getElementById(containerId + '-code-input');
                    if (codeInput) codeInput.value = '';
                }
                resetAndRefresh();
            });
        });

        // Wire up dealer code input
        var codeInput = document.getElementById(containerId + '-code-input');
        if (codeInput) {
            codeInput.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') {
                    var val = codeInput.value.trim().toUpperCase();
                    if (val && val !== dealerCode) {
                        dealerScope.mode = 'specific';
                        dealerScope.filterCode = val;
                    } else if (val === dealerCode || !val) {
                        dealerScope.mode = val ? 'local' : 'global';
                        dealerScope.filterCode = '';
                    }
                    resetAndRefresh();
                }
            });
        }
    }

    function resetAndRefresh() {
        // Reset pagination and caches
        quotesState.page = 1;
        quotesState.allData = null;
        customersState.page = 1;
        customersState.allData = null;

        // Re-render scope bars on both tabs
        renderDealerScopeBar('quotes-dealer-scope');
        renderDealerScopeBar('customers-dealer-scope');

        // Refresh current tab
        if (activeTab === 'quotes') {
            fetchQuotes();
        } else {
            fetchCustomers();
        }
    }

    // Client-side filter: given an array of items with a dealers[] array,
    // filter based on current dealer scope
    function filterByDealerScope(items, getDealers) {
        if (!isElevatedRole()) return items; // non-elevated users are already server-filtered
        if (dealerScope.mode === 'global') return items; // show everything

        var code = dealerScope.mode === 'specific' ? dealerScope.filterCode : dealerCode;
        if (!code) return items;

        return items.filter(function (item) {
            var dealers = getDealers(item);
            if (!dealers || !Array.isArray(dealers)) return true; // no dealer info, include it
            return dealers.includes(code);
        });
    }

    // ============================================================
    // QUOTES
    // ============================================================
    function buildQuotesUrl() {
        var params = [
            'page=' + quotesState.page,
            'limit=' + quotesState.limit,
            'sort=' + encodeURIComponent(quotesState.sort)
        ];
        if (quotesState.status) params.push('status=' + encodeURIComponent(quotesState.status));
        if (quotesState.search) params.push('search=' + encodeURIComponent(quotesState.search));
        if (quotesState.since) params.push('since=' + encodeURIComponent(quotesState.since));
        return '/api/quotes?' + params.join('&');
    }

    function fetchQuotes() {
        var contentEl = document.getElementById('quotes-content');
        contentEl.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><p>Loading quotes...</p></div>';

        apiFetch(buildQuotesUrl())
            .then(function (data) {
                quotesState.data = data;
                renderQuoteCards(data);
                renderPagination('quotes-pagination', data.pagination, function (page) {
                    quotesState.page = page;
                    fetchQuotes();
                });
                if (!quotesState.allData) {
                    apiFetch('/api/quotes?page=1&limit=1')
                        .then(function (statsData) {
                            quotesState.allData = statsData;
                            renderQuotesStats(statsData.pagination, data.pagination);
                        })
                        .catch(function () {});
                } else {
                    renderQuotesStats(quotesState.allData.pagination, data.pagination);
                }
            })
            .catch(function (err) {
                console.error('[QuotesPage] Error fetching quotes:', err);
                contentEl.innerHTML = '<div class="empty-state"><div class="empty-state-icon">\u26a0\ufe0f</div><h3>Unable to load quotes</h3><p>Please check your connection and try again.</p></div>';
            });
    }

    function renderQuotesStats(allPag, filteredPag) {
        var container = document.getElementById('quotes-stats');
        var totalAll = allPag ? allPag.totalCount : 0;
        var totalFiltered = filteredPag ? filteredPag.totalCount : 0;

        container.innerHTML =
            '<div class="stat-card"><div class="stat-value">' + totalAll + '</div><div class="stat-label">Total Quotes</div></div>' +
            '<div class="stat-card"><div class="stat-value">' + totalFiltered + '</div><div class="stat-label">Showing</div></div>';
    }

    function renderQuoteCards(data) {
        var contentEl = document.getElementById('quotes-content');
        var quotes = data.quotes || [];

        if (quotes.length === 0) {
            contentEl.innerHTML = '<div class="empty-state"><div class="empty-state-icon">\ud83d\udccb</div><h3>No quotes found</h3><p>Try adjusting your filters or create a new quote.</p></div>';
            return;
        }

        var html = '<div class="cards-grid">';
        quotes.forEach(function (q) {
            var customerName = q.customer ? (q.customer.name || 'No Name') : 'No Customer';
            var company = q.customer ? (q.customer.company || '') : '';
            var status = q.status || 'draft';
            var statusClass = 'status-' + status;
            var itemCount = (q.lineItems || []).length;
            var total = q.totalAmount || 0;
            var quoteNum = q.quoteNumber || q.quoteId || 'Draft';
            var dateStr = formatDate(q.updatedAt || q.createdAt);

            html += '<div class="quote-card">';
            html += '<div class="quote-card-header">';
            html += '<div class="quote-card-id">' + escapeHTML(quoteNum) + '</div>';
            html += '<span class="quote-card-status ' + statusClass + '">' + escapeHTML(status) + '</span>';
            html += '</div>';
            html += '<div>';
            html += '<div class="quote-card-customer">' + escapeHTML(customerName) + '</div>';
            if (company) html += '<div class="quote-card-company">' + escapeHTML(company) + '</div>';
            html += '</div>';
            html += '<div class="quote-card-meta">';
            html += '<div><span class="quote-card-total">' + formatCurrency(total) + '</span> <span class="quote-card-items">(' + itemCount + ' item' + (itemCount !== 1 ? 's' : '') + ')</span></div>';
            html += '<div class="quote-card-date">' + escapeHTML(dateStr) + '</div>';
            html += '</div>';
            html += '<div class="quote-card-actions">';
            html += '<a href="dealer-portal.html?quoteId=' + encodeURIComponent(q.id) + '" class="btn btn-primary btn-sm">Load Quote</a>';
            html += '<button class="btn btn-outline btn-sm" data-duplicate="' + escapeHTML(q.id) + '">Duplicate</button>';
            html += '</div>';
            html += '</div>';
        });
        html += '</div>';
        contentEl.innerHTML = html;

        contentEl.querySelectorAll('[data-duplicate]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var quoteId = btn.getAttribute('data-duplicate');
                if (!confirm('Duplicate this quote?')) return;
                duplicateQuote(quoteId);
            });
        });
    }

    function duplicateQuote(quoteId) {
        var headers = { 'Content-Type': 'application/json' };
        if (authToken) {
            headers['Authorization'] = 'Bearer ' + authToken;
        } else if (dealerCode) {
            headers['X-Dealer-Code'] = dealerCode;
        }

        fetch(API_BASE + '/api/quotes/' + quoteId + '/duplicate', {
            method: 'POST',
            headers: headers
        })
        .then(function (res) {
            if (!res.ok) throw new Error('Duplicate failed');
            return res.json();
        })
        .then(function (newQuote) {
            alert('Quote duplicated! New quote: ' + (newQuote.quoteNumber || newQuote.id));
            quotesState.allData = null;
            fetchQuotes();
        })
        .catch(function (err) {
            alert('Failed to duplicate quote. Please try again.');
            console.error('[QuotesPage] Duplicate error:', err);
        });
    }

    // ============================================================
    // CUSTOMERS
    // ============================================================
    function buildCustomersUrl() {
        var params = [
            'page=' + customersState.page,
            'limit=' + customersState.limit,
            'sort=' + encodeURIComponent(customersState.sort)
        ];
        if (customersState.search) params.push('search=' + encodeURIComponent(customersState.search));
        if (customersState.hasQuotes) params.push('hasQuotes=true');
        return '/api/customers?' + params.join('&');
    }

    function fetchCustomers() {
        var contentEl = document.getElementById('customers-content');
        contentEl.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><p>Loading customers...</p></div>';

        apiFetch(buildCustomersUrl())
            .then(function (data) {
                customersState.data = data;

                // Apply client-side dealer scope filtering
                var customers = data.customers || [];
                var scopedCustomers = filterByDealerScope(customers, function (c) { return c.dealers; });
                var scopedData = {
                    customers: scopedCustomers,
                    pagination: data.pagination
                };

                renderCustomerTable(scopedData);
                renderPagination('customers-pagination', data.pagination, function (page) {
                    customersState.page = page;
                    fetchCustomers();
                });
                if (!customersState.allData) {
                    apiFetch('/api/customers?page=1&limit=1')
                        .then(function (statsData) {
                            customersState.allData = statsData;
                            renderCustomersStats(statsData.pagination, data.pagination, scopedCustomers.length);
                        })
                        .catch(function () {});
                } else {
                    renderCustomersStats(customersState.allData.pagination, data.pagination, scopedCustomers.length);
                }
            })
            .catch(function (err) {
                console.error('[QuotesPage] Error fetching customers:', err);
                contentEl.innerHTML = '<div class="empty-state"><div class="empty-state-icon">\u26a0\ufe0f</div><h3>Unable to load customers</h3><p>Please check your connection and try again.</p></div>';
            });
    }

    function renderCustomersStats(allPag, filteredPag, scopedCount) {
        var container = document.getElementById('customers-stats');
        var totalAll = allPag ? allPag.totalCount : 0;
        var totalFiltered = filteredPag ? filteredPag.totalCount : 0;

        var html =
            '<div class="stat-card"><div class="stat-value">' + totalAll + '</div><div class="stat-label">Total Customers</div></div>' +
            '<div class="stat-card"><div class="stat-value">' + totalFiltered + '</div><div class="stat-label">Matching Filters</div></div>';

        // Show scoped count if different from filtered (GM/Admin with local scope)
        if (isElevatedRole() && dealerScope.mode !== 'global' && scopedCount !== undefined) {
            html += '<div class="stat-card"><div class="stat-value">' + scopedCount + '</div><div class="stat-label">At This Dealer</div></div>';
        }

        container.innerHTML = html;
    }

    // ============================================================
    // CUSTOMER TABLE (List layout, replaces cards)
    // ============================================================
    function renderCustomerTable(data) {
        var contentEl = document.getElementById('customers-content');
        var customers = data.customers || [];

        if (customers.length === 0) {
            var emptyMsg = 'No customers found';
            var emptyHint = 'Customers are automatically created when you save quotes.';
            if (isElevatedRole() && dealerScope.mode === 'local') {
                emptyHint = 'No customers at this dealer location. Try switching to Global to search across all dealers.';
            }
            contentEl.innerHTML = '<div class="empty-state"><div class="empty-state-icon">\ud83d\udc65</div><h3>' + emptyMsg + '</h3><p>' + emptyHint + '</p></div>';
            return;
        }

        var showDealerCol = isElevatedRole();

        var html = '<div class="customer-table-wrap">';
        html += '<table class="customer-table">';
        html += '<thead><tr>';
        html += '<th>Name</th>';
        html += '<th>Company</th>';
        html += '<th>Contact</th>';
        html += '<th>Quotes</th>';
        html += '<th>Total Value</th>';
        html += '<th>Last Quote</th>';
        if (showDealerCol) html += '<th>Dealers</th>';
        html += '<th>Actions</th>';
        html += '</tr></thead>';
        html += '<tbody>';

        customers.forEach(function (c) {
            html += '<tr>';

            // Name
            html += '<td class="ct-name">' + escapeHTML(c.name || 'Unknown') + '</td>';

            // Company
            html += '<td class="ct-company">' + escapeHTML(c.company || '') + '</td>';

            // Contact (email + phone stacked)
            html += '<td class="ct-contact">';
            if (c.email) html += '<a href="mailto:' + escapeHTML(c.email) + '">' + escapeHTML(c.email) + '</a><br>';
            if (c.phone) html += '<span>' + escapeHTML(c.phone) + '</span>';
            if (!c.email && !c.phone) html += '<span style="color:#d1d5db;">No contact</span>';
            html += '</td>';

            // Quotes count
            html += '<td class="ct-stat">' + (c.quoteCount || 0) + '</td>';

            // Total Value
            html += '<td class="ct-stat">' + formatCurrency(c.totalValue || 0) + '</td>';

            // Last Quote Date
            html += '<td class="ct-date">' + (c.lastQuoteDate ? formatDate(c.lastQuoteDate) : (c.lastContact ? formatDate(c.lastContact) : 'N/A')) + '</td>';

            // Dealers column (GM/Admin only)
            if (showDealerCol) {
                html += '<td><div class="ct-dealers">';
                if (c.dealers && c.dealers.length > 0) {
                    c.dealers.forEach(function (d) {
                        var tagClass = (d === dealerCode) ? 'dealer-tag dealer-tag-mine' : 'dealer-tag';
                        html += '<span class="' + tagClass + '">' + escapeHTML(d) + '</span>';
                    });
                } else {
                    html += '<span style="color:#d1d5db;font-size:0.78rem;">None</span>';
                }
                html += '</div></td>';
            }

            // Actions
            html += '<td class="ct-actions">';
            html += '<button class="btn btn-outline btn-xs" data-view-quotes="' + escapeHTML(c.id) + '" data-customer-name="' + escapeHTML(c.name) + '">View Quotes</button> ';
            html += '<a href="dealer-portal.html?newQuote=1&custName=' + encodeURIComponent(c.name || '') + '&custEmail=' + encodeURIComponent(c.email || '') + '&custCompany=' + encodeURIComponent(c.company || '') + '&custPhone=' + encodeURIComponent(c.phone || '') + '" class="btn btn-primary btn-xs">+ Quote</a>';
            html += '</td>';

            html += '</tr>';
        });

        html += '</tbody></table>';
        html += '</div>';
        contentEl.innerHTML = html;

        // Wire up "View Quotes" buttons
        contentEl.querySelectorAll('[data-view-quotes]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var customerName = btn.getAttribute('data-customer-name');
                switchTab('quotes');
                document.getElementById('quotes-search').value = customerName || '';
                quotesState.search = customerName || '';
                quotesState.page = 1;
                fetchQuotes();
            });
        });
    }

    // ============================================================
    // PAGINATION RENDERER
    // ============================================================
    function renderPagination(containerId, pag, onPageChange) {
        var container = document.getElementById(containerId);
        if (!pag || pag.totalPages <= 1) {
            container.innerHTML = '';
            return;
        }

        var startItem = ((pag.page - 1) * pag.limit) + 1;
        var endItem = Math.min(pag.page * pag.limit, pag.totalCount);

        var html = '<div class="pagination">';
        html += '<div class="pagination-info">Showing ' + startItem + ' to ' + endItem + ' of ' + pag.totalCount + '</div>';
        html += '<div class="pagination-controls">';

        html += '<button class="pagination-btn" data-page="' + (pag.page - 1) + '"' + (pag.hasPrev ? '' : ' disabled') + '>&laquo; Prev</button>';

        var startPage = Math.max(1, pag.page - 2);
        var endPage = Math.min(pag.totalPages, startPage + 4);
        if (endPage - startPage < 4) startPage = Math.max(1, endPage - 4);

        for (var i = startPage; i <= endPage; i++) {
            html += '<button class="pagination-btn' + (i === pag.page ? ' active' : '') + '" data-page="' + i + '">' + i + '</button>';
        }

        html += '<button class="pagination-btn" data-page="' + (pag.page + 1) + '"' + (pag.hasNext ? '' : ' disabled') + '>Next &raquo;</button>';

        html += '</div></div>';
        container.innerHTML = html;

        container.querySelectorAll('.pagination-btn[data-page]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                if (btn.disabled) return;
                var page = parseInt(btn.getAttribute('data-page'));
                if (!isNaN(page) && page >= 1) {
                    onPageChange(page);
                    window.scrollTo({ top: 200, behavior: 'smooth' });
                }
            });
        });
    }

    // ============================================================
    // TAB SWITCHING
    // ============================================================
    function switchTab(tab) {
        activeTab = tab;
        document.getElementById('tab-quotes').classList.toggle('active', tab === 'quotes');
        document.getElementById('tab-customers').classList.toggle('active', tab === 'customers');

        if (tab === 'quotes') {
            document.getElementById('view-quotes').classList.remove('app-hidden');
            document.getElementById('view-customers').classList.add('app-hidden');
            renderDealerScopeBar('quotes-dealer-scope');
            fetchQuotes();
        } else {
            document.getElementById('view-quotes').classList.add('app-hidden');
            document.getElementById('view-customers').classList.remove('app-hidden');
            renderDealerScopeBar('customers-dealer-scope');
            fetchCustomers();
        }
    }

    // ============================================================
    // DEBOUNCE
    // ============================================================
    function debounce(fn, delay) {
        var timer;
        return function () {
            clearTimeout(timer);
            timer = setTimeout(fn, delay);
        };
    }

    // ============================================================
    // INIT
    // ============================================================
    function init() {
        if (!checkAuth()) return;

        // Logout
        document.getElementById('logout-btn').addEventListener('click', handleLogout);

        // Tabs
        document.getElementById('tab-quotes').addEventListener('click', function () { switchTab('quotes'); });
        document.getElementById('tab-customers').addEventListener('click', function () { switchTab('customers'); });

        // --- Quotes filters ---
        var quotesSearchInput = document.getElementById('quotes-search');
        var quotesStatusFilter = document.getElementById('quotes-status-filter');
        var quotesDateFilter = document.getElementById('quotes-date-filter');
        var quotesSortSelect = document.getElementById('quotes-sort');

        var debouncedQuotesSearch = debounce(function () {
            quotesState.search = quotesSearchInput.value.trim();
            quotesState.page = 1;
            fetchQuotes();
        }, 350);

        quotesSearchInput.addEventListener('input', debouncedQuotesSearch);

        quotesStatusFilter.addEventListener('change', function () {
            quotesState.status = quotesStatusFilter.value;
            quotesState.page = 1;
            fetchQuotes();
        });

        quotesDateFilter.addEventListener('change', function () {
            quotesState.since = computeSinceDate(quotesDateFilter.value);
            quotesState.page = 1;
            fetchQuotes();
        });

        quotesSortSelect.addEventListener('change', function () {
            quotesState.sort = quotesSortSelect.value;
            quotesState.page = 1;
            fetchQuotes();
        });

        document.getElementById('quotes-clear-filters').addEventListener('click', function () {
            quotesSearchInput.value = '';
            quotesStatusFilter.value = '';
            quotesDateFilter.value = '';
            quotesSortSelect.value = '-updatedAt';
            quotesState.search = '';
            quotesState.status = '';
            quotesState.since = '';
            quotesState.sort = '-updatedAt';
            quotesState.page = 1;
            // Reset dealer scope to local
            dealerScope.mode = 'local';
            dealerScope.filterCode = '';
            renderDealerScopeBar('quotes-dealer-scope');
            fetchQuotes();
        });

        // --- Customers filters ---
        var customersSearchInput = document.getElementById('customers-search');
        var customersSortSelect = document.getElementById('customers-sort');
        var customersHasQuotes = document.getElementById('customers-has-quotes');

        var debouncedCustomersSearch = debounce(function () {
            customersState.search = customersSearchInput.value.trim();
            customersState.page = 1;
            fetchCustomers();
        }, 350);

        customersSearchInput.addEventListener('input', debouncedCustomersSearch);

        customersSortSelect.addEventListener('change', function () {
            customersState.sort = customersSortSelect.value;
            customersState.page = 1;
            fetchCustomers();
        });

        customersHasQuotes.addEventListener('change', function () {
            customersState.hasQuotes = customersHasQuotes.checked;
            customersState.page = 1;
            fetchCustomers();
        });

        document.getElementById('customers-clear-filters').addEventListener('click', function () {
            customersSearchInput.value = '';
            customersSortSelect.value = '-lastContact';
            customersHasQuotes.checked = false;
            customersState.search = '';
            customersState.sort = '-lastContact';
            customersState.hasQuotes = false;
            customersState.page = 1;
            // Reset dealer scope to local
            dealerScope.mode = 'local';
            dealerScope.filterCode = '';
            renderDealerScopeBar('customers-dealer-scope');
            fetchCustomers();
        });

        // --- Render dealer scope bars if elevated role ---
        renderDealerScopeBar('quotes-dealer-scope');
        renderDealerScopeBar('customers-dealer-scope');

        // --- Check URL params ---
        var urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('tab') === 'customers') {
            switchTab('customers');
        } else {
            fetchQuotes();
        }
    }

    // Run on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
