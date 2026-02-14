// ============================================================
// AmeriDex Dealer Portal - Customer Model (Mongoose)
// File: models/Customer.js
// Date: 2026-02-13
// ============================================================

const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Customer name is required'],
        trim: true,
        index: true
    },
    email: {
        type: String,
        required: [true, 'Customer email is required'],
        trim: true,
        lowercase: true,
        index: true
    },
    company: {
        type: String,
        trim: true,
        default: ''
    },
    phone: {
        type: String,
        trim: true,
        default: ''
    },
    zipCode: {
        type: String,
        trim: true,
        default: '',
        index: true
    },
    dealers: {
        type: [String],
        required: true,
        index: true,
        validate: {
            validator: function (arr) { return arr.length > 0; },
            message: 'At least one dealer code is required'
        }
    },
    notes: {
        type: String,
        default: ''
    },
    firstContact: {
        type: Date,
        default: Date.now
    },
    lastContact: {
        type: Date,
        default: Date.now,
        index: true
    }
}, {
    timestamps: true     // adds createdAt and updatedAt automatically
});

// -------------------------------------------------------
// COMPOUND INDEX: enforce one record per email per dealer
// This is the core of Option A isolation.
// The same email CAN exist under different dealers as
// separate documents, but cannot be duplicated within the
// same dealer.
// -------------------------------------------------------
customerSchema.index(
    { email: 1, dealers: 1 },
    { unique: true, name: 'unique_email_per_dealer' }
);

// Text search index for autocomplete
customerSchema.index(
    { name: 'text', email: 'text', company: 'text' },
    { name: 'customer_text_search' }
);

// Compound index for the most common query pattern:
// "find customers for dealer X, sorted by most recent"
customerSchema.index(
    { dealers: 1, updatedAt: -1 },
    { name: 'dealer_recent' }
);

module.exports = mongoose.model('Customer', customerSchema);
