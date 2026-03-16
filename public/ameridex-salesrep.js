// ============================================================
// AmeriDex Dealer Portal - Sales Rep UI v1.0
// Date: 2026-03-16
// ============================================================
// Provides the dealer context switcher for salesrep users.
// Injects a dropdown in the header to switch between assigned
// dealers and "Direct Sale" mode. Listens for ameridex-login
// to init and ameridex-logout to cleanup.
//
// REQUIRES: ameridex-api.js (v2.26+) loaded first.
//   Uses: window.getCurrentUser(), window.getSalesrepDealers(),
//         window.getActiveDealerCode(), window.switchDealerContext()
// ============================================================

(function () {
    'use strict';

    // ----------------------------------------------------------
    // STYLES
    // ----------------------------------------------------------
    var styles = document.createElement('style');
    styles.textContent = '' +
        '#salesrep-dealer-switcher { display:inline-flex; align-items:center; gap:0.5rem; margin-right:0.75rem; }' +
        '#salesrep-dealer-switcher label { font-size:0.75rem; font-weight:600; color:rgba(255,255,255,0.8); ' +
            'text-transform:uppercase; letter-spacing:0.05em; white-space:nowrap; }' +
        '#salesrep-dealer-select { background:rgba(255,255,255,0.15); color:#fff; border:1px solid rgba(255,255,255,0.3); ' +
            'border-radius:8px; padding:0.35rem 0.6rem; font-size:0.85rem; font-weight:500; cursor:pointer; ' +
            'outline:none; min-width:140px; -webkit-appearance:none; appearance:none; ' +
            'background-image:url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 12 12\'%3E%3Cpath d=\'M3 5l3 3 3-3\' stroke=\'white\' stroke-width=\'1.5\' fill=\'none\'/%3E%3C/svg%3E"); ' +
            'background-repeat:no-repeat; background-position:right 0.5rem center; padding-right:1.75rem; }' +
        '#salesrep-dealer-select:hover { background:rgba(255,255,255,0.25); border-color:rgba(255,255,255,0.5); }' +
        '#salesrep-dealer-select:focus { border-color:rgba(255,255,255,0.6); box-shadow:0 0 0 2px rgba(255,255,255,0.15); }' +
        '#salesrep-dealer-select option { background:#1e3a5f; color:#fff; }' +
        '.salesrep-context-badge { display:inline-block; padding:0.15rem 0.5rem; border-radius:999px; ' +
            'font-size:0.7rem; font-weight:600; text-transform:uppercase; letter-spacing:0.03em; margin-left:0.35rem; }' +
        '.salesrep-context-direct { background:rgba(250,204,21,0.25); color:#fef9c3; }' +
        '.salesrep-context-dealer { background:rgba(34,197,94,0.2); color:#dcfce7; }' +
        '@media (max-width:640px) { ' +
            '#salesrep-dealer-switcher { margin-right:0.35rem; }' +
            '#salesrep-dealer-switcher label { display:none; }' +
            '#salesrep-dealer-select { min-width:100px; font-size:0.8rem; padding:0.3rem 0.5rem; }' +
        '}';
    document.head.appendChild(styles);


    // ----------------------------------------------------------
    // INJECT DEALER SWITCHER
    // ----------------------------------------------------------
    function injectDealerSwitcher() {
        var user = window.getCurrentUser ? window.getCurrentUser() : null;
        if (!user || user.role !== 'salesrep') return;

        // Remove existing if re-injected
        var existing = document.getElementById('salesrep-dealer-switcher');
        if (existing) existing.remove();

        var dealers = window.getSalesrepDealers ? window.getSalesrepDealers() : [];
        var activeCode = window.getActiveDealerCode ? window.getActiveDealerCode() : 'DIRECT';

        var headerActions = document.querySelector('.header-actions');
        if (!headerActions) return;

        var wrapper = document.createElement('div');
        wrapper.id = 'salesrep-dealer-switcher';
        wrapper.className = 'role-injected';

        var label = document.createElement('label');
        label.setAttribute('for', 'salesrep-dealer-select');
        label.textContent = 'Context:';

        var select = document.createElement('select');
        select.id = 'salesrep-dealer-select';

        // Build options
        var directOpt = document.createElement('option');
        directOpt.value = 'DIRECT';
        directOpt.textContent = 'Direct Sale';
        if (activeCode === 'DIRECT') directOpt.selected = true;
        select.appendChild(directOpt);

        dealers.forEach(function (d) {
            var code = typeof d === 'string' ? d : d.dealerCode;
            var name = typeof d === 'object' && d.dealerName ? d.dealerName : code;
            var opt = document.createElement('option');
            opt.value = code;
            opt.textContent = code + (name !== code ? ' - ' + name : '');
            if (code === activeCode) opt.selected = true;
            select.appendChild(opt);
        });

        select.addEventListener('change', function () {
            var newCode = select.value;
            if (typeof window.switchDealerContext === 'function') {
                window.switchDealerContext(newCode);
            }
        });

        wrapper.appendChild(label);
        wrapper.appendChild(select);

        // Insert before the dealer code display
        var dealerInfo = document.getElementById('header-dealer-code');
        if (dealerInfo) {
            headerActions.insertBefore(wrapper, dealerInfo);
        } else {
            headerActions.insertBefore(wrapper, headerActions.firstChild);
        }
    }


    // ----------------------------------------------------------
    // CLEANUP
    // ----------------------------------------------------------
    function removeDealerSwitcher() {
        var el = document.getElementById('salesrep-dealer-switcher');
        if (el) el.remove();
    }


    // ----------------------------------------------------------
    // INIT
    // ----------------------------------------------------------
    window.addEventListener('ameridex-login', function () {
        setTimeout(function () { injectDealerSwitcher(); }, 150);
    });

    window.addEventListener('ameridex-logout', function () {
        removeDealerSwitcher();
    });

    // Re-sync dropdown after dealer switch
    window.addEventListener('ameridex-dealer-switched', function () {
        var select = document.getElementById('salesrep-dealer-select');
        var activeCode = window.getActiveDealerCode ? window.getActiveDealerCode() : null;
        if (select && activeCode) {
            select.value = activeCode;
        }
    });

    console.log('[AmeriDex SalesRep] v1.0 loaded (dealer context switcher).');
})();
