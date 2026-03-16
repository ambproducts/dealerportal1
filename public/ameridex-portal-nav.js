/**
 * ameridex-portal-nav.js
 *
 * Runtime patch for dealer-portal.html
 *
 * v1.5 Changes (2026-03-15):
 *   - CRITICAL FIX: Fallback B (ameridex-login retry) was calling
 *     tryLoadQuoteFromParam() 100ms after ameridex-login fired, which
 *     is consistently BEFORE ameridex-quote-editor.js has loaded and
 *     installed its locking wrapper on window.loadQuote.
 *     This caused the raw unpatched loadQuote to render the form
 *     fully unlocked. quote-editor's bootstrapCheck() then found a
 *     pre-loaded quote and tried to lock an already-rendered form,
 *     freezing the portal.
 *   - FIX: Fallback B now checks window._quoteEditorReady before
 *     calling tryLoadQuoteFromParam(). If the editor is not ready,
 *     the login retry aborts entirely and defers to the primary
 *     'ameridex-quoteeditor-ready' event path.
 *   - RESULT: All three fallback paths (800ms, login retry, editor-ready)
 *     now share the same invariant: loadQuote is NEVER called unless
 *     window._quoteEditorReady === true.
 *
 * v1.4 Changes (2026-03-15):
 *   - FIX: 800ms fallback guarded with window._quoteEditorReady check.
 *   - FIX: Primary path via 'ameridex-quoteeditor-ready' event established.
 *
 * v1.3 Changes (2026-03-15):
 *   - FIX: Race condition — replaced blind 200ms setTimeout with event.
 *
 * v1.2 Changes (2026-02-28):
 *   - FIX: quoteId search by quoteId, _serverId, _serverQuoteNumber.
 *   - ADD: ameridex-login retry, 6-second safety timeout.
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

      // -------------------------------------------------------
      // Core loader — shared by all paths below.
      // INVARIANT: Must only be called when window._quoteEditorReady
      // is true, otherwise loadQuote is unpatched and will render
      // the form without the locking wrapper.
      // Returns true if quote was found and loadQuote was called,
      // or if _quoteLoadDone was already true (already handled).
      // Returns false if savedQuotes not populated yet.
      // -------------------------------------------------------
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
          console.log('[portal-nav v1.5] Loading quote at savedQuotes[' + idx + '] for param: ' + quoteId);
          try {
            window.loadQuote(idx);
          } catch (err) {
            console.error('[portal-nav v1.5] loadQuote threw:', err);
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
      // PRIMARY PATH: 'ameridex-quoteeditor-ready' event.
      // quote-editor fires this after installing the locking wrapper.
      // This is the correct, reliable path for all normal page loads.
      // -------------------------------------------------------
      window.addEventListener('ameridex-quoteeditor-ready', function _onEditorReady() {
        window.removeEventListener('ameridex-quoteeditor-ready', _onEditorReady);
        console.log('[portal-nav v1.5] Editor ready — attempting load for: ' + quoteId);
        if (!tryLoadQuoteFromParam()) {
          // savedQuotes empty at this moment — extremely rare.
          // Fallback B (login retry) will handle it once api.js fires ameridex-login.
          console.log('[portal-nav v1.5] savedQuotes not ready at editor-ready time, deferring to login retry.');
        }
      });

      // -------------------------------------------------------
      // FALLBACK A: 800ms timeout.
      // Only fires if window._quoteEditorReady is already true,
      // meaning the editor loaded before the event listener was
      // registered (theoretically impossible but guarded anyway).
      // -------------------------------------------------------
      setTimeout(function () {
        if (_quoteLoadDone) return;
        if (!window._quoteEditorReady) {
          console.log('[portal-nav v1.5] 800ms: editor not ready yet, skipping. Primary path will handle it.');
          return;
        }
        console.log('[portal-nav v1.5] 800ms fallback (editor ready, event missed) for: ' + quoteId);
        tryLoadQuoteFromParam();
      }, 800);

      // -------------------------------------------------------
      // FALLBACK B: ameridex-login retry.
      // Handles the edge case where the primary path fired but
      // savedQuotes was empty at that moment (slow server load).
      //
      // v1.5 FIX: Guard with window._quoteEditorReady.
      // ameridex-login fires BEFORE quote-editor loads in the
      // normal script order. Without this guard, the login retry
      // called raw unpatched loadQuote, rendering the form without
      // the locking wrapper and causing the portal to freeze.
      // If editor is not ready yet, we defer to the primary path
      // which will fire when quote-editor finishes loading.
      // -------------------------------------------------------
      window.addEventListener('ameridex-login', function _onLoginNav() {
        window.removeEventListener('ameridex-login', _onLoginNav);
        setTimeout(function () {
          if (_quoteLoadDone) return;
          if (!window._quoteEditorReady) {
            console.log('[portal-nav v1.5] Login retry: editor not ready yet, skipping. Primary path will handle it.');
            return;
          }
          console.log('[portal-nav v1.5] Login retry: editor ready, attempting load for: ' + quoteId);
          if (!tryLoadQuoteFromParam()) {
            console.warn('[portal-nav v1.5] Login retry failed for: ' + quoteId);
          }
        }, 100);
      });

      // -------------------------------------------------------
      // SAFETY NET: clean URL after 6s if all paths failed.
      // -------------------------------------------------------
      setTimeout(function () {
        if (!_quoteLoadDone) {
          console.warn('[portal-nav v1.5] All attempts failed for: ' + quoteId + '. Cleaning URL.');
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
      'custName':    'cust-name',
      'custEmail':   'cust-email',
      'custCompany': 'cust-company',
      'custPhone':   'cust-phone'
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
