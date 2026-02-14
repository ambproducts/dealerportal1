const express = require('express');
const path = require('path');
const { ensureDataFiles } = require('./lib/data-init');
const { startBackupSchedule } = require('./lib/backup');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

ensureDataFiles();
startBackupSchedule();

app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/products', require('./routes/products'));
app.use('/api/quotes', require('./routes/quotes'));
app.use('/api/dealer', require('./routes/dealers'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/admin/dealers', require('./routes/admin-dealers'));
app.use('/api/admin/quotes', require('./routes/admin-quotes'));
app.use('/api/admin/pricing-tiers', require('./routes/admin-pricing'));
app.use('/api/admin/customers', require('./routes/admin-customers'));
app.use('/api/admin/products', require('./routes/admin-products'));
app.use('/api/master', require('./routes/master'));

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dealer-portal.html'));
});

app.listen(PORT, () => {
    console.log('');
    console.log('==============================================');
    console.log('  AmeriDex Dealer Portal Server v2.0');
    console.log('  Running on http://localhost:' + PORT);
    console.log('  Data stored in ./data/');
    console.log('  User accounts: ./data/users.json');
    console.log('==============================================');
    console.log('');
});
