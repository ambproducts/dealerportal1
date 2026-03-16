/**
 * ameridex-portal-nav.js
 *
 * Runtime patch for dealer-portal.html
 *
 * v1.4 Changes (2026-03-15):
 *   - CRITICAL FIX: 800ms fallback was calling the RAW (unpatched) window.loadQuote
 *     because ameridex-quote-editor.js had not yet loaded and installed its locking
 *     wrapper. This caused the form to render fully unlocked at ~800ms, then
 *     quote-editor would load, run bootstrapCheck(), find a pre-loaded quote, try
 *     to lock an already-rendered form, and freeze the portal.
 *   - FIX: 800ms fallback now checks window._quoteEditorReady before calling
 *     tryLoadQuoteFromParam(). If the editor is not ready yet, the fallback ABORTS
 *     and defers entirely to the 'ameridex-quoteeditor-ready' event path.
 *   - FIX: 'ameridex-quoteeditor-ready' listener now calls tryLoadQuoteFromParam()
 *     with the guarantee that loadQuote is patched. If savedQuotes is not yet
 *     populated at that moment (extremely rare edge case), the ameridex-login
 *     retry path (Attempt 2) handles it.
 *   - REMOVED: The blind 800ms fallback that could race with the editor load.
 *     Replaced with a guarded version that only fires if window._quoteEditorReady
 *     is already true (meaning quote-editor loaded unusually fast AND the
 *     ameridex-quoteeditor-ready event was somehow missed).
 *   - KEPT: ameridex-login retry (Attempt 2) and 6-second URL cleanup safety net.
 *
 * v1.3 Changes (2026-03-15):
 *   - FIX: Race condition where portal-nav called window.loadQuote BEFORE
 *     ameridex-quote-editor.js had patched it with the locking wrapper.
 *   - FIX: Replaced blind 200ms setTimeout with 'ameridex-quoteeditor-ready' event.
 *   - FIX: 800ms fallback setTimeout kept as safety net.
 *
 * v1.2 Changes (2026-02-28):
 *   - FIX: quoteId handler now searches savedQuotes by quoteId AND _serverId.
 *   - FIX: cleanUrlParams() moved inside success path only.
 *   - ADD: ameridex-login retry.
 *   - ADD: 6-second safety timeout cleans URL if all retries fail.
 *
 * v1.1 Changes (2026-02-27):
 *   - Initial retry and login-event logic.
 */

(function portalNavPatch() {
  'use strict';

  // --------------------------------------------------
  // 1. Inject "My Quotes" nav link into header-actions
  // --------------------------------------------------
  function injectNavLink() {
    var actions = document.querySelector('.header-actions');
    if (!actions) return;
    if (actions.querySelector('[data-nav-quotes]')) return;

    var link = document.createElement('a');
    link.href = 'quotes-customers.html';
    link.className = 'header-btn';
    link.setAttribute('data-nav-quotes', 'true');
    link.textContent = 'My Quotes';
    link.style.textDecoration = 'none';

    var settingsBtn = document.getElementById('settings-btn');
    if (settingsBtn) {
      actions.insertBefore(link, settingsBtn);
    } else {
      actions.insertBefore(link, actions.lastElementChild);
    }
  }

  // --------------------------------------------------
  // 2. Trim saved quotes list to MAX_VISIBLE items
  // --------------------------------------------------
  var MAX_VISIBLE = 5;

  function trimSavedQuotesList() {
    var list = document.getElementById('saved-quotes-list');
    if (!list) return;

    var items = list.querySelectorAll('.saved-quote-item');
    if (items.length <= MAX_VISIBLE) {
      var existingLink = list.parentElement.querySelector('[data-view-all-quotes]');
      if (existingLink) existingLink.remove();
      return;
    }

    for (var i = 0; i < items.length; i++) {
      items[i].style.display = (i >= MAX_VISIBLE) ? 'none' : '';
    }

    var parent = list.parentElement;
    var viewAllLink = parent.querySelector('[data-view-all-quotes]');
    if (!viewAllLink) {
      viewAllLink = document.createElement('a');
      viewAllLink.setAttribute('data-view-all-quotes', 'true');
      viewAllLink.href = 'quotes-customers.html';
      viewAllLink.style.cssText = [
        'display: block',
        'text-align: center',
        'padding: 0.75rem 1rem',
        'margin-top: 0.5rem',
        'color: #2563eb',
        'font-weight: 600',
        'font-size: 0.9rem',
        'text-decoration: none',
        'border: 1px solid #2563eb',
        'border-radius: 8px',
        'transition: background 0.15s'
      ].join(';');
      viewAllLink.textContent = 'View All Quotes (' + items.length + ')';
      viewAllLink.addEventListener('mouseenter', function () { viewAllLink.style.backgroundColor = '#eff6ff'; });
      viewAllLink.addEventListener('mouseleave', function () { viewAllLink.style.backgroundColor = ''; });

      if (list.nextSibling) {
        parent.insertBefore(viewAllLink, list.nextSibling);
      } else {
        parent.appendChild(viewAllLink);
      }
    } else {
      viewAllLink.textContent = 'View All Quotes (' + items.length + ')';
    }
  }

  // --------------------------------------------------
  // 3. Observe #saved-quotes-list for mutations
  // --------------------------------------------------
  function observeSavedQuotesList() {
    var list = document.getElementById('saved-quotes-list');
    if (!list) return;

    var observer = new MutationObserver(function () {
      trimSavedQuotesList();
    });
    observer.observe(list, { childList: true, subtree: true });
    trimSavedQuotesList();
  }

  // --------------------------------------------------
  // 4. Handle URL parameters from quotes-customers.html
  // --------------------------------------------------
  function handleUrlParams() {
    var params = new URLSearchParams(window.location.search);

    if (params.get('tab') === 'customers') {
      var showCustomers = window.showCustomersView;
      if (typeof showCustomers === 'function') setTimeout(showCustomers, 100);
    }

    if (params.get('newQuote') === '1') {
      var resetFn = window.resetFormOnly;
      if (typeof resetFn === 'function') {
        setTimeout(function () {
          resetFn();
          prefillCustomerFromParams(params);
        }, 150);
      }
      cleanUrlParams();
      return;
    }

    var quoteId = params.get('quoteId');
    if (quoteId) {
      var _quoteLoadDone = false;

      // Finds and loads the quote by quoteId/serverId/serverQuoteNumber.
      // Returns true if the quote was found and loadQuote was called.
      function tryLoadQuoteFromParam() {
        if (_quoteLoadDone) return true;
        if (typeof window.savedQuotes === 'undefined' || !window.savedQuotes || !window.savedQuotes.length) {
          return false;
        }

        var idx = window.savedQuotes.findIndex(function (q) { return q.quoteId === quoteId; });
        if (idx < 0) idx = window.savedQuotes.findIndex(function (q) { return q._serverId === quoteId; });
        if (idx < 0) idx = window.savedQuotes.findIndex(function (q) { return q._serverQuoteNumber === quoteId; });

        if (idx >= 0 && typeof window.loadQuote === 'function') {
          _quoteLoadDone = true;
          window._quoteFromUrlHandled = true;
          console.log('[portal-nav v1.4] Loading quote at savedQuotes[' + idx + '] for param: ' + quoteId);
          try {
            window.loadQuote(idx);
          } catch (err) {
            console.error('[portal-nav v1.4] loadQuote threw:', err);
            if (typeof window.resetFormOnly === 'function') window.resetFormOnly();
          }
          cleanUrlParams();
          var custSection = document.getElementById('customer');
          if (custSection) custSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
          return true;
        }

        return false;
      }

      // -------------------------------------------------------
      // PRIMARY PATH: Wait for quote-editor to signal its locking
      // wrapper is installed, THEN call loadQuote.
      // This is the only path that should normally fire.
      // -------------------------------------------------------
      window.addEventListener('ameridex-quoteeditor-ready', function _onEditorReady() {
        window.removeEventListener('ameridex-quoteeditor-ready', _onEditorReady);
        console.log('[portal-nav v1.4] Editor ready — attempting load for: ' + quoteId);
        if (!tryLoadQuoteFromParam()) {
          // savedQuotes not populated yet — the login retry below will handle it.
          console.log('[portal-nav v1.4] savedQuotes not ready at editor-ready time, deferring to login retry.');
        }
      });

      // -------------------------------------------------------
      // FALLBACK A: 800ms timeout — ONLY fires if quote-editor
      // already signalled ready (window._quoteEditorReady === true)
      // but the event was missed due to script ordering.
      // If quote-editor is NOT ready yet, this is a no-op and
      // the primary path will handle it when the event fires.
      // This prevents calling raw unpatched loadQuote.
      // -------------------------------------------------------
      setTimeout(function () {
        if (_quoteLoadDone) return;
        if (!window._quoteEditorReady) {
          // quote-editor hasn't loaded yet — primary path will handle it.
          console.log('[portal-nav v1.4] 800ms: editor not ready yet, skipping fallback. Primary path will handle it.');
          return;
        }
        // Editor IS ready but event was missed — safe to call patched loadQuote.
        console.log('[portal-nav v1.4] 800ms fallback (editor was ready, event missed) for: ' + quoteId);
        tryLoadQuoteFromParam();
      }, 800);

      // -------------------------------------------------------
      // FALLBACK B: retry on ameridex-login
      // Handles the edge case where savedQuotes was empty when
      // ameridex-quoteeditor-ready fired (e.g. slow server).
      // -------------------------------------------------------
      window.addEventListener('ameridex-login', function _onLoginNav() {
        window.removeEventListener('ameridex-login', _onLoginNav);
        setTimeout(function () {
          if (!tryLoadQuoteFromParam()) {
            console.warn('[portal-nav v1.4] Attempt 2 (post-login) failed for: ' + quoteId);
          }
        }, 100);
      });

      // -------------------------------------------------------
      // SAFETY NET: clean URL after 6s if nothing worked.
      // -------------------------------------------------------
      setTimeout(function () {
        if (!_quoteLoadDone) {
          console.warn('[portal-nav v1.4] All attempts failed for: ' + quoteId + '. Cleaning URL.');
          cleanUrlParams();
        }
      }, 6000);

      return;
    }

    if (params.get('custName') || params.get('custEmail')) {
      setTimeout(function () { prefillCustomerFromParams(params); }, 150);
      cleanUrlParams();
    }
  }

  function prefillCustomerFromParams(params) {
    var fields = {
      'custName': 'cust-name',
      'custEmail': 'cust-email',
      'custCompany': 'cust-company',
      'custPhone': 'cust-phone'
    };
    var filled = false;
    Object.keys(fields).forEach(function (paramKey) {
      var val = params.get(paramKey);
      if (val) {
        var el = document.getElementById(fields[paramKey]);
        if (el) { el.value = decodeURIComponent(val); filled = true; }
      }
    });
    if (filled && typeof window.updateCustomerProgress === 'function') window.updateCustomerProgress();
  }

  function cleanUrlParams() {
    if (window.history && window.history.replaceState) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }

  // --------------------------------------------------
  // Bootstrap
  // --------------------------------------------------
  function init() {
    injectNavLink();
    observeSavedQuotesList();
    handleUrlParams();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 50);
  }

})();
