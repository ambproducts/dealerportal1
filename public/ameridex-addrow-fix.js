// ============================================
// ameridex-addrow-fix.js
// Patch for: "+ Add Line Item" button does nothing
// Root cause: Customer search feature introduced two bugs:
//   1. Unclosed <div> in saved-quotes card-header corrupts DOM tree
//   2. renderCustomersList() called but never defined anywhere
// ============================================

(function() {
    'use strict';

    // ---- FIX 1: Repair broken DOM nesting ----
    // The saved-quotes-section card-header has an unclosed <div> wrapper
    // around the Customers + New Quote buttons. This causes the browser
    // to nest subsequent sections (calculator, colors, customer info,
    // order details) INSIDE the saved-quotes card, which can break
    // element lookups and event handling.
    //
    // We fix this by finding the orphaned structure and re-closing it.

    function repairSavedQuotesDOM() {
        var savedSection = document.getElementById('saved-quotes-section');
        if (!savedSection) return;

        // Check if the order section got swallowed inside saved-quotes-section
        var orderSection = document.getElementById('order');
        if (!orderSection) return;

        // If the order section is a descendant of saved-quotes-section,
        // the DOM is corrupted. We need to move sections out.
        if (savedSection.contains(orderSection)) {
            console.warn('[addrow-fix] Detected corrupted DOM nesting. Repairing...');

            // Collect all the sections that should be siblings after saved-quotes-section
            var sectionsToMove = [];
            var sectionIds = ['customers-section', 'calculator', 'colors', 'customer', 'order'];

            sectionIds.forEach(function(id) {
                var el = document.getElementById(id);
                if (el && savedSection.contains(el) && el !== savedSection) {
                    sectionsToMove.push(el);
                }
            });

            // Also grab any remaining cards after order (shipping, total, actions)
            // by walking siblings of the order section's parent form
            var form = document.getElementById('order-form');

            // Move each displaced section to be a direct child of the form,
            // right after saved-quotes-section
            var insertAfter = savedSection;
            sectionsToMove.forEach(function(section) {
                section.parentNode.removeChild(section);
                if (insertAfter.nextSibling) {
                    form.insertBefore(section, insertAfter.nextSibling);
                } else {
                    form.appendChild(section);
                }
                insertAfter = section;
            });

            console.log('[addrow-fix] DOM repair complete. Moved', sectionsToMove.length, 'sections.');
        }
    }

    // ---- FIX 2: Define missing renderCustomersList ----
    // This function is referenced by event handlers but was never defined.
    // It causes a ReferenceError that silently kills the JS execution
    // context, which can prevent subsequent event handlers from firing.

    if (typeof window.renderCustomersList !== 'function') {
        window.renderCustomersList = function renderCustomersList() {
            var list = document.getElementById('customers-list');
            var searchInput = document.getElementById('customer-search');
            var countEl = document.getElementById('customer-count');
            if (!list) return;

            var query = (searchInput ? searchInput.value : '').toLowerCase().trim();

            // customerHistory is defined in the main inline script
            var customers = (typeof customerHistory !== 'undefined') ? customerHistory : [];

            // Filter by search query
            if (query.length >= 2) {
                customers = customers.filter(function(c) {
                    return (c.name && c.name.toLowerCase().indexOf(query) !== -1) ||
                           (c.email && c.email.toLowerCase().indexOf(query) !== -1) ||
                           (c.company && c.company.toLowerCase().indexOf(query) !== -1);
                });
            }

            // Update count
            if (countEl) {
                countEl.textContent = customers.length + ' customer' + (customers.length !== 1 ? 's' : '');
            }

            // Render list
            if (customers.length === 0) {
                list.innerHTML = '<div class="no-customers">' +
                    (query ? 'No customers match your search.' : 'No customers yet. Create your first quote to add customers.') +
                    '</div>';
                return;
            }

            list.innerHTML = '';
            customers.forEach(function(customer) {
                var item = document.createElement('div');
                item.className = 'customer-item';

                var info = document.createElement('div');
                info.className = 'customer-info';

                var nameEl = document.createElement('div');
                nameEl.className = 'customer-name';
                nameEl.textContent = customer.name || 'Unknown';
                info.appendChild(nameEl);

                if (customer.email) {
                    var emailEl = document.createElement('div');
                    emailEl.className = 'customer-email';
                    emailEl.textContent = customer.email;
                    info.appendChild(emailEl);
                }

                if (customer.company) {
                    var companyEl = document.createElement('div');
                    companyEl.className = 'customer-company';
                    companyEl.textContent = customer.company;
                    info.appendChild(companyEl);
                }

                item.appendChild(info);

                // Action button: create a new quote for this customer
                var actions = document.createElement('div');
                actions.className = 'customer-actions';

                var newQuoteBtn = document.createElement('button');
                newQuoteBtn.type = 'button';
                newQuoteBtn.className = 'btn btn-primary btn-sm';
                newQuoteBtn.textContent = '+ New Quote';
                newQuoteBtn.addEventListener('click', function() {
                    // Pre-fill customer info and switch to quotes view
                    document.getElementById('cust-name').value = customer.name || '';
                    document.getElementById('cust-email').value = customer.email || '';
                    document.getElementById('cust-company').value = customer.company || '';
                    document.getElementById('cust-phone').value = customer.phone || '';
                    if (typeof updateCustomerProgress === 'function') updateCustomerProgress();
                    if (typeof showQuotesView === 'function') showQuotesView();
                    var custSection = document.getElementById('customer');
                    if (custSection) custSection.scrollIntoView({ behavior: 'smooth' });
                });
                actions.appendChild(newQuoteBtn);
                item.appendChild(actions);

                list.appendChild(item);
            });
        };
        console.log('[addrow-fix] Registered missing renderCustomersList() function.');
    }

    // ---- FIX 3: Defensive guard for render() ----
    // Wrap the existing render() to catch errors so one failure
    // doesn't silently kill the whole event handler chain.

    if (typeof window.render === 'function') {
        var _originalRender = window.render;
        window.render = function safeRender() {
            try {
                _originalRender.apply(this, arguments);
            } catch (err) {
                console.error('[addrow-fix] render() error caught:', err);
                // Attempt a minimal recovery: make sure tbody exists
                var tbody = document.querySelector('#line-items tbody');
                if (!tbody) {
                    console.warn('[addrow-fix] #line-items tbody not found, attempting DOM repair...');
                    repairSavedQuotesDOM();
                    try {
                        _originalRender.apply(this, arguments);
                        console.log('[addrow-fix] render() succeeded after DOM repair.');
                    } catch (retryErr) {
                        console.error('[addrow-fix] render() still failing after repair:', retryErr);
                    }
                }
            }
        };
    }

    // ---- Execute DOM repair on load ----
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', repairSavedQuotesDOM);
    } else {
        // DOM already loaded, run immediately
        repairSavedQuotesDOM();
    }

    console.log('[addrow-fix] Patch loaded successfully.');
})();
