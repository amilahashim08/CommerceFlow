const express = require('express');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const Product = require('../models/Product');
const Sale = require('../models/Sale');

const router = express.Router();

const SALES_FILE_PATH = path.join(__dirname, '..', 'data', 'sales.json');

const ensureDataDir = () => {
  const dir = path.dirname(SALES_FILE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

const readSalesFile = () => {
  try {
    if (!fs.existsSync(SALES_FILE_PATH)) return [];
    const raw = fs.readFileSync(SALES_FILE_PATH, 'utf8');
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
};

const writeSalesFile = (items) => {
  ensureDataDir();
  fs.writeFileSync(SALES_FILE_PATH, JSON.stringify(items, null, 2), 'utf8');
};

const toDateKey = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const normalizeCurrency = (currency) => String(currency || 'USD').toUpperCase();

router.post('/record-sale', async (req, res) => {
  const {
    transactionId,
    gateway = 'unknown',
    productId,
    productName = '',
    quantity = 1,
    amount = 0,
    currency = 'USD',
    soldAt,
  } = req.body || {};

  if (!transactionId || !productId) {
    return res.status(400).json({ success: false, message: 'transactionId and productId are required.' });
  }

  const salePayload = {
    transactionId: String(transactionId),
    gateway: ['stripe', 'paypal'].includes(String(gateway)) ? String(gateway) : 'unknown',
    productId: String(productId),
    productName: String(productName || ''),
    quantity: Math.max(1, Number(quantity) || 1),
    amount: Number(amount) || 0,
    currency: normalizeCurrency(currency),
    soldAt: soldAt ? new Date(soldAt) : new Date(),
  };

  try {
    if (mongoose.connection.readyState === 1) {
      // De-dupe by unique transactionId.
      const existing = await Sale.findOne({ transactionId: salePayload.transactionId });
      if (existing) {
        return res.json({ success: true, deduped: true });
      }

      await Sale.create(salePayload);

      // Best-effort update product counters if it exists in MongoDB.
      if (mongoose.Types.ObjectId.isValid(salePayload.productId)) {
        await Product.findByIdAndUpdate(salePayload.productId, {
          $inc: { soldCount: salePayload.quantity },
          $set: { lastSoldAt: salePayload.soldAt },
        });
      }

      return res.json({ success: true, stored: 'mongo' });
    }

    // File-store fallback (works even without MongoDB).
    const stored = readSalesFile();
    if (stored.some((s) => s.transactionId === salePayload.transactionId)) {
      return res.json({ success: true, deduped: true, stored: 'file' });
    }
    const next = [salePayload, ...stored].slice(0, 2000);
    writeSalesFile(next);
    return res.json({ success: true, stored: 'file' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to record sale.' });
  }
});

router.get('/daily', async (req, res) => {
  const dateKey = String(req.query.date || toDateKey(new Date()));
  const start = new Date(`${dateKey}T00:00:00.000`);
  const end = new Date(`${dateKey}T23:59:59.999`);

  try {
    let sales = [];
    if (mongoose.connection.readyState === 1) {
      sales = await Sale.find({ soldAt: { $gte: start, $lte: end } }).lean();
    } else {
      sales = readSalesFile().filter((s) => {
        const when = new Date(s.soldAt);
        return when >= start && when <= end;
      });
    }

    const totals = {
      date: dateKey,
      salesCount: sales.length,
      unitsSold: 0,
      revenue: 0,
      currency: 'USD',
    };

    const byProduct = new Map();
    for (const sale of sales) {
      const qty = Math.max(1, Number(sale.quantity) || 1);
      const amt = Number(sale.amount) || 0;
      totals.unitsSold += qty;
      totals.revenue += amt;
      totals.currency = normalizeCurrency(sale.currency || totals.currency);

      const key = String(sale.productId);
      const existing = byProduct.get(key) || {
        productId: key,
        productName: String(sale.productName || ''),
        unitsSold: 0,
        revenue: 0,
      };
      existing.unitsSold += qty;
      existing.revenue += amt;
      if (!existing.productName && sale.productName) existing.productName = String(sale.productName);
      byProduct.set(key, existing);
    }

    const topProducts = Array.from(byProduct.values())
      .sort((a, b) => b.unitsSold - a.unitsSold)
      .slice(0, 5);

    return res.json({
      success: true,
      totals: {
        ...totals,
        revenue: Number(totals.revenue.toFixed(2)),
      },
      topProducts: topProducts.map((p) => ({
        ...p,
        revenue: Number(p.revenue.toFixed(2)),
      })),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to load analytics.' });
  }
});

/** Daily series + top products for charts (last N days). */
router.get('/charts', async (req, res) => {
  const days = Math.min(30, Math.max(1, parseInt(String(req.query.days || '7'), 10) || 7));
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  start.setHours(0, 0, 0, 0);

  try {
    let allSales = [];
    if (mongoose.connection.readyState === 1) {
      allSales = await Sale.find({ soldAt: { $gte: start, $lte: end } }).lean();
    } else {
      allSales = readSalesFile().filter((s) => {
        const when = new Date(s.soldAt);
        return when >= start && when <= end;
      });
    }

    const series = [];
    for (let i = 0; i < days; i += 1) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const key = toDateKey(d);
      const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      series.push({
        date: key,
        label,
        revenue: 0,
        unitsSold: 0,
        salesCount: 0,
      });
    }
    const dayIndex = new Map(series.map((row, idx) => [row.date, idx]));

    const byProduct = new Map();
    let currency = 'USD';

    for (const sale of allSales) {
      const key = toDateKey(new Date(sale.soldAt));
      const idx = dayIndex.get(key);
      if (idx === undefined) continue;

      const qty = Math.max(1, Number(sale.quantity) || 1);
      const amt = Number(sale.amount) || 0;
      currency = normalizeCurrency(sale.currency || currency);

      const row = series[idx];
      row.revenue += amt;
      row.unitsSold += qty;
      row.salesCount += 1;

      const pid = String(sale.productId);
      const cur = byProduct.get(pid) || {
        productId: pid,
        productName: String(sale.productName || pid),
        unitsSold: 0,
        revenue: 0,
      };
      cur.unitsSold += qty;
      cur.revenue += amt;
      if (sale.productName) cur.productName = String(sale.productName);
      byProduct.set(pid, cur);
    }

    const topProducts = Array.from(byProduct.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8)
      .map((p) => ({
        ...p,
        revenue: Number(p.revenue.toFixed(2)),
        name: p.productName.length > 28 ? `${p.productName.slice(0, 28)}…` : p.productName,
      }));

    const seriesNormalized = series.map((row) => ({
      ...row,
      revenue: Number(row.revenue.toFixed(2)),
    }));

    const totalRevenue = seriesNormalized.reduce((sum, row) => sum + row.revenue, 0);
    const totalOrders = seriesNormalized.reduce((sum, row) => sum + row.salesCount, 0);
    const totalUnits = seriesNormalized.reduce((sum, row) => sum + row.unitsSold, 0);
    const avgOrderValue = totalOrders > 0 ? Number((totalRevenue / totalOrders).toFixed(2)) : 0;

    let productLeaderboard = [];
    if (mongoose.connection.readyState === 1) {
      const prods = await Product.find({ soldCount: { $gt: 0 } })
        .sort({ soldCount: -1 })
        .limit(8)
        .select('name soldCount')
        .lean();
      productLeaderboard = prods.map((p) => ({
        productId: String(p._id),
        name: p.name.length > 28 ? `${p.name.slice(0, 28)}…` : p.name,
        unitsSold: p.soldCount,
      }));
    }

    return res.json({
      success: true,
      days,
      currency,
      series: seriesNormalized,
      topProducts,
      productLeaderboard,
      summary: {
        totalRevenue: Number(totalRevenue.toFixed(2)),
        totalOrders,
        totalUnits,
        avgOrderValue,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to load chart data.' });
  }
});

module.exports = router;

