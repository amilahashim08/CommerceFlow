const express = require('express');
const mongoose = require('mongoose');
const Product = require('../models/Product');

const router = express.Router();

const seedProducts = [
  {
    id: 'p-101',
    name: 'Scandinavian Sofa',
    category: 'Living Room',
    description: '3-seater premium fabric sofa with walnut legs.',
    price: 899.0,
    image:
      'https://images.pexels.com/photos/1866149/pexels-photo-1866149.jpeg?auto=compress&cs=tinysrgb&w=900',
    gallery: [
      'https://images.pexels.com/photos/1866149/pexels-photo-1866149.jpeg?auto=compress&cs=tinysrgb&w=900',
      'https://placehold.co/900x600/1e293b/e2e8f0?text=Sofa+Dimensions+84x35x34+in',
    ],
  },
  {
    id: 'p-102',
    name: 'Oak Coffee Table',
    category: 'Living Room',
    description: 'Solid oak coffee table with lower storage shelf.',
    price: 249.0,
    image:
      'https://images.pexels.com/photos/276583/pexels-photo-276583.jpeg?auto=compress&cs=tinysrgb&w=900',
    gallery: [
      'https://images.pexels.com/photos/276583/pexels-photo-276583.jpeg?auto=compress&cs=tinysrgb&w=900',
      'https://placehold.co/900x600/1e293b/e2e8f0?text=Coffee+Table+Dimensions+42x24x18+in',
    ],
  },
  {
    id: 'p-103',
    name: 'Queen Bed Frame',
    category: 'Bedroom',
    description: 'Upholstered queen bed frame with padded headboard.',
    price: 699.0,
    image:
      'https://images.pexels.com/photos/164595/pexels-photo-164595.jpeg?auto=compress&cs=tinysrgb&w=900',
    gallery: [
      'https://images.pexels.com/photos/164595/pexels-photo-164595.jpeg?auto=compress&cs=tinysrgb&w=900',
      'https://placehold.co/900x600/1e293b/e2e8f0?text=Bed+Frame+Dimensions+80x60+in',
    ],
  },
  {
    id: 'p-104',
    name: 'Bedside Table Set',
    category: 'Bedroom',
    description: 'Set of 2 minimalist bedside tables with drawers.',
    price: 189.0,
    image:
      'https://images.pexels.com/photos/3935330/pexels-photo-3935330.jpeg?auto=compress&cs=tinysrgb&w=900',
  },
  {
    id: 'p-105',
    name: 'Ergo Office Chair',
    category: 'Office',
    description: 'Adjustable ergonomic office chair with lumbar support.',
    price: 329.0,
    image:
      'https://images.pexels.com/photos/1957477/pexels-photo-1957477.jpeg?auto=compress&cs=tinysrgb&w=900',
  },
  {
    id: 'p-106',
    name: 'Executive Work Desk',
    category: 'Office',
    description: 'Spacious desk with cable management and metal frame.',
    price: 459.0,
    image:
      'https://images.pexels.com/photos/667838/pexels-photo-667838.jpeg?auto=compress&cs=tinysrgb&w=900',
  },
  {
    id: 'p-107',
    name: 'Patio Lounge Set',
    category: 'Outdoor',
    description: 'Weather-resistant outdoor sofa and table combo.',
    price: 999.0,
    image:
      'https://images.pexels.com/photos/1260727/pexels-photo-1260727.jpeg?auto=compress&cs=tinysrgb&w=900',
  },
  {
    id: 'p-108',
    name: 'Accent Floor Lamp',
    category: 'Decor',
    description: 'Modern floor lamp with warm ambient lighting.',
    price: 119.0,
    image:
      'https://images.pexels.com/photos/112811/pexels-photo-112811.jpeg?auto=compress&cs=tinysrgb&w=900',
  },
  {
    id: 'p-109',
    name: 'Dining Table Set',
    category: 'Dining',
    description: '6-seat dining set with natural wood finish.',
    price: 1099.0,
    image:
      'https://images.pexels.com/photos/1080721/pexels-photo-1080721.jpeg?auto=compress&cs=tinysrgb&w=900',
  },
  {
    id: 'p-110',
    name: 'Velvet Accent Chair',
    category: 'Living Room',
    description: 'Single accent lounge chair with soft velvet upholstery.',
    price: 279.0,
    image:
      'https://images.pexels.com/photos/1571460/pexels-photo-1571460.jpeg?auto=compress&cs=tinysrgb&w=900',
  },
  {
    id: 'p-111',
    name: 'Entryway Console',
    category: 'Decor',
    description: 'Slim console table ideal for hallway styling.',
    price: 199.0,
    image:
      'https://images.pexels.com/photos/2082090/pexels-photo-2082090.jpeg?auto=compress&cs=tinysrgb&w=900',
  },
  {
    id: 'p-112',
    name: 'Bookshelf Cabinet',
    category: 'Office',
    description: 'Open shelf cabinet for books and decor display.',
    price: 349.0,
    image:
      'https://images.pexels.com/photos/256541/pexels-photo-256541.jpeg?auto=compress&cs=tinysrgb&w=900',
  },
];

const mapDbProduct = (product) => ({
  id: String(product._id),
  name: product.name,
  category: product.category,
  description: product.description,
  price: product.price,
  image: product.image,
  gallery: Array.isArray(product.gallery) ? product.gallery : [],
  source: product.source || 'custom',
});

router.get('/', async (req, res) => {
  try {
    let dbProducts = [];
    if (mongoose.connection.readyState === 1) {
      const savedProducts = await Product.find({}).sort({ createdAt: -1 });
      dbProducts = savedProducts.map(mapDbProduct);
    }

    res.json({
      products: [...dbProducts, ...seedProducts],
    });
  } catch (error) {
    res.status(500).json({
      message: error.message || 'Failed to load products.',
    });
  }
});

router.post('/', async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      message: 'Database is not connected. Start MongoDB to save custom products.',
    });
  }

  const { name, category, description, price, image, gallery } = req.body;

  if (!name || !category || !price || Number(price) <= 0) {
    return res.status(400).json({
      message: 'name, category and valid price are required.',
    });
  }

  try {
    const createdProduct = await Product.create({
      name: String(name).trim(),
      category: String(category).trim(),
      description: description ? String(description).trim() : 'Custom furniture product.',
      price: Number(price),
      image: image ? String(image).trim() : '',
      gallery: Array.isArray(gallery) ? gallery.filter(Boolean).map((item) => String(item).trim()) : [],
      source: 'custom',
    });

    return res.status(201).json({
      product: mapDbProduct(createdProduct),
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message || 'Failed to create product.',
    });
  }
});

module.exports = router;
