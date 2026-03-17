// ============================================================
// AmeriDex Dealer Portal - Server Entry Point
// ============================================================

const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const app = express();
const PORT = process.env.PORT || 3000;

// Read version once at startup
const pkg = require('./package.json');

// Seed / migrate data files before any routes are registered
const { ensureDataFiles } = require('./lib/data-init');
ensureDataFiles();

// Middleware
app.use(express.json({ limit: '5mb' })); // raised for full HTML bodies sent to /api/pdf/generate
app.use(express.static(path.join(__dirname, 'public')));

// ----------------------------------------------------------
// Security Middleware
// ----------------------------------------------------------

// Helmet — security headers (CSP disabled until inline scripts are audited)
app.use(helmet({
    contentSecurityPolicy: false,
    frameguard: false
}));

// CORS — reflect request origin (same-origin SPA)
app.use(cors({
    origin: true,
    credentials: true
}));

// ----------------------------------------------------------
// Health check + version — BEFORE rate limiter so Render's
// health check bot never gets rate-limited (HTTP 429) during
// deploy cycles and crash-loop restarts.
// ----------------------------------------------------------
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/version', (req, res) => {
    res.status(200).json({ version: pkg.version, name: pkg.name });
});

// General API rate limit
app.use('/api/', rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    standardHeaders: true,
    legacyHeaders: false
}));

// Strict rate limit on login
app.use('/api/auth/login', rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many login attempts, please try again later' }
}));

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

// PDF generation (Puppeteer — server-side true PDF)
const pdfRoutes = require('./routes/pdf');
app.use('/api/pdf', pdfRoutes);

// Admin - Dealers (includes per-dealer pricing endpoints)
const adminDealerRoutes = require('./routes/admin-dealers');
app.use('/api/admin/dealers', adminDealerRoutes);

// Admin - Quotes
const adminQuoteRoutes = require('./routes/admin-quotes');
app.use('/api/admin/quotes', adminQuoteRoutes);

// Admin - Products
const adminProductRoutes = require('./routes/admin-products');
app.use('/api/admin/products', adminProductRoutes);

// Admin - Colors
const adminColorRoutes = require('./routes/admin-colors');
app.use('/api/admin/colors', adminColorRoutes);

// Admin - Categories
const adminCategoryRoutes = require('./routes/admin-categories');
app.use('/api/admin/categories', adminCategoryRoutes);

// Colors (dealer-facing, read-only)
const colorRoutes = require('./routes/colors');
app.use('/api/colors', colorRoutes);

// Admin - Pricing (deprecated stub, kept for backward compat)
const adminPricingRoutes = require('./routes/admin-pricing');
app.use('/api/admin/pricing-tiers', adminPricingRoutes);

// Admin - Users
const adminUserRoutes = require('./routes/admin-users');
app.use('/api/admin/users', adminUserRoutes);

// Admin - Customers
const adminCustomerRoutes = require('./routes/admin-customers');
app.use('/api/admin/customers', adminCustomerRoutes);

// Admin - Rep Pricing (salesrep direct-sale pricing)
const adminRepPricingRoutes = require('./routes/admin-rep-pricing');
app.use('/api/admin/rep-pricing', adminRepPricingRoutes);

// ----------------------------------------------------------
// SPA fallback
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
