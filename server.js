// ============================================================
// AmeriDex Dealer Portal - Server Entry Point
// Date: 2026-02-28
// ============================================================

const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ----------------------------------------------------------
// API Routes
// ----------------------------------------------------------

// Auth
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

// Users (GM-scoped + admin)
const userRoutes = require('./routes/users');
app.use('/api/users', userRoutes);

// Products (dealer-priced)
const productRoutes = require('./routes/products');
app.use('/api/products', productRoutes);

// Quotes
const quoteRoutes = require('./routes/quotes');
app.use('/api/quotes', quoteRoutes);

// Customers
const customerRoutes = require('./routes/customers');
app.use('/api/customers', customerRoutes);

// Admin - Dealers (includes per-dealer pricing endpoints)
const adminDealerRoutes = require('./routes/admin-dealers');
app.use('/api/admin/dealers', adminDealerRoutes);

// Admin - Quotes
const adminQuoteRoutes = require('./routes/admin-quotes');
app.use('/api/admin/quotes', adminQuoteRoutes);

// Admin - Products
const adminProductRoutes = require('./routes/admin-products');
app.use('/api/admin/products', adminProductRoutes);

// Admin - Pricing (deprecated stub, kept for backward compat)
const adminPricingRoutes = require('./routes/admin-pricing');
app.use('/api/admin/pricing-tiers', adminPricingRoutes);

// Admin - Users
const adminUserRoutes = require('./routes/admin-users');
app.use('/api/admin/users', adminUserRoutes);

// Admin - Customers
const adminCustomerRoutes = require('./routes/admin-customers');
app.use('/api/admin/customers', adminCustomerRoutes);

// ----------------------------------------------------------
// Health check + SPA fallback
// ----------------------------------------------------------
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dealer-portal.html'));
});

// ----------------------------------------------------------
// Start Server
// ----------------------------------------------------------
app.listen(PORT, () => {
    console.log('[AmeriDex Server] Running on port ' + PORT);
});
