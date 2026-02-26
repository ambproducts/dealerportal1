/* CUSTOMERS SECTION JAVASCRIPT - ADD THIS BEFORE THE CLOSING </script> TAG */
/* Location: Inside the main <script> tag, before the closing DOMContentLoaded */

// ============================================
// CUSTOMERS SECTION FUNCTIONS
// ============================================

function showCustomersView() {
    document.getElementById('saved-quotes-section').style.display = 'none';
    document.getElementById('customers-section').style.display = 'block';
    renderCustomersList();
}

function showQuotesView() {
    document.getElementById('customers-section').style.display = 'none';
    document.getElementById('saved-quotes-section').style.display = 'block';
}

function getCustomersWithQuotes() {
    // Build customer list from customerHistory and enrich with quote data
    const customersMap = new Map();
    
    // First, get all customers from history
    customerHistory.forEach(customer => {
        customersMap.set(customer.email.toLowerCase(), {
            name: customer.name,
            email: customer.email,
            company: customer.company || '',
            phone: customer.phone || '',
            quotes: [],
            lastContact: customer.lastContact
        });
    });
    
    // Then add quote details
    savedQuotes.forEach(quote => {
        const email = quote.customer.email.toLowerCase();
        if (customersMap.has(email)) {
            const customer = customersMap.get(email);
            const total = quote.lineItems.reduce((sum, li) => sum + getItemSubtotalFromData(li), 0);
            customer.quotes.push({
                quoteId: quote.quoteId,
                date: quote.updatedAt || quote.createdAt,
                total: total,
                itemCount: quote.lineItems.length
            });
            // Update customer info in case it changed
            customer.name = quote.customer.name || customer.name;
            customer.company = quote.customer.company || customer.company;
            customer.phone = quote.customer.phone || customer.phone;
        }
    });
    
    // Convert to array and sort by last contact
    return Array.from(customersMap.values()).sort((a, b) => {
        return new Date(b.lastContact) - new Date(a.lastContact);
    });
}

function renderCustomersList() {
    const customers = getCustomersWithQuotes();
    const searchQuery = (document.getElementById('customer-search').value || '').toLowerCase();
    
    // Filter customers
    let filtered = customers;
    if (searchQuery) {
        filtered = customers.filter(c => 
            c.name.toLowerCase().includes(searchQuery) ||
            c.email.toLowerCase().includes(searchQuery) ||
            (c.company && c.company.toLowerCase().includes(searchQuery))
        );
    }
    
    // Update stats
    const countText = filtered.length === 1 ? '1 customer' : filtered.length + ' customers';
    document.getElementById('customer-count').textContent = countText;
    
    // Render list
    const list = document.getElementById('customers-list');
    
    if (filtered.length === 0) {
        list.innerHTML = '<div class="no-customers">' + 
            (searchQuery ? 'No customers match your search' : 'No customers yet. Create your first quote to add customers.') + 
            '</div>';
        return;
    }
    
    list.innerHTML = '';
    
    filtered.forEach((customer, idx) => {
        const item = document.createElement('div');
        item.className = 'customer-item';
        
        // Customer info
        const info = document.createElement('div');
        info.className = 'customer-info';
        
        const name = document.createElement('div');
        name.className = 'customer-name';
        name.textContent = customer.name;
        info.appendChild(name);
        
        const email = document.createElement('div');
        email.className = 'customer-email';
        email.textContent = customer.email;
        info.appendChild(email);
        
        if (customer.company) {
            const company = document.createElement('div');
            company.className = 'customer-company';
            company.textContent = customer.company;
            info.appendChild(company);
        }
        
        // Meta info
        const meta = document.createElement('div');
        meta.className = 'customer-meta';
        
        const quoteCount = document.createElement('div');
        quoteCount.className = 'customer-meta-item';
        const countBadge = document.createElement('span');
        countBadge.className = 'customer-quote-count';
        countBadge.textContent = customer.quotes.length + ' ' + (customer.quotes.length === 1 ? 'quote' : 'quotes');
        quoteCount.appendChild(countBadge);
        meta.appendChild(quoteCount);
        
        const lastContact = document.createElement('div');
        lastContact.className = 'customer-meta-item';
        lastContact.textContent = 'Last: ' + new Date(customer.lastContact).toLocaleDateString();
        meta.appendChild(lastContact);
        
        info.appendChild(meta);
        
        // View quotes toggle
        if (customer.quotes.length > 0) {
            const toggleBtn = document.createElement('button');
            toggleBtn.className = 'view-quotes-toggle';
            toggleBtn.textContent = 'View quote history ▼';
            toggleBtn.onclick = (e) => {
                e.stopPropagation();
                const history = item.querySelector('.customer-quote-history');
                const isVisible = history.classList.contains('visible');
                history.classList.toggle('visible');
                toggleBtn.textContent = isVisible ? 'View quote history ▼' : 'Hide quote history ▲';
            };
            info.appendChild(toggleBtn);
            
            // Quote history
            const history = document.createElement('div');
            history.className = 'customer-quote-history';
            
            const historyTitle = document.createElement('div');
            historyTitle.className = 'customer-quote-history-title';
            historyTitle.textContent = 'Quote History';
            history.appendChild(historyTitle);
            
            const quoteList = document.createElement('div');
            quoteList.className = 'customer-quote-list';
            
            customer.quotes.forEach(quote => {
                const quoteItem = document.createElement('div');
                quoteItem.className = 'customer-quote-item';
                quoteItem.innerHTML = 
                    '<div><span class="customer-quote-id">' + quote.quoteId + '</span> ' +
                    '<span class="customer-quote-date">(' + new Date(quote.date).toLocaleDateString() + ')</span></div>' +
                    '<div class="customer-quote-amount">' + formatCurrency(quote.total) + '</div>';
                quoteList.appendChild(quoteItem);
            });
            
            history.appendChild(quoteList);
            info.appendChild(history);
        }
        
        item.appendChild(info);
        
        // Actions
        const actions = document.createElement('div');
        actions.className = 'customer-actions';
        
        const newQuoteBtn = document.createElement('button');
        newQuoteBtn.className = 'btn btn-primary btn-sm';
        newQuoteBtn.textContent = '+ New Quote';
        newQuoteBtn.onclick = () => createQuoteFromCustomer(customer);
        actions.appendChild(newQuoteBtn);
        
        item.appendChild(actions);
        list.appendChild(item);
    });
}

function createQuoteFromCustomer(customer) {
    // Check if there's unsaved work
    if (currentQuote.lineItems.length > 0 || document.getElementById('cust-name').value.trim()) {
        if (!confirm('Starting a new quote will clear your current work. Continue?')) {
            return;
        }
    }
    
    // Reset the form
    resetFormOnly();
    
    // Pre-fill customer information
    document.getElementById('cust-name').value = customer.name;
    document.getElementById('cust-email').value = customer.email;
    document.getElementById('cust-company').value = customer.company || '';
    document.getElementById('cust-phone').value = customer.phone || '';
    
    // Note: Zip code is not stored in customerHistory, so we leave it blank
    // The user will need to enter it
    
    // Update customer progress
    updateCustomerProgress();
    
    // Switch back to quotes view and scroll to customer section
    showQuotesView();
    setTimeout(() => {
        document.getElementById('customer').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
    
    // Optional: Show a helpful message
    alert('Customer info loaded! Please verify the zip code and start adding items.');
}

// ============================================
// ADD THESE EVENT HANDLERS TO DOMContentLoaded
// ============================================
/*
Add these lines inside the DOMContentLoaded event listener:

    // Customers view navigation
    document.getElementById('view-customers-btn').onclick = showCustomersView;
    document.getElementById('back-to-quotes-btn').onclick = showQuotesView;
    document.getElementById('customer-search').oninput = renderCustomersList;
*/