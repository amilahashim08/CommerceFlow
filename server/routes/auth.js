const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const User = require('../models/User');
const { authRequired, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || '7d';

const requireDb = (req, res, next) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      success: false,
      message: 'Database is not connected. User accounts require MongoDB.',
    });
  }
  next();
};

const signToken = (user) =>
  jwt.sign(
    { sub: String(user._id), email: user.email },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );

const userResponse = (userDoc) => ({
  id: String(userDoc._id),
  name: userDoc.name,
  email: userDoc.email,
  createdAt: userDoc.createdAt,
});

router.post('/register', requireDb, async (req, res) => {
  const { name, email, password } = req.body || {};

  if (!email || !password || String(password).length < 6) {
    return res.status(400).json({
      success: false,
      message: 'Email and password (min 6 characters) are required.',
    });
  }

  try {
    const existing = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email is already registered.' });
    }

    const hashed = await bcrypt.hash(String(password), 10);
    const user = await User.create({
      name: String(name || 'Customer').trim() || 'Customer',
      email: String(email).toLowerCase().trim(),
      password: hashed,
    });

    const token = signToken(user);
    return res.status(201).json({
      success: true,
      token,
      user: userResponse(user),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Registration failed.' });
  }
});

router.post('/login', requireDb, async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required.' });
  }

  try {
    const user = await User.findOne({ email: String(email).toLowerCase().trim() }).select('+password');
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const ok = await bcrypt.compare(String(password), user.password);
    if (!ok) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const token = signToken(user);
    return res.json({
      success: true,
      token,
      user: userResponse(user),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Login failed.' });
  }
});

router.post('/logout', authRequired, (req, res) => {
  res.json({ success: true, message: 'Logged out. Remove the token on the client.' });
});

router.get('/me', authRequired, requireDb, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    return res.json({ success: true, user: userResponse(user) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to load profile.' });
  }
});

router.patch('/settings', authRequired, requireDb, async (req, res) => {
  const { name, currentPassword, newPassword } = req.body || {};

  try {
    const user = await User.findById(req.userId).select('+password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    if (name !== undefined) {
      user.name = String(name).trim() || user.name;
    }

    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({
          success: false,
          message: 'Current password is required to set a new password.',
        });
      }
      const ok = await bcrypt.compare(String(currentPassword), user.password);
      if (!ok) {
        return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
      }
      if (String(newPassword).length < 6) {
        return res.status(400).json({ success: false, message: 'New password must be at least 6 characters.' });
      }
      user.password = await bcrypt.hash(String(newPassword), 10);
    }

    await user.save();
    return res.json({ success: true, user: userResponse(user) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to update settings.' });
  }
});

module.exports = router;
