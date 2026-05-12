const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Local SQLite database connection
const db = new sqlite3.Database(path.join(__dirname, 'data', 'pos.db'));

// Helper function to run SQL queries with promises
function runQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) {
                console.error('Query error:', err.message);
                reject(err);
            } else {
                resolve({ rows: rows });
            }
        });
    });
}

function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) {
                console.error('Run error:', err.message);
                reject(err);
            } else {
                resolve({ lastID: this.lastID, changes: this.changes });
            }
        });
    });
}

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'SmartPOS running on local database' });
});

app.get('/api/products', async (req, res) => {
    try {
        const result = await runQuery('SELECT * FROM products ORDER BY category, subcategory, brand, name');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/products', async (req, res) => {
    const { name, price, cost_price, stock, sku, category, subcategory, brand, pack_size, pack_cost } = req.body;
    try {
        const result = await run(
            'INSERT INTO products (name, price, cost_price, stock, sku, category, subcategory, brand, pack_size, pack_cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [name, price, cost_price || 0, stock || 0, sku || null, category || 'General', subcategory || '', brand || '', pack_size || 1, pack_cost || 0]
        );
        res.json({ id: result.lastID, message: 'Product added' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/products/:id', async (req, res) => {
    const { name, price, cost_price, stock, sku, category, subcategory, brand, pack_size, pack_cost } = req.body;
    try {
        await run(
            'UPDATE products SET name = ?, price = ?, cost_price = ?, stock = ?, sku = ?, category = ?, subcategory = ?, brand = ?, pack_size = ?, pack_cost = ? WHERE id = ?',
            [name, price, cost_price || 0, stock, sku || null, category || 'General', subcategory || '', brand || '', pack_size || 1, pack_cost || 0, req.params.id]
        );
        res.json({ message: 'Product updated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/products/:id', async (req, res) => {
    try {
        await run('DELETE FROM products WHERE id = ?', [req.params.id]);
        res.json({ message: 'Product deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/categories', async (req, res) => {
    try {
        const result = await runQuery('SELECT id, name FROM categories ORDER BY name');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/categories', async (req, res) => {
    const { name } = req.body;
    try {
        await run('INSERT OR IGNORE INTO categories (name) VALUES (?)', [name]);
        res.json({ success: true, message: 'Category added' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/categories/edit', async (req, res) => {
    const { old_name, new_name } = req.body;
    try {
        await run('UPDATE categories SET name = ? WHERE name = ?', [new_name, old_name]);
        await run('UPDATE products SET category = ? WHERE category = ?', [new_name, old_name]);
        res.json({ success: true, message: 'Category updated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/categories/delete', async (req, res) => {
    const { category } = req.body;
    try {
        await run('DELETE FROM categories WHERE name = ?', [category]);
        await run('UPDATE products SET category = "General" WHERE category = ?', [category]);
        res.json({ success: true, message: 'Category deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/subcategories', async (req, res) => {
    const category = req.query.category;
    try {
        if (category) {
            const result = await runQuery(
                `SELECT s.id, s.name FROM subcategories s JOIN categories c ON s.category_id = c.id WHERE c.name = ? ORDER BY s.name`,
                [category]
            );
            res.json(result.rows.map(r => r.name));
        } else {
            const result = await runQuery('SELECT name FROM subcategories ORDER BY name');
            res.json(result.rows.map(r => r.name));
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/subcategories', async (req, res) => {
    const { name, category } = req.body;
    try {
        const catResult = await runQuery('SELECT id FROM categories WHERE name = ?', [category]);
        if (catResult.rows.length === 0) {
            res.status(500).json({ error: 'Category not found' });
        } else {
            const catId = catResult.rows[0].id;
            await run('INSERT OR IGNORE INTO subcategories (category_id, name) VALUES (?, ?)', [catId, name]);
            res.json({ success: true, message: 'Subcategory added' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/subcategories/edit', async (req, res) => {
    const { category, old_name, new_name } = req.body;
    try {
        const catResult = await runQuery('SELECT id FROM categories WHERE name = ?', [category]);
        if (catResult.rows.length === 0) {
            res.status(500).json({ error: 'Category not found' });
        } else {
            const catId = catResult.rows[0].id;
            await run('UPDATE subcategories SET name = ? WHERE category_id = ? AND name = ?', [new_name, catId, old_name]);
            await run('UPDATE products SET subcategory = ? WHERE category = ? AND subcategory = ?', [new_name, category, old_name]);
            res.json({ success: true, message: 'Subcategory updated' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/subcategories/delete', async (req, res) => {
    const { category, subcategory } = req.body;
    try {
        const catResult = await runQuery('SELECT id FROM categories WHERE name = ?', [category]);
        if (catResult.rows.length === 0) {
            res.status(500).json({ error: 'Category not found' });
        } else {
            const catId = catResult.rows[0].id;
            await run('DELETE FROM subcategories WHERE category_id = ? AND name = ?', [catId, subcategory]);
            await run('UPDATE products SET subcategory = "" WHERE category = ? AND subcategory = ?', [category, subcategory]);
            res.json({ success: true, message: 'Subcategory deleted' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/brands', async (req, res) => {
    const { category, subcategory } = req.query;
    let query = `SELECT b.name FROM brands b
                 JOIN categories c ON b.category_id = c.id
                 LEFT JOIN subcategories s ON b.subcategory_id = s.id
                 WHERE 1=1`;
    let params = [];
    if (category) {
        query += ' AND c.name = ?';
        params.push(category);
    }
    if (subcategory && subcategory !== '') {
        query += ' AND s.name = ?';
        params.push(subcategory);
    }
    query += ' ORDER BY b.name';
    try {
        const result = await runQuery(query, params);
        res.json(result.rows.map(r => r.name));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/brands', async (req, res) => {
    const { name, category, subcategory } = req.body;
    try {
        const catResult = await runQuery('SELECT id FROM categories WHERE name = ?', [category]);
        if (catResult.rows.length === 0) {
            res.status(500).json({ error: 'Category not found' });
            return;
        }
        const catId = catResult.rows[0].id;
        let subcatId = null;
        if (subcategory && subcategory !== '') {
            const subResult = await runQuery('SELECT id FROM subcategories WHERE category_id = ? AND name = ?', [catId, subcategory]);
            if (subResult.rows.length) {
                subcatId = subResult.rows[0].id;
            }
        }
        await run('INSERT OR IGNORE INTO brands (category_id, subcategory_id, name) VALUES (?, ?, ?)', [catId, subcatId, name]);
        res.json({ success: true, message: 'Brand added' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/sales/complete', async (req, res) => {
    const { items, subtotal, total, amount_paid, method, payment_timestamp, splitMpesa, splitCash, cash_refund } = req.body;
    if (!items || items.length === 0) {
        return res.status(400).json({ error: 'Cart is empty' });
    }
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const receipt_no = `INV-${dateStr}-${Math.floor(Math.random() * 10000)}`;
    const finalTimestamp = payment_timestamp || now.toISOString();

    if (method === 'split' && splitMpesa > 0 && splitCash >= 0) {
        try {
            await run(`INSERT INTO sales (receipt_no, subtotal, total, status, payment_timestamp, method) VALUES (?, ?, ?, 'completed', ?, 'split')`, [receipt_no, total, total, finalTimestamp]);
            await run(`INSERT INTO sales (receipt_no, subtotal, total, status, payment_timestamp, method, parent_receipt) VALUES (?, ?, ?, 'completed', ?, 'mpesa', ?)`, [receipt_no + '-MPESA', splitMpesa, splitMpesa, finalTimestamp, receipt_no]);
            await run(`INSERT INTO sales (receipt_no, subtotal, total, status, payment_timestamp, method, parent_receipt) VALUES (?, ?, ?, 'completed', ?, 'cash', ?)`, [receipt_no + '-CASH', splitCash, splitCash, finalTimestamp, receipt_no]);
            for (const item of items) {
                await run('UPDATE products SET stock = stock - ? WHERE id = ?', [item.qty, item.id]);
            }
            const shiftResult = await runQuery('SELECT id FROM shifts WHERE is_active = 1 ORDER BY id DESC LIMIT 1');
            if (shiftResult.rows.length) {
                await run('UPDATE shifts SET cash_sales = cash_sales + ? WHERE id = ?', [splitCash, shiftResult.rows[0].id]);
                await run('UPDATE shifts SET mpesa_sales = mpesa_sales + ? WHERE id = ?', [splitMpesa, shiftResult.rows[0].id]);
            }
            res.json({ success: true, receipt_no: receipt_no, message: 'Split payment recorded' });
        } catch (err) {
            console.error('Error:', err);
            res.status(500).json({ error: err.message });
        }
        return;
    }

    try {
        await run(`INSERT INTO sales (receipt_no, subtotal, total, status, payment_timestamp, method) VALUES (?, ?, ?, 'completed', ?, ?)`, [receipt_no, subtotal, subtotal, finalTimestamp, method]);
        const saleResult = await runQuery('SELECT last_insert_rowid() as id');
        const saleId = saleResult.rows[0].id;
        for (const item of items) {
            const productResult = await runQuery('SELECT cost_price FROM products WHERE id = ?', [item.id]);
            const costPrice = productResult.rows.length ? productResult.rows[0].cost_price : 0;
            await run(`INSERT INTO sale_items (sale_id, product_id, qty, unit_price, total_price, cost_price) VALUES (?, ?, ?, ?, ?, ?)`, [saleId, item.id, item.qty, item.price, item.total, costPrice]);
            await run('UPDATE products SET stock = stock - ? WHERE id = ?', [item.qty, item.id]);
        }
        const shiftResult = await runQuery('SELECT id FROM shifts WHERE is_active = 1 ORDER BY id DESC LIMIT 1');
        if (shiftResult.rows.length) {
            if (method === 'cash') {
                await run('UPDATE shifts SET cash_sales = cash_sales + ? WHERE id = ?', [subtotal, shiftResult.rows[0].id]);
            } else if (method === 'mpesa') {
                await run('UPDATE shifts SET mpesa_sales = mpesa_sales + ? WHERE id = ?', [subtotal, shiftResult.rows[0].id]);
                if (cash_refund && cash_refund > 0) {
                    await run('UPDATE shifts SET cash_out = cash_out + ? WHERE id = ?', [cash_refund, shiftResult.rows[0].id]);
                    await run('INSERT INTO refunds (sale_id, amount, reason) VALUES (?, ?, ?)', [saleId, cash_refund, 'M-Pesa overpayment cash refund']);
                }
            }
        }
        res.json({ success: true, receipt_no: receipt_no, sale_id: saleId, change: amount_paid - total });
    } catch (err) {
        console.error('Error saving sale:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/cashflow/today', async (req, res) => {
    const today = req.query.date || new Date().toISOString().slice(0, 10);
    try {
        const methodsResult = await runQuery(`SELECT method, SUM(total) as total FROM sales WHERE DATE(payment_timestamp) = ? AND method != 'split' GROUP BY method`, [today]);
        let cashTotal = 0, mpesaTotal = 0;
        for (const m of methodsResult.rows) {
            if (m.method === 'cash') cashTotal = Number(m.total) || 0;
            else if (m.method === 'mpesa') mpesaTotal = Number(m.total) || 0;
        }
        const allSalesResult = await runQuery(`SELECT COUNT(*) as count, SUM(total) as total FROM sales WHERE DATE(payment_timestamp) = ? AND method != 'split'`, [today]);
        const totalSales = allSalesResult.rows[0]?.total ? Number(allSalesResult.rows[0].total) : 0;
        const transactionCount = allSalesResult.rows[0]?.count || 0;
        res.json({ date: today, cash_total: cashTotal, mpesa_total: mpesaTotal, total_sales: totalSales, transaction_count: transactionCount });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/sales/payments', async (req, res) => {
    const { date } = req.query;
    let query = 'SELECT receipt_no, total, method, payment_timestamp, parent_receipt FROM sales';
    let params = [];
    if (date) {
        query += ' WHERE DATE(payment_timestamp) = ?';
        params.push(date);
    }
    query += ' ORDER BY payment_timestamp DESC';
    try {
        const result = await runQuery(query, params);
        const transactions = result.rows.map(r => {
            let displayMethod = r.method;
            let originalReceipt = r.parent_receipt || r.receipt_no;
            let isSplitPart = false;
            if (r.receipt_no.includes('-MPESA')) {
                displayMethod = 'mpesa';
                originalReceipt = r.parent_receipt;
                isSplitPart = true;
            } else if (r.receipt_no.includes('-CASH')) {
                displayMethod = 'cash';
                originalReceipt = r.parent_receipt;
                isSplitPart = true;
            }
            return { receipt_no: r.receipt_no, original_receipt: originalReceipt, total: Number(r.total), method: displayMethod, original_method: r.method, payment_timestamp: r.payment_timestamp, is_split_part: isSplitPart };
        });
        res.json(transactions);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/sale/:receipt_no', async (req, res) => {
    let receipt_no = req.params.receipt_no;
    try {
        if (receipt_no.includes('-MPESA') || receipt_no.includes('-CASH')) {
            const parentResult = await runQuery('SELECT parent_receipt FROM sales WHERE receipt_no = ?', [receipt_no]);
            if (parentResult.rows.length === 0) {
                res.status(404).json({ error: 'Sale not found' });
            } else {
                receipt_no = parentResult.rows[0].parent_receipt;
                getSaleData(receipt_no, res);
            }
        } else {
            getSaleData(receipt_no, res);
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

async function getSaleData(receipt_no, res) {
    try {
        const saleResult = await runQuery('SELECT * FROM sales WHERE receipt_no = ?', [receipt_no]);
        if (saleResult.rows.length === 0) {
            res.status(404).json({ error: 'Sale not found' });
            return;
        }
        const sale = saleResult.rows[0];
        const paymentsResult = await runQuery('SELECT method, total FROM sales WHERE parent_receipt = ?', [receipt_no]);
        const itemsResult = await runQuery('SELECT si.qty, si.unit_price, si.total_price, p.name FROM sale_items si JOIN products p ON si.product_id = p.id WHERE si.sale_id = ?', [sale.id]);
        const refundResult = await runQuery('SELECT SUM(amount) as total_refund FROM refunds WHERE sale_id = ?', [sale.id]);
        const refundAmount = refundResult.rows[0]?.total_refund ? Number(refundResult.rows[0].total_refund) : 0;
        res.json({ receipt_no: sale.receipt_no, total: Number(sale.total), goods_value: Number(sale.subtotal), method: sale.method, payment_timestamp: sale.payment_timestamp, items: itemsResult.rows, split_payments: paymentsResult.rows, refund_amount: refundAmount });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

app.post('/api/auth/cashier', async (req, res) => {
    const { pin } = req.body;
    try {
        const result = await runQuery('SELECT id, username, full_name, role FROM users WHERE role = "cashier" AND pin = ? AND is_active = 1', [pin]);
        if (result.rows.length === 0) {
            res.json({ success: false, error: 'Invalid PIN' });
        } else {
            res.json({ success: true, user: result.rows[0] });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/auth/owner', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await runQuery('SELECT id, username, full_name, role FROM users WHERE role = "owner" AND username = ? AND password = ? AND is_active = 1', [username, password]);
        if (result.rows.length === 0) {
            res.json({ success: false, error: 'Invalid username or password' });
        } else {
            res.json({ success: true, user: result.rows[0] });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/reports/daily', async (req, res) => {
    const today = new Date().toISOString().slice(0, 10);
    try {
        const result = await runQuery('SELECT receipt_no, subtotal, payment_timestamp FROM sales WHERE DATE(payment_timestamp) = ? AND method != "split" ORDER BY id DESC', [today]);
        let total = 0;
        for (const sale of result.rows) total += Number(sale.subtotal);
        const formatted = result.rows.map(s => ({ receipt_no: s.receipt_no, total: Number(s.subtotal), time: s.payment_timestamp ? new Date(s.payment_timestamp).toLocaleTimeString() : '' }));
        res.json({ sales: formatted, total: total, count: result.rows.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/reports/bestsellers', async (req, res) => {
    try {
        const result = await runQuery('SELECT p.name, p.category, p.subcategory, p.brand, SUM(si.qty) as qty, SUM(si.total_price) as revenue FROM sale_items si JOIN products p ON si.product_id = p.id GROUP BY p.id ORDER BY qty DESC LIMIT 10');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/reports/lowstock', async (req, res) => {
    try {
        const result = await runQuery('SELECT id, name, category, subcategory, brand, stock, price FROM products WHERE stock < 10 ORDER BY stock ASC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/reports/profit', async (req, res) => {
    const today = new Date().toISOString().slice(0, 10);
    try {
        const result = await runQuery(`SELECT s.receipt_no, s.payment_timestamp, SUM(si.qty * si.cost_price) as total_cost, SUM(si.total_price) as total_revenue, SUM(si.total_price) - SUM(si.qty * si.cost_price) as profit FROM sales s JOIN sale_items si ON s.id = si.sale_id WHERE s.method != "split" AND DATE(s.payment_timestamp) = ? GROUP BY s.id ORDER BY s.payment_timestamp DESC`, [today]);
        let totalRevenue = 0, totalCost = 0;
        for (const row of result.rows) {
            totalRevenue += Number(row.total_revenue) || 0;
            totalCost += Number(row.total_cost) || 0;
        }
        res.json({ sales: result.rows, total_revenue: totalRevenue, total_cost: totalCost, total_profit: totalRevenue - totalCost });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/reports/profit/weekly', async (req, res) => {
    let weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);
    let weekStartStr = weekStart.toISOString();
    try {
        const result = await runQuery(`SELECT s.receipt_no, s.payment_timestamp, SUM(si.qty * si.cost_price) as total_cost, SUM(si.total_price) as total_revenue, SUM(si.total_price) - SUM(si.qty * si.cost_price) as profit FROM sales s JOIN sale_items si ON s.id = si.sale_id WHERE s.method != "split" AND s.payment_timestamp >= ? GROUP BY s.id ORDER BY s.payment_timestamp DESC`, [weekStartStr]);
        let totalRevenue = 0, totalCost = 0;
        for (const row of result.rows) {
            totalRevenue += Number(row.total_revenue) || 0;
            totalCost += Number(row.total_cost) || 0;
        }
        res.json({ sales: result.rows, total_revenue: totalRevenue, total_cost: totalCost, total_profit: totalRevenue - totalCost });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/reports/profit/monthly', async (req, res) => {
    let now = new Date();
    let monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    let monthStartStr = monthStart.toISOString();
    try {
        const result = await runQuery(`SELECT s.receipt_no, s.payment_timestamp, SUM(si.qty * si.cost_price) as total_cost, SUM(si.total_price) as total_revenue, SUM(si.total_price) - SUM(si.qty * si.cost_price) as profit FROM sales s JOIN sale_items si ON s.id = si.sale_id WHERE s.method != "split" AND s.payment_timestamp >= ? GROUP BY s.id ORDER BY s.payment_timestamp DESC`, [monthStartStr]);
        let totalRevenue = 0, totalCost = 0;
        for (const row of result.rows) {
            totalRevenue += Number(row.total_revenue) || 0;
            totalCost += Number(row.total_cost) || 0;
        }
        res.json({ sales: result.rows, total_revenue: totalRevenue, total_cost: totalCost, total_profit: totalRevenue - totalCost });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/shift/active', async (req, res) => {
    try {
        const result = await runQuery('SELECT * FROM shifts WHERE is_active = 1 ORDER BY id DESC LIMIT 1');
        res.json({ shift: result.rows[0] || null });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/shift/open', async (req, res) => {
    const { opening_cash, opening_mpesa } = req.body;
    try {
        await run(`INSERT INTO shifts (user_id, opened_at, opening_cash, opening_mpesa, cash_sales, mpesa_sales, cash_out, expected_cash, expected_mpesa, is_active) VALUES (1, datetime('now'), ?, ?, 0, 0, 0, ?, ?, 1)`, [opening_cash || 0, opening_mpesa || 0, opening_cash || 0, opening_mpesa || 0]);
        const result = await runQuery('SELECT last_insert_rowid() as id');
        res.json({ success: true, shift_id: Number(result.rows[0].id) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/shift/close', async (req, res) => {
    const { actual_cash, actual_mpesa, notes, total_cash_in, total_cash_out } = req.body;
    try {
        const shiftResult = await runQuery('SELECT * FROM shifts WHERE is_active = 1 ORDER BY id DESC LIMIT 1');
        if (shiftResult.rows.length === 0) {
            return res.status(500).json({ error: 'No active shift' });
        }
        const shift = shiftResult.rows[0];
        const totalCashIn = total_cash_in || 0;
        const totalCashOut = total_cash_out || 0;
        const expected_cash = (shift.opening_cash || 0) + (shift.cash_sales || 0) + totalCashIn - (shift.cash_out || 0) - totalCashOut;
        const expected_mpesa = (shift.opening_mpesa || 0) + (shift.mpesa_sales || 0);
        const cash_variance = actual_cash - expected_cash;
        const mpesa_variance = actual_mpesa - expected_mpesa;
        await run(`UPDATE shifts SET closed_at = datetime('now'), expected_cash = ?, expected_mpesa = ?, actual_cash = ?, actual_mpesa = ?, cash_variance = ?, mpesa_variance = ?, total_cash_in = ?, total_cash_out = ?, notes = ?, is_active = 0 WHERE id = ?`, [expected_cash, expected_mpesa, actual_cash, actual_mpesa, cash_variance, mpesa_variance, totalCashIn, totalCashOut, notes || null, shift.id]);
        res.json({ success: true, cash_variance: cash_variance, mpesa_variance: mpesa_variance, expected_cash: expected_cash, expected_mpesa: expected_mpesa });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/shifts/all', async (req, res) => {
    try {
        const result = await runQuery('SELECT * FROM shifts ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/shifts/by-date', async (req, res) => {
    const { date } = req.query;
    try {
        const result = await runQuery('SELECT * FROM shifts WHERE DATE(opened_at) = ? ORDER BY id DESC', [date]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/shift/details', async (req, res) => {
    const { id } = req.query;
    try {
        const result = await runQuery('SELECT * FROM shifts WHERE id = ?', [id]);
        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Shift not found' });
        } else {
            res.json(result.rows[0]);
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/refunds/by-shift', async (req, res) => {
    try {
        const result = await runQuery('SELECT r.*, s.receipt_no FROM refunds r LEFT JOIN sales s ON r.sale_id = s.id ORDER BY r.timestamp DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/settings', async (req, res) => {
    try {
        const result = await runQuery('SELECT key, value FROM settings');
        let settings = {};
        for (const row of result.rows) {
            settings[row.key] = row.value;
        }
        res.json(settings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/settings', async (req, res) => {
    const settings = req.body;
    try {
        for (const [key, value] of Object.entries(settings)) {
            await run('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime("now"))', [key, String(value)]);
        }
        res.json({ success: true, message: 'Settings saved' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/backup/export', async (req, res) => {
    try {
        const products = await runQuery('SELECT * FROM products');
        const sales = await runQuery('SELECT * FROM sales');
        const saleItems = await runQuery('SELECT * FROM sale_items');
        const users = await runQuery('SELECT * FROM users');
        const shifts = await runQuery('SELECT * FROM shifts');
        const settings = await runQuery('SELECT * FROM settings');
        res.json({ products: products.rows, sales: sales.rows, sale_items: saleItems.rows, users: users.rows, shifts: shifts.rows, settings: settings.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/backup/import', async (req, res) => {
    const data = req.body;
    try {
        await run('DELETE FROM sale_items');
        await run('DELETE FROM sales');
        await run('DELETE FROM products');
        await run('DELETE FROM shifts');
        await run('DELETE FROM settings');
        await run('DELETE FROM users');
        const insert = async (table, rows) => {
            if (!rows) return;
            for (const row of rows) {
                const cols = Object.keys(row);
                const placeholders = cols.map(() => '?').join(',');
                await run(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${placeholders})`, Object.values(row));
            }
        };
        await insert('products', data.products);
        await insert('sales', data.sales);
        await insert('sale_items', data.sale_items);
        await insert('users', data.users);
        await insert('shifts', data.shifts);
        await insert('settings', data.settings);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/clear/sales', async (req, res) => {
    try {
        await run('DELETE FROM sale_items');
        await run('DELETE FROM sales');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log('Server on http://localhost:' + PORT);
    console.log('Mobile access: http://192.168.1.166:' + PORT);
});