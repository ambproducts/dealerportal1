// ============================================================
// AmeriDex Dealer Portal - User Model (Mongoose)
// File: models/User.js
// Date: 2026-02-13
// ============================================================
// Supports three roles: admin, gm (General Manager), frontdesk
//
// Account lifecycle:
//   1. GM creates front desk account -> status: "pending_approval"
//   2. Admin approves -> status: "active"
//   3. GM or Admin can disable -> status: "disabled"
//   4. Admin can re-enable -> status: "active"
//
// Only admin can assign "gm" role.
// Only admin can delete user accounts.
// ============================================================

const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const SALT_ROUNDS = 12;
const VALID_ROLES = ['admin', 'gm', 'frontdesk'];
const VALID_STATUSES = ['pending_approval', 'active', 'disabled'];

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: [true, 'Username is required'],
        trim: true,
        lowercase: true,
        minlength: [3, 'Username must be at least 3 characters'],
        maxlength: [20, 'Username cannot exceed 20 characters'],
        match: [/^[a-z0-9._-]+$/, 'Username can only contain lowercase letters, numbers, dots, hyphens, and underscores'],
        unique: true,
        index: true
    },
    passwordHash: {
        type: String,
        required: true
    },
    dealerCode: {
        type: String,
        required: [true, 'Dealer code is required'],
        uppercase: true,
        trim: true,
        match: [/^[A-Z0-9]{6}$/, 'Dealer code must be 6 alphanumeric characters'],
        index: true
    },
    role: {
        type: String,
        required: true,
        enum: {
            values: VALID_ROLES,
            message: 'Role must be one of: ' + VALID_ROLES.join(', ')
        },
        default: 'frontdesk',
        index: true
    },
    displayName: {
        type: String,
        required: [true, 'Display name is required'],
        trim: true,
        maxlength: [50, 'Display name cannot exceed 50 characters']
    },
    email: {
        type: String,
        trim: true,
        lowercase: true,
        default: ''
    },
    phone: {
        type: String,
        trim: true,
        default: ''
    },
    status: {
        type: String,
        required: true,
        enum: {
            values: VALID_STATUSES,
            message: 'Status must be one of: ' + VALID_STATUSES.join(', ')
        },
        default: 'pending_approval',
        index: true
    },
    createdBy: {
        type: String,
        required: [true, 'Creator username is required'],
        trim: true
    },
    approvedBy: {
        type: String,
        trim: true,
        default: null
    },
    approvedAt: {
        type: Date,
        default: null
    },
    lastLogin: {
        type: Date,
        default: null
    },
    loginCount: {
        type: Number,
        default: 0
    },
    failedLoginAttempts: {
        type: Number,
        default: 0
    },
    lockedUntil: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

// -------------------------------------------------------
// INDEXES
// -------------------------------------------------------

// Fast lookup for login: find by username + dealerCode
userSchema.index(
    { dealerCode: 1, username: 1 },
    { unique: true, name: 'dealer_username' }
);

// Admin query: find all pending approvals
userSchema.index(
    { status: 1, createdAt: -1 },
    { name: 'status_recent' }
);

// GM query: find all users for my dealer
userSchema.index(
    { dealerCode: 1, status: 1, role: 1 },
    { name: 'dealer_users' }
);

// -------------------------------------------------------
// INSTANCE METHODS
// -------------------------------------------------------

// Set password (hashes it)
userSchema.methods.setPassword = async function (plaintext) {
    if (!plaintext || plaintext.length < 6) {
        throw new Error('Password must be at least 6 characters');
    }
    this.passwordHash = await bcrypt.hash(plaintext, SALT_ROUNDS);
};

// Verify password
userSchema.methods.verifyPassword = async function (plaintext) {
    if (!plaintext || !this.passwordHash) return false;
    return bcrypt.compare(plaintext, this.passwordHash);
};

// Check if account is locked
userSchema.methods.isLocked = function () {
    if (!this.lockedUntil) return false;
    if (new Date() > this.lockedUntil) {
        // Lock has expired, clear it
        this.lockedUntil = null;
        this.failedLoginAttempts = 0;
        return false;
    }
    return true;
};

// Record a failed login attempt (locks after 5 failures for 15 min)
userSchema.methods.recordFailedLogin = async function () {
    this.failedLoginAttempts += 1;
    if (this.failedLoginAttempts >= 5) {
        this.lockedUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
    }
    await this.save();
};

// Record a successful login (resets failure count)
userSchema.methods.recordSuccessfulLogin = async function () {
    this.failedLoginAttempts = 0;
    this.lockedUntil = null;
    this.lastLogin = new Date();
    this.loginCount += 1;
    await this.save();
};

// Return a safe object (no passwordHash) for API responses
userSchema.methods.toSafeObject = function () {
    const obj = this.toObject();
    delete obj.passwordHash;
    delete obj.failedLoginAttempts;
    delete obj.lockedUntil;
    delete obj.__v;
    return obj;
};

// Return the minimal object for JWT payload
userSchema.methods.toTokenPayload = function () {
    return {
        id: this._id.toString(),
        username: this.username,
        dealerCode: this.dealerCode,
        role: this.role,
        displayName: this.displayName
    };
};

// -------------------------------------------------------
// STATIC METHODS
// -------------------------------------------------------

// Find an active user by credentials (used by login route)
userSchema.statics.findByCredentials = async function (dealerCode, username) {
    return this.findOne({
        dealerCode: dealerCode.toUpperCase(),
        username: username.toLowerCase()
    });
};

// Count active users for a dealer (used to enforce limits if needed)
userSchema.statics.countDealerUsers = async function (dealerCode) {
    return this.countDocuments({
        dealerCode: dealerCode.toUpperCase(),
        status: { $ne: 'disabled' }
    });
};

// -------------------------------------------------------
// STATICS FOR EXTERNAL USE
// -------------------------------------------------------
userSchema.statics.VALID_ROLES = VALID_ROLES;
userSchema.statics.VALID_STATUSES = VALID_STATUSES;

module.exports = mongoose.model('User', userSchema);
