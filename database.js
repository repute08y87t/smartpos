const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'data', 'pos.db');
const initSql = fs.readFileSync(path.join(__dirname, 'data', 'init.sql'), 'utf8');

console.log('Database path:', dbPath);

const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    db.exec(initSql, function(err) {
        if (err) {
            console.error('Database init error:', err.message);
        } else {
            console.log('✅ Database ready');
            // Verify products exist
            db.all('SELECT * FROM products', (err, rows) => {
                if (err) {
                    console.error('Error loading products:', err.message);
                } else {
                    console.log('Products loaded:', rows.length);
                }
            });
        }
    });
});

module.exports = db;