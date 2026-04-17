const mongoose = require('mongoose');

const SaleSchema = new mongoose.Schema(
  {
    transactionId: { type: String, required: true, unique: true },
    gateway: { type: String, enum: ['stripe', 'paypal', 'unknown'], default: 'unknown' },
    productId: { type: String, required: true },
    productName: { type: String, default: '' },
    quantity: { type: Number, default: 1 },
    amount: { type: Number, default: 0 },
    currency: { type: String, default: 'USD' },
    soldAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Sale', SaleSchema);

