// ============================================================
// Master Router - Wires all route modules to the Express app
// ============================================================
const express = require('express');
const router = express.Router();

const { requireAuth } = require('../middleware/auth');

// Public routes
const authRoutes = require('./auth');
router.use('/api/auth', authRoutes);

// Authenticated routes
const dealerRoutes = require('./dealers');
router.use('/api/dealers', requireAuth, dealerRoutes);

const productRoutes = require('./products');
router.use('/api/products', productRoutes);

const quoteRoutes = require('./quotes');
router.use('/api/quotes', quoteRoutes);

const customerRoutes = require('./customers');
router.use('/api/customers', customerRoutes);

const userRoutes = require('./users');
router.use('/api/users', userRoutes);

// Admin routes (all require admin role checked inside each module)
const adminDealerRoutes = require('./admin-dealers');
router.use('/api/admin/dealers', requireAuth, adminDealerRoutes);

const adminQuoteRoutes = require('./admin-quotes');
router.use('/api/admin/quotes', requireAuth, adminQuoteRoutes);

const adminPricingRoutes = require('./admin-pricing');
router.use('/api/admin/pricing-tiers', requireAuth, adminPricingRoutes);

const adminProductRoutes = require('./admin-products');
router.use('/api/admin/products', requireAuth, adminProductRoutes);

const adminCustomerRoutes = require('./admin-customers');
router.use('/api/admin/customers', requireAuth, adminCustomerRoutes);

module.exports = router;
