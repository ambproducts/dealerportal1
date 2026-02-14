# AmeriDex Dealer Portal

Backend server for the AmeriDex Dealer Portal, built with Node.js and Express.

## Project Structure

```
server.js                   # Entry point, mounts all routes
lib/
  helpers.js                # Utilities (generateId, readJSON, writeJSON)
  password.js               # Salted password hashing
  token.js                  # Custom HMAC token generation/verification
  data-init.js              # Database initialization and migration
  backup.js                 # Automated backup system
middleware/
  auth.js                   # Authentication middleware
routes/
  auth.js                   # Login, logout, /me, change-password
  users.js                  # User CRUD, approvals, role management
  products.js               # Product catalog with pricing tiers
  quotes.js                 # Quote CRUD, submit, duplicate
  dealers.js                # Dealer self-profile
  customers.js              # Customer database (dealer-scoped)
  admin-dealers.js          # Admin dealer management
  admin-quotes.js           # Admin quote management + CSV export
  admin-pricing.js          # Pricing tier management
  admin-customers.js        # Admin customer management
  master.js                 # Master database backup/export/import
public/
  dealer-portal.html        # Single-page app frontend
```

## Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Copy `.env.example` to `.env` and configure:
   ```
   cp .env.example .env
   ```

3. Generate secure secrets:
   ```
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

4. Start the server:
   ```
   npm start
   ```

5. For development with auto-reload:
   ```
   npm run dev
   ```

## Default Admin Account

On first run, a default admin account is created:

- **Dealer Code**: PAT123
- **Username**: admin
- **Password**: ameridex2026

**Change this password immediately after first login.**

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | 3000 | Server port |
| `TOKEN_SECRET` | **Yes (production)** | dev fallback | Secret for signing auth tokens |
| `DATA_DIR` | No | `./data` | Directory for JSON data files |
| `MASTER_KEY` | **Yes (for backups)** | none | Secret for `/api/master/*` endpoints |

## Authentication

The system uses a custom HMAC-based token system with salted SHA-256 password hashing.

### Login Flow

1. Client POSTs to `/api/auth/login` with:
   ```json
   {
     "dealerCode": "PAT123",
     "username": "admin",
     "password": "ameridex2026"
   }
   ```

2. Server returns:
   ```json
   {
     "token": "...",
     "user": { ... },
     "dealer": { ... }
   }
   ```

3. Client includes token in all subsequent requests:
   ```
   Authorization: Bearer <token>
   ```

## User Roles

- **admin**: Full system access, can manage all dealers/users/quotes
- **gm** (General Manager): Can create front desk users, view own dealer data
- **frontdesk**: Basic access to quote creation and customer management

## Backup System

Automated backups run on schedule:
- **Hourly**: Keep 24
- **Daily**: Keep 30
- **Weekly**: Keep 12

Backups are stored in `./data/backups/` with SHA-256 integrity checks.

### Manual Backup/Restore

With MASTER_KEY set, use the `/api/master/*` endpoints:

```bash
# Export full database
curl -H "x-master-key: YOUR_MASTER_KEY" \
  http://localhost:3000/api/master/export?download=true \
  > backup.json

# Check status
curl -H "x-master-key: YOUR_MASTER_KEY" \
  http://localhost:3000/api/master/status

# Restore from backup
curl -X POST -H "x-master-key: YOUR_MASTER_KEY" \
  -H "Content-Type: application/json" \
  -d @backup.json \
  http://localhost:3000/api/master/import
```

## Data Files

All data is stored as JSON files in `./data/`:

- `dealers.json` - Dealer organizations
- `users.json` - Individual user accounts
- `quotes.json` - All quotes
- `customers.json` - Customer database
- `pricing-tiers.json` - Pricing tier definitions

## License

Proprietary - AmeriDex
