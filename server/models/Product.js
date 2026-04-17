const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema({
  name: { type: String, required: true },
  category: { type: String, required: true, default: 'Custom' },
  price: { type: Number, required: true },
  description: { type: String },
  image: { type: String, default: '' },
  gallery: [{ type: String }],
  source: { type: String, enum: ['seed', 'custom'], default: 'custom' },
  soldCount: { type: Number, default: 0 },
  lastSoldAt: { type: Date, default: null },
},
{
  timestamps: true,
});

module.exports = mongoose.model('Product', ProductSchema);
