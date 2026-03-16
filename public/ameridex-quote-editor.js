// ============================================================
// AmeriDex Dealer Portal - Quote Editor v1.6
// Date: 2026-03-15
// ============================================================
// v1.6 CHANGES (2026-03-15):
//   FIX: patchLoadQuote() now sets window._quoteEditorReady = true
//   immediately before dispatching 'ameridex-quoteeditor-ready'.
//   portal-nav v1.4's 800ms fallback guard reads this flag to
//   decide whether it is safe to call loadQuote. Without it the
//   flag was always undefined, so the guard always skipped the
//   fallback regardless of whether the editor was actually ready.
//
// v1.5 CHANGES (2026-03-15):
//   FIX: Race condition between portal-nav.js and quote-editor.js.
//     portal-nav was calling window.loadQuote at the 200ms mark,
//     BEFORE patchLoadQuote() had replaced it with the locking
//     wrapper. This caused the form to render fully unlocked and
//     then visually "crash" when bootstrapCheck() ran 300ms later.
//
//   FIX: patchLoadQuote() now dispatches a custom window event
//     'ameridex-quoteeditor-ready' immediately after it installs
//     the patched loadQuote. portal-nav.js listens for this event
//     instead of relying on a blind setTimeout, guaranteeing the
//     patch is in place before loadQuote fires.
//
// v1.4 CHANGES retained:
//   FEAT: Listen for ameridex-quote-restored event (api.js bypass path).
//
// v1.3 CHANGES retained:
//   FEAT: Approve & Re-Submit button (GM / admin only).
//
// v1.2 CHANGES retained:
//   PERF: Address population instant on load.
//   FEAT: Status-aware Edit button.
//   FEAT: Request Revision modal (GM / admin only).
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
    // ----------------------------------------------------------
    function populateAddressFields(customer) {
        var c = customer || {};
        var addrEl  = document.getElementById('cust-address');
        var cityEl  = document.getElementById('cust-city');
        var stateEl = document.getElementById('cust-state');
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
        console.log('[QuoteEditor v1.6] syncQuoteFromDOM patched.');
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
        '#order-form button:not(#edit-quote-btn):not(#new-quote-btn):not(#revision-btn):not(#approve-revision-btn)'
    ].join(', ');

    var ALWAYS_ENABLED_IDS = [
        'download-pdf-btn', 'print-btn',
        'edit-quote-btn', 'new-quote-btn',
        'revision-btn', 'approve-revision-btn'
    ];

    function lockForm() {
        _editMode = false;
        window._lockFormInProgress = true;
        var count = 0;
        document.querySelectorAll(FORM_SELECTOR).forEach(function (el) {
            if (ALWAYS_ENABLED_IDS.indexOf(el.id) === -1) {
                el.disabled = true;
                el.setAttribute('data-qe-locked', '1');
                count++;
            }
        });
        window._lockFormInProgress = false;
        // Single sync call instead of hundreds of observer callbacks
        if (typeof window.syncPickerLockState === 'function') {
            window.syncPickerLockState();
        }
        console.log('[QuoteEditor v1.6] lockForm() locked', count, 'elements.');
        setStatusText('');
        updateBannerButtons();
    }

    function unlockForm() {
        _editMode = true;
        window._lockFormInProgress = true;
        document.querySelectorAll('[data-qe-locked]').forEach(function (el) {
            el.disabled = false;
            el.removeAttribute('data-qe-locked');
        });
        window._lockFormInProgress = false;
        // Single sync call instead of hundreds of observer callbacks
        if (typeof window.syncPickerLockState === 'function') {
            window.syncPickerLockState();
        }
        updateBannerButtons();
        setStatusText('Edit mode active');
    }

    function canEdit() {
        var q = window.currentQuote;
        var status = (q && q.status) || 'draft';
        if (status === 'draft' || status === 'revision') return true;
        return isElevated();
    }

    function updateBannerButtons() {
        var editBtn    = document.getElementById('edit-quote-btn');
        var revBtn     = document.getElementById('revision-btn');
        var approveBtn = document.getElementById('approve-revision-btn');
        if (!editBtn) return;

        var q      = window.currentQuote;
        var status = (q && q.status) || 'draft';

        if (_editMode) {
            editBtn.textContent      = 'Done Editing';
            editBtn.style.background = '#10b981';
            editBtn.disabled         = false;
            editBtn.title            = '';
        } else {
            editBtn.textContent      = '\u270E Edit Quote';
            editBtn.style.background = '#2563eb';
            if (!canEdit()) {
                editBtn.disabled         = true;
                editBtn.style.background = '#374151';
                editBtn.title            = 'Only GM or Admin can edit ' + status + ' quotes';
            } else {
                editBtn.disabled = false;
                editBtn.title    = '';
            }
        }

        if (revBtn) {
            var showRevBtn = isElevated() &&
                (status === 'submitted' || status === 'approved' || status === 'reviewed');
            revBtn.style.display = showRevBtn ? 'inline-block' : 'none';
        }

        if (approveBtn) {
            var showApproveBtn = isElevated() && status === 'revision';
            approveBtn.style.display = showApproveBtn ? 'inline-block' : 'none';
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
            '#edit-quote-btn         { color:#fff; }',
            '#new-quote-btn          { background:transparent; border:1px solid #4b5563; color:#94a3b8; }',
            '#new-quote-btn:hover:not(:disabled) { background:rgba(255,255,255,0.07); }',
            '#revision-btn           { background:#dc2626; color:#fff; display:none; }',
            '#approve-revision-btn   { background:#059669; color:#fff; display:none; }',
            '[data-qe-locked] {',
            '  opacity:0.55 !important;',
            '  pointer-events:none !important;',
            '  user-select:none !important;',
            '}',
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
            '#qe-revision-card h3 { margin:0 0 6px; font-size:1.1rem; color:#f1f5f9; }',
            '#qe-revision-card p  { margin:0 0 16px; font-size:0.85rem; color:#94a3b8; }',
            '#qe-revision-reason {',
            '  width:100%; box-sizing:border-box; min-height:100px; resize:vertical;',
            '  background:#111827; border:1px solid #374151; border-radius:6px;',
            '  color:#e2e8f0; font-size:0.9rem; padding:10px 12px; font-family:inherit;',
            '}',
            '#qe-revision-reason:focus { outline:none; border-color:#6366f1; }',
            '#qe-revision-notify-row {',
            '  display:flex; align-items:center; gap:8px;',
            '  margin:14px 0 20px; font-size:0.85rem; color:#94a3b8;',
            '}',
            '#qe-revision-notify { width:16px; height:16px; cursor:pointer; }',
            '#qe-revision-error { color:#f87171; font-size:0.82rem; margin-bottom:12px; display:none; }',
            '#qe-revision-actions { display:flex; gap:10px; justify-content:flex-end; }',
            '#qe-revision-cancel {',
            '  padding:8px 18px; background:transparent; border:1px solid #4b5563;',
            '  border-radius:6px; color:#94a3b8; font-size:0.85rem; cursor:pointer;',
            '}',
            '#qe-revision-submit {',
            '  padding:8px 20px; background:#dc2626; border:none;',
            '  border-radius:6px; color:#fff; font-size:0.85rem; font-weight:700; cursor:pointer;',
            '}',
            '#qe-revision-submit:disabled { opacity:.5; cursor:not-allowed; }',
            '#qe-approve-revision-modal {',
            '  display:none; position:fixed; inset:0; z-index:9999;',
            '  background:rgba(0,0,0,0.65); align-items:center; justify-content:center;',
            '}',
            '#qe-approve-revision-modal.active { display:flex; }',
            '#qe-approve-revision-card {',
            '  background:#1e2540; border:1px solid #2d3250; border-radius:12px;',
            '  padding:28px 32px; max-width:460px; width:90%;',
            '  box-shadow:0 8px 40px rgba(0,0,0,0.5);',
            '}',
            '#qe-approve-revision-card h3 { margin:0 0 6px; font-size:1.1rem; color:#f1f5f9; }',
            '#qe-approve-revision-card p  { margin:0 0 20px; font-size:0.85rem; color:#94a3b8; line-height:1.55; }',
            '#qe-approve-revision-error { color:#f87171; font-size:0.82rem; margin-bottom:12px; display:none; }',
            '#qe-approve-revision-actions { display:flex; gap:10px; justify-content:flex-end; }',
            '#qe-approve-revision-cancel {',
            '  padding:8px 18px; background:transparent; border:1px solid #4b5563;',
            '  border-radius:6px; color:#94a3b8; font-size:0.85rem; cursor:pointer;',
            '}',
            '#qe-approve-revision-confirm {',
            '  padding:8px 20px; background:#059669; border:none;',
            '  border-radius:6px; color:#fff; font-size:0.85rem; font-weight:700; cursor:pointer;',
            '}',
            '#qe-approve-revision-confirm:disabled { opacity:.5; cursor:not-allowed; }'
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
            '<button id="approve-revision-btn" class="qe-banner-btn" type="button">&#10003; Approve &amp; Re-Submit</button>' +
            '<button id="revision-btn"         class="qe-banner-btn" type="button">&#9888; Request Revision</button>' +
            '<button id="new-quote-btn"         class="qe-banner-btn" type="button">+ New Quote</button>' +
            '<button id="edit-quote-btn"        class="qe-banner-btn" type="button">&#9998; Edit Quote</button>';

        var target = document.getElementById('main-app') || document.getElementById('order-form');
        if (target) target.insertBefore(banner, target.firstChild);
        else document.body.insertBefore(banner, document.body.firstChild);

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

        document.getElementById('revision-btn').addEventListener('click', function () {
            openRevisionModal();
        });

        document.getElementById('approve-revision-btn').addEventListener('click', function () {
            openApproveRevisionModal();
        });

        injectRevisionModal();
        injectApproveRevisionModal();
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
        badge.textContent   = status.toUpperCase();
        badge.style.cssText = STATUS_BADGE_STYLES[status] || STATUS_BADGE_STYLES.draft;
    }


    // ----------------------------------------------------------
    // REQUEST REVISION MODAL
    // ----------------------------------------------------------
    function injectRevisionModal() {
        if (document.getElementById('qe-revision-modal')) return;
        var modal = document.createElement('div');
        modal.id = 'qe-revision-modal';
        modal.innerHTML =
            '<div id="qe-revision-card">' +
            '  <h3>Request Quote Revision</h3>' +
            '  <p>Describe the changes needed. This will set the quote status to <strong style="color:#fca5a5">Revision</strong> and the dealer staff will be able to edit it again.</p>' +
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
        modal.addEventListener('click', function (e) { if (e.target === modal) closeRevisionModal(); });
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
        var reason    = document.getElementById('qe-revision-reason').value.trim();
        var notify    = document.getElementById('qe-revision-notify').checked;
        var errEl     = document.getElementById('qe-revision-error');
        var submitBtn = document.getElementById('qe-revision-submit');

        errEl.style.display = 'none';
        if (!reason) {
            errEl.textContent   = 'Please describe what needs to be revised.';
            errEl.style.display = 'block';
            return;
        }

        var q = window.currentQuote;
        if (!q || !q._serverId) {
            errEl.textContent   = 'Quote is not synced to server. Please save first.';
            errEl.style.display = 'block';
            return;
        }

        submitBtn.disabled     = true;
        submitBtn.textContent  = 'Sending...';

        window.ameridexAPI('PATCH', '/api/quotes/' + q._serverId + '/revision', {
            reason: reason,
            notify: notify
        })
        .then(function () {
            q.status = 'revision';
            var savedEntry = window.savedQuotes && window.savedQuotes.find(function (sq) {
                return String(sq._serverId) === String(q._serverId);
            });
            if (savedEntry) savedEntry.status = 'revision';
            closeRevisionModal();
            updateStatusBadge();
            updateBannerButtons();
            setStatusText('Revision requested', 'saved');
            setTimeout(function () { setStatusText(''); }, 3000);
            console.log('[QuoteEditor v1.6] Revision requested for', q.quoteId);
        })
        .catch(function (err) {
            submitBtn.disabled    = false;
            submitBtn.textContent = 'Submit Revision Request';
            errEl.textContent     = err.message || 'Failed to send revision request.';
            errEl.style.display   = 'block';
        });
    }


    // ----------------------------------------------------------
    // APPROVE REVISION MODAL
    // ----------------------------------------------------------
    function injectApproveRevisionModal() {
        if (document.getElementById('qe-approve-revision-modal')) return;
        var modal = document.createElement('div');
        modal.id = 'qe-approve-revision-modal';
        modal.innerHTML =
            '<div id="qe-approve-revision-card">' +
            '  <h3>&#10003; Approve &amp; Re-Submit Quote</h3>' +
            '  <p>You are about to approve the dealer staff revision and re-submit this quote to AmeriDex.' +
            '  The status will change to <strong style="color:#6ee7b7">Submitted</strong> and AmeriDex' +
            '  will be notified immediately with your name as the approver.</p>' +
            '  <p>Make sure all line items and pricing look correct before proceeding.</p>' +
            '  <div id="qe-approve-revision-error"></div>' +
            '  <div id="qe-approve-revision-actions">' +
            '    <button id="qe-approve-revision-cancel"  type="button">Cancel</button>' +
            '    <button id="qe-approve-revision-confirm" type="button">&#10003; Confirm &amp; Re-Submit</button>' +
            '  </div>' +
            '</div>';
        document.body.appendChild(modal);
        document.getElementById('qe-approve-revision-cancel').addEventListener('click', closeApproveRevisionModal);
        modal.addEventListener('click', function (e) { if (e.target === modal) closeApproveRevisionModal(); });
        document.getElementById('qe-approve-revision-confirm').addEventListener('click', submitApproveRevision);
    }

    function openApproveRevisionModal() {
        var modal = document.getElementById('qe-approve-revision-modal');
        if (!modal) return;
        document.getElementById('qe-approve-revision-error').style.display = 'none';
        document.getElementById('qe-approve-revision-confirm').disabled     = false;
        document.getElementById('qe-approve-revision-confirm').textContent  = '\u2713 Confirm & Re-Submit';
        modal.classList.add('active');
    }

    function closeApproveRevisionModal() {
        var modal = document.getElementById('qe-approve-revision-modal');
        if (modal) modal.classList.remove('active');
    }

    function submitApproveRevision() {
        var errEl      = document.getElementById('qe-approve-revision-error');
        var confirmBtn = document.getElementById('qe-approve-revision-confirm');

        errEl.style.display = 'none';

        var q = window.currentQuote;
        if (!q || !q._serverId) {
            errEl.textContent   = 'Quote is not synced to server. Please save first.';
            errEl.style.display = 'block';
            return;
        }
        if (q.status !== 'revision') {
            errEl.textContent   = 'This quote is no longer in revision status.';
            errEl.style.display = 'block';
            return;
        }

        confirmBtn.disabled    = true;
        confirmBtn.textContent = 'Submitting...';

        window.ameridexAPI('POST', '/api/quotes/' + q._serverId + '/approve-revision', {})
        .then(function (updatedQuote) {
            var newStatus = (updatedQuote && updatedQuote.status) || 'submitted';
            q.status = newStatus;

            var savedEntry = window.savedQuotes && window.savedQuotes.find(function (sq) {
                return String(sq._serverId) === String(q._serverId);
            });
            if (savedEntry) savedEntry.status = newStatus;

            closeApproveRevisionModal();
            updateStatusBadge();
            updateBannerButtons();
            setStatusText('Re-submitted to AmeriDex', 'saved');
            setTimeout(function () { setStatusText(''); }, 4000);
            console.log('[QuoteEditor v1.6] Revision approved and re-submitted:', q.quoteId || q._serverId);
        })
        .catch(function (err) {
            confirmBtn.disabled    = false;
            confirmBtn.textContent = '\u2713 Confirm & Re-Submit';
            errEl.textContent      = err.message || 'Failed to approve revision. Please try again.';
            errEl.style.display    = 'block';
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
            console.log('[QuoteEditor v1.6] Saved:', window.currentQuote && window.currentQuote.quoteId);
        } catch (e) {
            setStatusText('Save failed', '');
            console.error('[QuoteEditor v1.6] Save error:', e);
        }
    }

    function attachAutosaveListeners() {
        var form = document.getElementById('order-form');
        if (!form) { setTimeout(attachAutosaveListeners, 400); return; }
        form.addEventListener('input',  function () { if (_editMode) doSave(false); });
        form.addEventListener('change', function () { if (_editMode) doSave(false); });
        console.log('[QuoteEditor v1.6] Autosave listeners attached.');
    }


    // ----------------------------------------------------------
    // PATCH window.loadQuote
    //
    // v1.6 FIX: Set window._quoteEditorReady = true BEFORE
    // dispatching 'ameridex-quoteeditor-ready'. portal-nav v1.4
    // reads this flag in its 800ms fallback guard. Without this
    // the flag was always undefined, rendering the guard useless.
    // ----------------------------------------------------------
    function patchLoadQuote() {
        var _origLoad = window.loadQuote;
        if (typeof _origLoad !== 'function') {
            setTimeout(patchLoadQuote, 200);
            return;
        }

        window.loadQuote = function (idx) {
            _origLoad.apply(this, arguments);
            setTimeout(function () {
                var q  = window.currentQuote;
                var id = (q && (q.quoteId || q.quoteNumber || q._serverId)) || 'Draft';
                populateAddressFields(q && q.customer);
                _quoteLoaded = true;
                _editMode    = false;
                lockForm();
                showBanner(id);
                console.log('[QuoteEditor v1.6] Quote locked read-only:', id, '| status:', q && q.status);
            }, 0);
        };

        console.log('[QuoteEditor v1.6] loadQuote patched.');

        // v1.6: Set the global flag BEFORE dispatching the event so
        // portal-nav's 800ms guard can read it reliably.
        window._quoteEditorReady = true;

        window.dispatchEvent(new CustomEvent('ameridex-quoteeditor-ready'));
        console.log('[QuoteEditor v1.6] Dispatched ameridex-quoteeditor-ready.');
    }


    // ----------------------------------------------------------
    // BOOTSTRAP
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
            console.log('[QuoteEditor v1.6] Bootstrap: locked pre-loaded quote', id);
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

        window.addEventListener('ameridex-login', function () {
            bootstrapCheck();
        });

        // Listen for direct restoreQuoteToDOM calls (api.js bypass path)
        window.addEventListener('ameridex-quote-restored', function (e) {
            var qid = (e.detail && e.detail.quoteId) || '';
            console.log('[QuoteEditor v1.6] ameridex-quote-restored received, locking form for:', qid);
            var q  = window.currentQuote;
            var id = qid || (q && (q.quoteId || q.quoteNumber || q._serverId)) || 'Draft';
            populateAddressFields(q && q.customer);
            _quoteLoaded = true;
            _editMode    = false;
            lockForm();
            showBanner(id);
        });

        setTimeout(bootstrapCheck, 300);

        console.log('[QuoteEditor v1.6] Initialized.');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
