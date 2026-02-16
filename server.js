// ============================================================
// AmeriDex Dealer Portal - Server Entry Point
// Date: 2026-02-16
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

// Quotes
const quoteRoutes = require('./routes/quotes');
app.use('/api/quotes', quoteRoutes);

// Admin - Dealers
const adminDealerRoutes = require('./routes/admin-dealers');
app.use('/api/admin/dealers', adminDealerRoutes);

// Admin - Quotes
const adminQuoteRoutes = require('./routes/admin-quotes');
app.use('/api/admin/quotes', adminQuoteRoutes);

// Admin - Products
const adminProductRoutes = require('./routes/admin-products');
app.use('/api/admin/products', adminProductRoutes);

// Admin - Pricing Tiers
const adminPricingRoutes = require('./routes/admin-pricing');
app.use('/api/admin/pricing-tiers', adminPricingRoutes);

// Admin - Users
const adminUserRoutes = require('./routes/admin-users');
app.use('/api/admin/users', adminUserRoutes);

// ----------------------------------------------------------
// Fallback: serve index.html for SPA-like behavior
// ----------------------------------------------------------
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dealer-portal.html'));
});

// ----------------------------------------------------------
// Start Server
// ----------------------------------------------------------
app.listen(PORT, () => {
    console.log('[AmeriDex Server] Running on port ' + PORT);
});
