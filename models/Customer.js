// ============================================================
// AmeriDex Dealer Portal - Customer Model (Mongoose)
// File: models/Customer.js
// Date: 2026-02-28
// ============================================================
// v2 Changes (2026-02-28):
//   - Email is now OPTIONAL (was required). Default is ''.
//   - Zip code is now REQUIRED (was optional with default '').
//   - Unique compound index changed to partial index: only
//     enforces email+dealer uniqueness when email is non-empty.
//   - Added fallback compound index on name+zipCode+dealers
//     for dedup when email is absent.
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
        trim: true,
        lowercase: true,
        default: '',
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
        required: [true, 'Customer zip code is required'],
        trim: true,
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
// COMPOUND INDEX: enforce one record per email per dealer,
// but ONLY when email is non-empty.  This is a partial
// unique index so that multiple customers without an email
// can coexist under the same dealer.
// -------------------------------------------------------
customerSchema.index(
    { email: 1, dealers: 1 },
    {
        unique: true,
        name: 'unique_email_per_dealer',
        partialFilterExpression: {
            email: { $exists: true, $gt: '' }
        }
    }
);

// -------------------------------------------------------
// FALLBACK DEDUP: when email is absent, use name + zip +
// dealer to prevent obvious duplicates.
// -------------------------------------------------------
customerSchema.index(
    { name: 1, zipCode: 1, dealers: 1 },
    { name: 'name_zip_dealer' }
);

// Text search index for autocomplete
customerSchema.index(
    { name: 'text', email: 'text', company: 'text', zipCode: 'text' },
    { name: 'customer_text_search' }
);

// Compound index for the most common query pattern:
// "find customers for dealer X, sorted by most recent"
customerSchema.index(
    { dealers: 1, updatedAt: -1 },
    { name: 'dealer_recent' }
);

module.exports = mongoose.model('Customer', customerSchema);
