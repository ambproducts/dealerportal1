// ============================================================
// AmeriDex Dealer Portal - Quote Editor v1.2
// Date: 2026-03-02
// ============================================================
// v1.2 CHANGES:
//
//   PERF: Address population is now instant on load.
//     v1.1 called populateAddressFields() at 120ms (inside the
//     loadQuote wrapper) AND again at 400ms / 1800ms via
//     bootstrapCheck(). Since ameridex-api.js v2.19 now owns
//     restoreQuoteToDOM() and calls it synchronously, the
//     address fields are already populated before our wrapper
//     runs. The 120ms delay only existed to wait for api.js
//     to finish — that wait is no longer needed.
//     Changes:
//       - loadQuote wrapper: setTimeout(120) -> setTimeout(0)
//         (still need 0 to yield to api.js's synchronous
//          restoreQuoteToDOM call, but 120ms visible lag gone)
//       - bootstrapCheck delay after ameridex-login: 400ms -> 0
//       - Fallback bootstrapCheck: 1800ms -> 300ms
//       - populateAddressFields() retained as safety net but
//         now only fills fields if they are still empty, so
//         it never overwrites what api.js already wrote.
//
//   FEAT: Status-aware Edit button.
//     Submitted/approved quotes now block Edit for frontdesk
//     role. Only gm or admin can click Edit on those statuses.
//     The button shows a tooltip explaining why it is locked.
//     Revision status re-enables Edit for all roles (dealer
//     has been told changes are needed).
//
//   FEAT: Request Revision modal (GM / admin only).
//     When a submitted or approved quote is loaded, a red
//     "Request Revision" button appears in the banner for
//     gm/admin roles. Clicking it opens a modal with:
//       - Revision reason textarea (required)
//       - Send to AmeriDex checkbox (default checked)
//     On confirm:
//       1. PATCH /api/quotes/:id/revision { reason, notify }
//       2. quote.status -> 'revision' locally
//       3. Banner and Edit button update immediately
//       4. If notify=true, server emails AmeriDex
//
// v1.1 FIXES retained:
//   - syncQuoteFromDOM patched for address/city/state
//   - Done Editing: sync -> save -> lock order
//   - No dependency on private restoreQuoteToDOM
// ============================================================

(function () {
    'use strict';

    // ----------------------------------------------------------
    // NULL-GUARD: Inject stubs for removed section IDs
    // ----------------------------------------------------------
    var REMOVED_IDS = ['saved-quotes-section', 'customers-section'];

    function injectRemovedIdStubs() {
        REMOVED_IDS.forEach(function (id) {
            if (!document.getElementById(id)) {
                var stub = document.createElement('div');
                stub.id = id;
                stub.setAttribute('aria-hidden', 'true');
                stub.style.cssText = 'display:none!important;position:absolute;width:0;height:0;overflow:hidden;pointer-events:none;';
                document.body.appendChild(stub);
            }
        });
    }
    setTimeout(injectRemovedIdStubs, 20);
    setTimeout(injectRemovedIdStubs, 500);


    // ----------------------------------------------------------
    // ROLE HELPER
    // ----------------------------------------------------------
    var ELEVATED_ROLES = ['gm', 'admin'];

    function getCurrentRole() {
        if (typeof window.getCurrentUser === 'function') {
            var u = window.getCurrentUser();
            if (u && u.role) return u.role;
        }
        if (window.dealerSettings && window.dealerSettings.role) {
            return window.dealerSettings.role;
        }
        return 'dealer';
    }

    function isElevated() {
        return ELEVATED_ROLES.indexOf(getCurrentRole()) > -1;
    }


    // ----------------------------------------------------------
    // HELPER: Write address fields from customer obj to DOM
    // v1.2: Only fills if field is currently empty (safety net)
    // ----------------------------------------------------------
    function populateAddressFields(customer) {
        var c = customer || {};
        var addrEl  = document.getElementById('cust-address');
        var cityEl  = document.getElementById('cust-city');
        var stateEl = document.getElementById('cust-state');
        // Only write if api.js hasn't already populated them
        if (addrEl  && !addrEl.value)  addrEl.value  = c.address || '';
        if (cityEl  && !cityEl.value)  cityEl.value  = c.city    || '';
        if (stateEl && !stateEl.value) stateEl.value = c.state   || '';
    }


    // ----------------------------------------------------------
    // PATCH: syncQuoteFromDOM to include address fields
    // ----------------------------------------------------------
    function patchSyncQuoteFromDOM() {
        var _orig = window.syncQuoteFromDOM;
        if (typeof _orig !== 'function') {
            setTimeout(patchSyncQuoteFromDOM, 150);
            return;
        }
        window.syncQuoteFromDOM = function syncQuoteFromDOM() {
            _orig.apply(this, arguments);
            var q    = window.currentQuote;
            var cust = q ? q.customer : null;
            if (!cust) return;
            var addrEl  = document.getElementById('cust-address');
            var cityEl  = document.getElementById('cust-city');
            var stateEl = document.getElementById('cust-state');
            if (addrEl)  cust.address = addrEl.value.trim();
            if (cityEl)  cust.city    = cityEl.value.trim();
            if (stateEl) cust.state   = stateEl.value.trim();
        };
        console.log('[QuoteEditor v1.2] syncQuoteFromDOM patched.');
    }


    // ----------------------------------------------------------
    // READ-ONLY / EDIT MODE
    // ----------------------------------------------------------
    var _editMode    = false;
    var _quoteLoaded = false;

    var FORM_SELECTOR = [
        '#order-form input',
        '#order-form select',
        '#order-form textarea',
        '#order-form button:not(#edit-quote-btn):not(#new-quote-btn):not(#revision-btn)'
    ].join(', ');

    var ALWAYS_ENABLED_IDS = ['download-pdf-btn', 'print-btn', 'edit-quote-btn', 'new-quote-btn', 'revision-btn'];

    function lockForm() {
        _editMode = false;
        document.querySelectorAll(FORM_SELECTOR).forEach(function (el) {
            if (ALWAYS_ENABLED_IDS.indexOf(el.id) === -1) {
                el.disabled = true;
                el.setAttribute('data-qe-locked', '1');
            }
        });
        setStatusText('');
        updateBannerButtons();
    }

    function unlockForm() {
        _editMode = true;
        document.querySelectorAll('[data-qe-locked]').forEach(function (el) {
            el.disabled = false;
            el.removeAttribute('data-qe-locked');
        });
        updateBannerButtons();
        setStatusText('Edit mode active');
    }

    // Returns true if the current quote status allows editing
    // for the current role.
    function canEdit() {
        var q = window.currentQuote;
        var status = (q && q.status) || 'draft';
        // draft and revision are always editable
        if (status === 'draft' || status === 'revision') return true;
        // submitted / approved / reviewed require gm or admin
        return isElevated();
    }

    function updateBannerButtons() {
        var editBtn = document.getElementById('edit-quote-btn');
        var revBtn  = document.getElementById('revision-btn');
        if (!editBtn) return;

        var q = window.currentQuote;
        var status = (q && q.status) || 'draft';

        if (_editMode) {
            editBtn.textContent      = 'Done Editing';
            editBtn.style.background = '#10b981';
            editBtn.disabled         = false;
            editBtn.title            = '';
        } else {
            editBtn.textContent = '\u270E Edit Quote';
            editBtn.style.background = '#2563eb';
            if (!canEdit()) {
                editBtn.disabled = true;
                editBtn.style.background = '#374151';
                editBtn.title = 'Only GM or Admin can edit ' + status + ' quotes';
            } else {
                editBtn.disabled = false;
                editBtn.title    = '';
            }
        }

        // Revision button: visible to gm/admin on submitted/approved quotes only
        if (revBtn) {
            var showRevBtn = isElevated() &&
                (status === 'submitted' || status === 'approved' || status === 'reviewed');
            revBtn.style.display = showRevBtn ? 'inline-block' : 'none';
        }
    }


    // ----------------------------------------------------------
    // BANNER
    // ----------------------------------------------------------
    var BANNER_ID = 'qe-edit-banner';

    function injectBannerStyles() {
        if (document.getElementById('qe-edit-banner-styles')) return;
        var s = document.createElement('style');
        s.id  = 'qe-edit-banner-styles';
        s.textContent = [
            '#' + BANNER_ID + ' {',
            '  position:sticky; top:0; z-index:900;',
            '  display:flex; align-items:center; gap:10px;',
            '  padding:10px 20px;',
            '  background:#1a1f35;',
            '  border-bottom:1px solid #2d3250;',
            '  box-shadow:0 2px 12px rgba(0,0,0,0.4);',
            '}',
            '#' + BANNER_ID + '.qe-hidden { display:none !important; }',
            '#qe-quote-label {',
            '  flex:1; font-size:0.88rem; font-weight:600;',
            '  color:#94a3b8; letter-spacing:0.02em;',
            '}',
            '#qe-quote-label strong { color:#e2e8f0; }',
            '#qe-status-badge {',
            '  font-size:0.72rem; font-weight:700; text-transform:uppercase;',
            '  padding:0.15rem 0.55rem; border-radius:999px; letter-spacing:0.04em;',
            '  margin-left:8px;',
            '}',
            '#qe-status-text {',
            '  font-size:0.8rem; color:#64748b;',
            '  min-width:90px; text-align:right;',
            '}',
            '#qe-status-text.saving { color:#f59e0b; }',
            '#qe-status-text.saved  { color:#10b981; }',
            '.qe-banner-btn {',
            '  padding:7px 14px; border:none; border-radius:6px;',
            '  font-size:0.82rem; font-weight:700; cursor:pointer;',
            '  transition:opacity .15s;',
            '}',
            '.qe-banner-btn:hover:not(:disabled) { opacity:.85; }',
            '.qe-banner-btn:disabled { opacity:.4; cursor:not-allowed; }',
            '#edit-quote-btn  { color:#fff; }',
            '#new-quote-btn   { background:transparent; border:1px solid #4b5563; color:#94a3b8; }',
            '#new-quote-btn:hover:not(:disabled) { background:rgba(255,255,255,0.07); }',
            '#revision-btn    { background:#dc2626; color:#fff; display:none; }',
            '[data-qe-locked] {',
            '  opacity:0.55 !important;',
            '  pointer-events:none !important;',
            '  user-select:none !important;',
            '}',
            // Revision modal
            '#qe-revision-modal {',
            '  display:none; position:fixed; inset:0; z-index:9999;',
            '  background:rgba(0,0,0,0.65); align-items:center; justify-content:center;',
            '}',
            '#qe-revision-modal.active { display:flex; }',
            '#qe-revision-card {',
            '  background:#1e2540; border:1px solid #2d3250; border-radius:12px;',
            '  padding:28px 32px; max-width:480px; width:90%;',
            '  box-shadow:0 8px 40px rgba(0,0,0,0.5);',
            '}',
            '#qe-revision-card h3 {',
            '  margin:0 0 6px; font-size:1.1rem; color:#f1f5f9;',
            '}',
            '#qe-revision-card p {',
            '  margin:0 0 16px; font-size:0.85rem; color:#94a3b8;',
            '}',
            '#qe-revision-reason {',
            '  width:100%; box-sizing:border-box;',
            '  min-height:100px; resize:vertical;',
            '  background:#111827; border:1px solid #374151; border-radius:6px;',
            '  color:#e2e8f0; font-size:0.9rem; padding:10px 12px;',
            '  font-family:inherit;',
            '}',
            '#qe-revision-reason:focus { outline:none; border-color:#6366f1; }',
            '#qe-revision-notify-row {',
            '  display:flex; align-items:center; gap:8px;',
            '  margin:14px 0 20px; font-size:0.85rem; color:#94a3b8;',
            '}',
            '#qe-revision-notify { width:16px; height:16px; cursor:pointer; }',
            '#qe-revision-error {',
            '  color:#f87171; font-size:0.82rem; margin-bottom:12px; display:none;',
            '}',
            '#qe-revision-actions { display:flex; gap:10px; justify-content:flex-end; }',
            '#qe-revision-cancel {',
            '  padding:8px 18px; background:transparent; border:1px solid #4b5563;',
            '  border-radius:6px; color:#94a3b8; font-size:0.85rem; cursor:pointer;',
            '}',
            '#qe-revision-submit {',
            '  padding:8px 20px; background:#dc2626; border:none;',
            '  border-radius:6px; color:#fff; font-size:0.85rem;',
            '  font-weight:700; cursor:pointer;',
            '}',
            '#qe-revision-submit:disabled { opacity:.5; cursor:not-allowed; }'
        ].join('\n');
        document.head.appendChild(s);
    }

    function injectBanner() {
        if (document.getElementById(BANNER_ID)) return;
        injectBannerStyles();

        var banner = document.createElement('div');
        banner.id        = BANNER_ID;
        banner.className = 'qe-hidden';
        banner.innerHTML =
            '<span id="qe-quote-label">Viewing quote <strong id="qe-quote-id-label"></strong>' +
            '<span id="qe-status-badge"></span></span>' +
            '<span id="qe-status-text"></span>' +
            '<button id="revision-btn"  class="qe-banner-btn" type="button">&#9888; Request Revision</button>' +
            '<button id="new-quote-btn" class="qe-banner-btn" type="button">+ New Quote</button>' +
            '<button id="edit-quote-btn" class="qe-banner-btn" type="button">&#9998; Edit Quote</button>';

        var target = document.getElementById('main-app') || document.getElementById('order-form');
        if (target) target.insertBefore(banner, target.firstChild);
        else document.body.insertBefore(banner, document.body.firstChild);

        // Edit / Done Editing
        document.getElementById('edit-quote-btn').addEventListener('click', function () {
            if (_editMode) {
                if (typeof window.syncQuoteFromDOM === 'function') window.syncQuoteFromDOM();
                _performSave();
                lockForm();
            } else {
                if (!canEdit()) return;
                unlockForm();
            }
        });

        // New Quote
        document.getElementById('new-quote-btn').addEventListener('click', function () {
            if (_editMode) {
                if (!confirm('Leave edit mode? Changes will be saved first.')) return;
                if (typeof window.syncQuoteFromDOM === 'function') window.syncQuoteFromDOM();
                _performSave();
                lockForm();
            }
            if (typeof window.resetFormOnly === 'function') window.resetFormOnly();
            hideBanner();
        });

        // Request Revision
        document.getElementById('revision-btn').addEventListener('click', function () {
            openRevisionModal();
        });

        // Inject revision modal
        injectRevisionModal();
    }

    function showBanner(quoteId) {
        var banner = document.getElementById(BANNER_ID);
        if (!banner) return;
        banner.classList.remove('qe-hidden');
        var label = document.getElementById('qe-quote-id-label');
        if (label) label.textContent = quoteId || 'Draft';
        updateStatusBadge();
        updateBannerButtons();
    }

    function hideBanner() {
        var banner = document.getElementById(BANNER_ID);
        if (banner) banner.classList.add('qe-hidden');
        _quoteLoaded = false;
        _editMode    = false;
    }

    function setStatusText(msg, cls) {
        var el = document.getElementById('qe-status-text');
        if (!el) return;
        el.textContent = msg;
        el.className   = cls || '';
    }

    var STATUS_BADGE_STYLES = {
        draft:     'background:#374151;color:#d1d5db;',
        submitted: 'background:#1e40af;color:#bfdbfe;',
        reviewed:  'background:#78350f;color:#fde68a;',
        approved:  'background:#14532d;color:#bbf7d0;',
        revision:  'background:#7f1d1d;color:#fecaca;'
    };

    function updateStatusBadge() {
        var badge = document.getElementById('qe-status-badge');
        if (!badge) return;
        var q = window.currentQuote;
        var status = (q && q.status) || 'draft';
        badge.textContent = status.toUpperCase();
        badge.style.cssText = STATUS_BADGE_STYLES[status] || STATUS_BADGE_STYLES.draft;
    }


    // ----------------------------------------------------------
    // REVISION MODAL
    // ----------------------------------------------------------
    function injectRevisionModal() {
        if (document.getElementById('qe-revision-modal')) return;
        var modal = document.createElement('div');
        modal.id = 'qe-revision-modal';
        modal.innerHTML =
            '<div id="qe-revision-card">' +
            '  <h3>Request Quote Revision</h3>' +
            '  <p>Describe the changes needed. This will set the quote status to <strong style="color:#fca5a5">Revision</strong> and the dealer will be able to edit it again.</p>' +
            '  <textarea id="qe-revision-reason" placeholder="Explain what needs to be revised..."></textarea>' +
            '  <div id="qe-revision-notify-row">' +
            '    <input type="checkbox" id="qe-revision-notify" checked>' +
            '    <label for="qe-revision-notify">Send revision request email to AmeriDex</label>' +
            '  </div>' +
            '  <div id="qe-revision-error"></div>' +
            '  <div id="qe-revision-actions">' +
            '    <button id="qe-revision-cancel" type="button">Cancel</button>' +
            '    <button id="qe-revision-submit" type="button">Submit Revision Request</button>' +
            '  </div>' +
            '</div>';
        document.body.appendChild(modal);

        document.getElementById('qe-revision-cancel').addEventListener('click', closeRevisionModal);
        modal.addEventListener('click', function (e) {
            if (e.target === modal) closeRevisionModal();
        });
        document.getElementById('qe-revision-submit').addEventListener('click', submitRevisionRequest);
    }

    function openRevisionModal() {
        var modal = document.getElementById('qe-revision-modal');
        if (!modal) return;
        document.getElementById('qe-revision-reason').value = '';
        document.getElementById('qe-revision-notify').checked = true;
        document.getElementById('qe-revision-error').style.display = 'none';
        document.getElementById('qe-revision-submit').disabled = false;
        modal.classList.add('active');
        document.getElementById('qe-revision-reason').focus();
    }

    function closeRevisionModal() {
        var modal = document.getElementById('qe-revision-modal');
        if (modal) modal.classList.remove('active');
    }

    function submitRevisionRequest() {
        var reason  = document.getElementById('qe-revision-reason').value.trim();
        var notify  = document.getElementById('qe-revision-notify').checked;
        var errEl   = document.getElementById('qe-revision-error');
        var submitBtn = document.getElementById('qe-revision-submit');

        errEl.style.display = 'none';

        if (!reason) {
            errEl.textContent = 'Please describe what needs to be revised.';
            errEl.style.display = 'block';
            return;
        }

        var q = window.currentQuote;
        if (!q || !q._serverId) {
            errEl.textContent = 'Quote is not synced to server. Please save first.';
            errEl.style.display = 'block';
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending...';

        window.ameridexAPI('PATCH', '/api/quotes/' + q._serverId + '/revision', {
            reason: reason,
            notify: notify
        })
        .then(function () {
            // Update local state immediately
            q.status = 'revision';
            var savedEntry = window.savedQuotes.find(function (sq) {
                return String(sq._serverId) === String(q._serverId);
            });
            if (savedEntry) savedEntry.status = 'revision';

            closeRevisionModal();
            updateStatusBadge();
            updateBannerButtons();
            setStatusText('Revision requested', 'saved');
            setTimeout(function () { setStatusText(''); }, 3000);
            console.log('[QuoteEditor v1.2] Revision requested for', q.quoteId);
        })
        .catch(function (err) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit Revision Request';
            errEl.textContent = err.message || 'Failed to send revision request.';
            errEl.style.display = 'block';
        });
    }


    // ----------------------------------------------------------
    // AUTOSAVE
    // ----------------------------------------------------------
    var _saveTimer      = null;
    var _saveDebounceMs = 1500;

    function doSave(immediate) {
        clearTimeout(_saveTimer);
        if (immediate) {
            _performSave();
        } else {
            setStatusText('Unsaved...', 'saving');
            _saveTimer = setTimeout(_performSave, _saveDebounceMs);
        }
    }

    function _performSave() {
        if (typeof window.saveCurrentQuote !== 'function') return;
        try {
            setStatusText('Saving...', 'saving');
            window.saveCurrentQuote();
            setStatusText('Saved \u2713', 'saved');
            setTimeout(function () {
                if (_editMode) setStatusText('Edit mode active');
            }, 2500);
            console.log('[QuoteEditor v1.2] Saved:', window.currentQuote && window.currentQuote.quoteId);
        } catch (e) {
            setStatusText('Save failed', '');
            console.error('[QuoteEditor v1.2] Save error:', e);
        }
    }

    function attachAutosaveListeners() {
        var form = document.getElementById('order-form');
        if (!form) { setTimeout(attachAutosaveListeners, 400); return; }
        form.addEventListener('input',  function () { if (_editMode) doSave(false); });
        form.addEventListener('change', function () { if (_editMode) doSave(false); });
        console.log('[QuoteEditor v1.2] Autosave listeners attached.');
    }


    // ----------------------------------------------------------
    // PATCH window.loadQuote
    // v1.2: setTimeout 120 -> 0 (address already written by
    //       api.js restoreQuoteToDOM before our wrapper fires)
    // ----------------------------------------------------------
    function patchLoadQuote() {
        var _origLoad = window.loadQuote;
        if (typeof _origLoad !== 'function') {
            setTimeout(patchLoadQuote, 200);
            return;
        }

        window.loadQuote = function (idx) {
            _origLoad.apply(this, arguments);

            // 0ms: yield to synchronous restoreQuoteToDOM in api.js,
            // then immediately lock and show banner (no visible lag).
            setTimeout(function () {
                var q  = window.currentQuote;
                var id = (q && (q.quoteId || q.quoteNumber || q._serverId)) || 'Draft';

                // Safety net: fill address if api.js missed it
                populateAddressFields(q && q.customer);

                _quoteLoaded = true;
                _editMode    = false;
                lockForm();
                showBanner(id);
                console.log('[QuoteEditor v1.2] Quote locked read-only:', id, '| status:', q && q.status);
            }, 0);
        };

        console.log('[QuoteEditor v1.2] loadQuote patched.');
    }


    // ----------------------------------------------------------
    // BOOTSTRAP: catch URL-param / session-resume pre-loads
    // v1.2: login delay 400ms -> 0; fallback 1800ms -> 300ms
    // ----------------------------------------------------------
    function bootstrapCheck() {
        var q  = window.currentQuote;
        var id = q && (q.quoteId || q.quoteNumber || q._serverId);
        if (!id) return;

        var banner = document.getElementById(BANNER_ID);
        if (!banner || banner.classList.contains('qe-hidden')) {
            populateAddressFields(q.customer);
            _quoteLoaded = true;
            _editMode    = false;
            lockForm();
            showBanner(id);
            console.log('[QuoteEditor v1.2] Bootstrap: locked pre-loaded quote', id);
        }
    }


    // ----------------------------------------------------------
    // INIT
    // ----------------------------------------------------------
    function init() {
        injectBanner();
        patchSyncQuoteFromDOM();
        patchLoadQuote();
        attachAutosaveListeners();

        // v1.2: 0ms delay — address already populated by api.js
        window.addEventListener('ameridex-login', function () {
            bootstrapCheck();
        });

        // Fallback for late-settling state
        setTimeout(bootstrapCheck, 300);

        console.log('[QuoteEditor v1.2] Initialized.');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
