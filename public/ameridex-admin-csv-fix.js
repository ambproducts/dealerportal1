// ============================================================
// AmeriDex Admin CSV Security Patch v1.0
// Date: 2026-02-25
// ============================================================
// Patches the admin panel's CSV export to prevent Excel formula
// injection. Must be loaded AFTER ameridex-admin.js.
//
// Attack vector: A customer name like "=HYPERLINK(\"http://evil.com\")"
// would execute as a formula when the CSV is opened in Excel/Sheets.
//
// Fix: Prepend a single-quote to any field starting with =, +, -, @,
// tab, or carriage return. This is the OWASP-recommended mitigation.
// ============================================================

(function () {
    'use strict';

    // CSV formula injection prevention
    function csvSafe(str) {
        if (!str) return '';
        var s = String(str);
        if (/^[=+\-@\t\r]/.test(s)) {
            s = "'" + s;
        }
        return s.replace(/"/g, '""');
    }

    function patchExportButton() {
        var btn = document.getElementById('admin-export-csv-btn');
        if (!btn || btn._csvPatched) return;

        var newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        newBtn._csvPatched = true;

        newBtn.addEventListener('click', function () {
            var _api = window.ameridexAPI;
            if (!_api) { alert('API not available'); return; }

            _api('GET', '/api/admin/quotes')
                .then(function (quotes) {
                    if (!quotes || quotes.length === 0) { alert('No quotes to export'); return; }

                    var csv = 'Quote Number,Dealer,Customer,Company,Email,Phone,Zip,Status,Items,Total,Special Instructions,Date\n';
                    quotes.forEach(function (q) {
                        var cn = csvSafe((q.customer && q.customer.name) || '');
                        var cc = csvSafe((q.customer && q.customer.company) || '');
                        var ce = csvSafe((q.customer && q.customer.email) || '');
                        var cp = csvSafe((q.customer && q.customer.phone) || '');
                        var cz = csvSafe((q.customer && q.customer.zipCode) || '');
                        var si = csvSafe((q.specialInstructions || '').replace(/\n/g, ' '));
                        var ds = '';
                        try { ds = new Date(q.updatedAt || q.createdAt).toISOString().split('T')[0]; } catch(e) {}
                        csv += '"' + csvSafe(q.quoteNumber || q.id) + '",'
                            + '"' + csvSafe(q.dealerCode || '') + '",'
                            + '"' + cn + '",'
                            + '"' + cc + '",'
                            + '"' + ce + '",'
                            + '"' + cp + '",'
                            + '"' + cz + '",'
                            + '"' + (q.status || 'draft') + '",'
                            + (q.lineItems || []).length + ','
                            + (q.totalAmount || 0).toFixed(2) + ','
                            + '"' + si + '",'
                            + '"' + ds + '"\n';
                    });

                    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                    var url = URL.createObjectURL(blob);
                    var a = document.createElement('a');
                    a.href = url;
                    a.download = 'ameridex-quotes-' + new Date().toISOString().split('T')[0] + '.csv';
                    a.click();
                    URL.revokeObjectURL(url);
                })
                .catch(function (err) { alert('Export failed: ' + err.message); });
        });

        console.log('[admin-csv-fix] Export CSV button patched with formula injection prevention.');
    }

    patchExportButton();

    var observer = new MutationObserver(function () {
        var btn = document.getElementById('admin-export-csv-btn');
        if (btn && !btn._csvPatched) {
            patchExportButton();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    console.log('[admin-csv-fix] v1.0 loaded.');
})();
