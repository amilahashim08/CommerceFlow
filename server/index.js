// Entry point for the backend server
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const stripeRoutes = require('./routes/stripe');
const paypalRoutes = require('./routes/paypal');
const productRoutes = require('./routes/products');
const analyticsRoutes = require('./routes/analytics');
const authRoutes = require('./routes/auth');
const connectDB = require('./config/db');

const app = express();
app.use(cors());
// Accept larger JSON payloads (e.g., base64 images for manual products).
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

connectDB();

app.use('/api/stripe', stripeRoutes);
app.use('/api/paypal', paypalRoutes);
app.use('/api/products', productRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/auth', authRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
