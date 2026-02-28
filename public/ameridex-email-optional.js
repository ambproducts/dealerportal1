// ============================================================
// AmeriDex Dealer Portal - Email Optional Patch
// File: ameridex-email-optional.js
// Date: 2026-02-28
// ============================================================
// Makes customer email OPTIONAL on the quote screen.
// Only customer Name and Zip Code are mandatory.
//
// Overrides these global functions from dealer-portal.html:
//   - updateCustomerProgress  (badge 0/2 not 0/3)
//   - validateRequired        (email format-only when provided)
//   - searchCustomers         (null-safe email + zip searchable)
//   - showCustomerLookup      (shows zip when email empty)
//   - updateCustomerHistory   (dedup by name+zip when no email)
//   - showReviewModal         (shows 'Not provided' for empty email)
//
// DOM patches:
//   - Removes 'required' attribute from #cust-email
//   - Changes email label to 'Email (optional)'
// ============================================================

(function () {
    'use strict';

    // ========================================================
    // DOM PATCHES
    // ========================================================

    // Remove required from email input
    var emailInput = document.getElementById('cust-email');
    if (emailInput) {
        emailInput.removeAttribute('required');
    }

    // Change email label from "Email *" to "Email (optional)"
    var emailLabel = document.querySelector('label[for="cust-email"]');
    if (emailLabel) {
        emailLabel.innerHTML = 'Email (optional)';
    }

    // ========================================================
    // FUNCTION OVERRIDES
    // ========================================================

    // --------------------------------------------------------
    // updateCustomerProgress
    // Badge now shows 0/2 (name + zip). Email excluded.
    // --------------------------------------------------------
    window.updateCustomerProgress = function updateCustomerProgress() {
        var name = document.getElementById('cust-name').value.trim() ? 1 : 0;
        var zip  = document.getElementById('cust-zip').value.trim() ? 1 : 0;
        var completed = name + zip;
        var badge = document.getElementById('cust-badge');
        if (badge) {
            badge.textContent = completed + '/2';
            badge.classList.toggle('incomplete', completed !== 2);
        }
    };

    // --------------------------------------------------------
    // validateRequired
    // Name + zip are mandatory. Email is format-validated ONLY
    // when the user has typed something in the field.
    // --------------------------------------------------------
    window.validateRequired = function validateRequired() {
        var valid = true;
        var name  = document.getElementById('cust-name');
        var email = document.getElementById('cust-email');
        var zip   = document.getElementById('cust-zip');

        document.getElementById('err-name').textContent  = '';
        document.getElementById('err-email').textContent = '';
        document.getElementById('err-zip').textContent   = '';

        if (!name.value.trim()) {
            document.getElementById('err-name').textContent = 'Name is required';
            valid = false;
        }

        // Email is optional; validate format only if provided
        if (email.value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
            document.getElementById('err-email').textContent = 'Please enter a valid email address';
            valid = false;
        }

        if (!zip.value.trim()) {
            document.getElementById('err-zip').textContent = 'Zip code is required';
            valid = false;
        }

        if (currentQuote.lineItems.length === 0) {
            alert('Please add at least one item to your order.');
            valid = false;
        }

        if (!valid) {
            document.getElementById('customer').scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        return valid;
    };

    // --------------------------------------------------------
    // searchCustomers
    // Null-safe email access. Zip code now searchable.
    // --------------------------------------------------------
    window.searchCustomers = function searchCustomers(query) {
        if (!query || query.length < 2) return [];
        var lq = query.toLowerCase();
        return customerHistory.filter(function (c) {
            return (c.name || '').toLowerCase().includes(lq)
                || (c.email || '').toLowerCase().includes(lq)
                || (c.company && c.company.toLowerCase().includes(lq))
                || (c.zipCode || '').includes(lq);
        }).slice(0, 5);
    };

    // --------------------------------------------------------
    // showCustomerLookup
    // When email is empty, show zip code as the secondary line.
    // Also populates zip field when a customer is selected.
    // --------------------------------------------------------
    window.showCustomerLookup = function showCustomerLookup(results) {
        var container = document.getElementById('customer-lookup-results');
        if (results.length === 0) {
            container.classList.remove('visible');
            return;
        }
        container.innerHTML = '';
        results.forEach(function (customer) {
            var item = document.createElement('div');
            item.className = 'customer-lookup-item';
            var secondLine = customer.email
                ? customer.email
                : ('Zip: ' + (customer.zipCode || ''));
            item.innerHTML =
                '<div class="customer-lookup-name">'
                + customer.name
                + (customer.company ? ' (' + customer.company + ')' : '')
                + '</div>'
                + '<div class="customer-lookup-email">' + secondLine + '</div>';
            item.addEventListener('click', function () {
                document.getElementById('cust-name').value    = customer.name || '';
                document.getElementById('cust-email').value   = customer.email || '';
                document.getElementById('cust-company').value = customer.company || '';
                document.getElementById('cust-phone').value   = customer.phone || '';
                document.getElementById('cust-zip').value     = customer.zipCode || '';
                container.classList.remove('visible');
                updateCustomerProgress();
            });
            container.appendChild(item);
        });
        container.classList.add('visible');
    };

    // --------------------------------------------------------
    // updateCustomerHistory
    // Dedup strategy:
    //   - If email is present: match by email (existing behavior)
    //   - If no email: match by name + zipCode (fallback)
    // Also stores zipCode and phone in history entries.
    // --------------------------------------------------------
    window.updateCustomerHistory = function updateCustomerHistory() {
        var name  = currentQuote.customer.name;
        var email = currentQuote.customer.email;
        var zip   = currentQuote.customer.zipCode;
        if (!name) return;

        var existingIdx = -1;
        if (email) {
            existingIdx = customerHistory.findIndex(function (c) {
                return c.email && c.email.toLowerCase() === email.toLowerCase();
            });
        } else {
            existingIdx = customerHistory.findIndex(function (c) {
                return (!c.email)
                    && (c.name || '').toLowerCase() === name.toLowerCase()
                    && (c.zipCode || '') === (zip || '');
            });
        }

        if (existingIdx >= 0) {
            customerHistory[existingIdx].name = name;
            customerHistory[existingIdx].zipCode = zip;
            if (email) customerHistory[existingIdx].email = email;
            customerHistory[existingIdx].lastContact = new Date().toISOString();
        } else {
            customerHistory.push({
                email: email || '',
                name: name,
                company: currentQuote.customer.company || '',
                zipCode: zip || '',
                phone: currentQuote.customer.phone || '',
                quotes: [currentQuote.quoteId],
                lastContact: new Date().toISOString()
            });
        }
    };

    // --------------------------------------------------------
    // showReviewModal
    // Wraps the original to replace 'N/A' with 'Not provided'
    // for empty email on the review screen.
    // --------------------------------------------------------
    var _origShowReviewModal = window.showReviewModal;
    window.showReviewModal = function showReviewModal() {
        // Call original to build the full review UI
        if (typeof _origShowReviewModal === 'function') {
            _origShowReviewModal();
        }
        // Patch the email display
        var reviewEmail = document.getElementById('review-email');
        if (reviewEmail) {
            var text = reviewEmail.textContent.trim();
            if (!text || text === 'N/A') {
                reviewEmail.textContent = 'Not provided';
            }
        }
    };

    // --------------------------------------------------------
    // Immediately update the progress badge to reflect new rules
    // --------------------------------------------------------
    if (typeof window.updateCustomerProgress === 'function') {
        window.updateCustomerProgress();
    }

    console.log('[EmailOptional] Patch applied: email is now optional, name + zip required.');
})();
