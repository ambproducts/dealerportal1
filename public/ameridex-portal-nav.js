/**
 * ameridex-portal-nav.js
 * 
 * Runtime patch for dealer-portal.html (Step 3a)
 * 
 * This script is loaded via a <script> tag added to dealer-portal.html.
 * It modifies the page at runtime without editing the massive HTML file inline.
 *
 * Features:
 *   1. Injects a "My Quotes" navigation link into the header
 *   2. Trims the saved-quotes list to show only 5 most recent
 *   3. Appends a "View All Quotes" link below the trimmed list
 *   4. Reads URL parameters to support deep-linking from quotes-customers.html:
 *      - ?quoteId=XXX      -> loads that quote (matches by quoteNumber or server _id)
 *      - ?newQuote=1        -> resets form for a fresh quote
 *      - ?custName=...      -> pre-fills customer name
 *      - ?custEmail=...     -> pre-fills customer email
 *      - ?custCompany=...   -> pre-fills customer company
 *      - ?custPhone=...     -> pre-fills customer phone
 *      - ?tab=customers     -> opens the customers panel
 *
 * v1.1 Changes (2026-02-27):
 *   - FIX: quoteId handler now searches savedQuotes by BOTH quoteId (quote number)
 *     AND _serverId (MongoDB ID) so links from quotes-customers.html work correctly.
 *   - FIX: cleanUrlParams() moved inside success path only. Previously it wiped
 *     the URL immediately before the setTimeout fired, preventing all fallbacks.
 *   - ADD: ameridex-login retry. If savedQuotes hasn't loaded by the initial 200ms
 *     attempt, retries once the login event fires (guarantees savedQuotes populated).
 *   - ADD: 6-second safety timeout cleans URL if all retries fail.
 */

(function portalNavPatch() {
  'use strict';

  // --------------------------------------------------
  // 1. Inject "My Quotes" nav link into header-actions
  // --------------------------------------------------
  function injectNavLink() {
    var actions = document.querySelector('.header-actions');
    if (!actions) return;

    // Don't inject twice
    if (actions.querySelector('[data-nav-quotes]')) return;

    var link = document.createElement('a');
    link.href = 'quotes-customers.html';
    link.className = 'header-btn';
    link.setAttribute('data-nav-quotes', 'true');
    link.textContent = 'My Quotes';
    link.style.textDecoration = 'none';

    // Insert before the Settings button (second-to-last child)
    var settingsBtn = document.getElementById('settings-btn');
    if (settingsBtn) {
      actions.insertBefore(link, settingsBtn);
    } else {
      // Fallback: insert before last child (logout)
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
      // Remove "View All" link if list is short enough
      var existingLink = list.parentElement.querySelector('[data-view-all-quotes]');
      if (existingLink) existingLink.remove();
      return;
    }

    // Hide items beyond MAX_VISIBLE
    for (var i = 0; i < items.length; i++) {
      if (i >= MAX_VISIBLE) {
        items[i].style.display = 'none';
      } else {
        items[i].style.display = '';
      }
    }

    // Add or update "View All" link
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

      viewAllLink.addEventListener('mouseenter', function () {
        viewAllLink.style.backgroundColor = '#eff6ff';
      });
      viewAllLink.addEventListener('mouseleave', function () {
        viewAllLink.style.backgroundColor = '';
      });

      // Insert after the saved-quotes-list container
      if (list.nextSibling) {
        parent.insertBefore(viewAllLink, list.nextSibling);
      } else {
        parent.appendChild(viewAllLink);
      }
    } else {
      // Update count
      viewAllLink.textContent = 'View All Quotes (' + items.length + ')';
    }
  }

  // --------------------------------------------------
  // 3. Observe #saved-quotes-list for mutations
  //    (renderSavedQuotes() replaces innerHTML each call)
  // --------------------------------------------------
  function observeSavedQuotesList() {
    var list = document.getElementById('saved-quotes-list');
    if (!list) return;

    var observer = new MutationObserver(function () {
      trimSavedQuotesList();
    });

    observer.observe(list, { childList: true, subtree: true });

    // Initial trim in case the list is already rendered
    trimSavedQuotesList();
  }

  // --------------------------------------------------
  // 4. Handle URL parameters from quotes-customers.html
  // --------------------------------------------------
  function handleUrlParams() {
    var params = new URLSearchParams(window.location.search);

    // ?tab=customers -> open customers panel
    if (params.get('tab') === 'customers') {
      var showCustomers = window.showCustomersView;
      if (typeof showCustomers === 'function') {
        // Small delay to ensure DOM is ready
        setTimeout(showCustomers, 100);
      }
    }

    // ?newQuote=1 -> reset form
    if (params.get('newQuote') === '1') {
      var resetFn = window.resetFormOnly;
      if (typeof resetFn === 'function') {
        setTimeout(function () {
          resetFn();
          prefillCustomerFromParams(params);
        }, 150);
      }
      // Clean URL
      cleanUrlParams();
      return;
    }

    // ?quoteId=XXX -> load that quote
    // Supports both quoteNumber (e.g. Q260228-EGJI) and server _id (MongoDB ObjectId)
    var quoteId = params.get('quoteId');
    if (quoteId) {
      var _quoteLoadDone = false;

      function tryLoadQuoteFromParam() {
        if (_quoteLoadDone) return true;
        if (typeof window.savedQuotes === 'undefined' || !window.savedQuotes || !window.savedQuotes.length) {
          return false;
        }

        // Try 1: match by quoteId (frontend quote number like Q260228-EGJI)
        var idx = window.savedQuotes.findIndex(function (q) {
          return q.quoteId === quoteId;
        });

        // Try 2: match by _serverId (MongoDB ObjectId)
        if (idx < 0) {
          idx = window.savedQuotes.findIndex(function (q) {
            return q._serverId === quoteId;
          });
        }

        // Try 3: match by _serverQuoteNumber (in case quoteId is the server quote number)
        if (idx < 0) {
          idx = window.savedQuotes.findIndex(function (q) {
            return q._serverQuoteNumber === quoteId;
          });
        }

        if (idx >= 0 && typeof window.loadQuote === 'function') {
          _quoteLoadDone = true;
          console.log('[portal-nav v1.1] Loading quote at savedQuotes[' + idx + '] for param: ' + quoteId);
          window.loadQuote(idx);
          cleanUrlParams();
          var custSection = document.getElementById('customer');
          if (custSection) {
            custSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
          return true;
        }

        return false;
      }

      // Attempt 1: try after short delay (savedQuotes may already be populated)
      setTimeout(function () {
        if (!tryLoadQuoteFromParam()) {
          console.log('[portal-nav v1.1] Attempt 1 missed, waiting for ameridex-login...');
        }
      }, 200);

      // Attempt 2: retry when ameridex-login fires (savedQuotes guaranteed loaded by then)
      window.addEventListener('ameridex-login', function _onLoginNav() {
        window.removeEventListener('ameridex-login', _onLoginNav);
        setTimeout(function () {
          if (!tryLoadQuoteFromParam()) {
            console.warn('[portal-nav v1.1] Attempt 2 (post-login) also failed for: ' + quoteId);
          }
        }, 100);
      });

      // Safety net: clean URL after 6 seconds even if we could not find the quote
      setTimeout(function () {
        if (!_quoteLoadDone) {
          console.warn('[portal-nav v1.1] Could not load quote for param: ' + quoteId + ' after all retries. Cleaning URL.');
          cleanUrlParams();
        }
      }, 6000);

      return;
    }

    // Pre-fill customer fields if present (without newQuote)
    if (params.get('custName') || params.get('custEmail')) {
      setTimeout(function () {
        prefillCustomerFromParams(params);
      }, 150);
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
        if (el) {
          el.value = decodeURIComponent(val);
          filled = true;
        }
      }
    });

    if (filled && typeof window.updateCustomerProgress === 'function') {
      window.updateCustomerProgress();
    }
  }

  function cleanUrlParams() {
    if (window.history && window.history.replaceState) {
      var clean = window.location.pathname;
      window.history.replaceState({}, document.title, clean);
    }
  }

  // --------------------------------------------------
  // Bootstrap: run after DOM is ready
  // --------------------------------------------------
  function init() {
    injectNavLink();
    observeSavedQuotesList();
    handleUrlParams();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // DOM already ready (script loaded at end of body)
    // Use setTimeout to ensure all inline scripts have run first
    setTimeout(init, 50);
  }

})();
