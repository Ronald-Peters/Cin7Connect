const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const pool = require('../db');

const router = express.Router();

// Mock login endpoint
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // For now, mock authentication - replace with real auth later
    // In production, you'd verify credentials against the users table
    const mockUser = {
      id: 1,
      email: email,
      customer_id: 1,
      role: 'buyer'
    };

    // Get customer details including price tier
    const customerQuery = `
      SELECT id, company_name, price_tier, terms 
      FROM customers 
      WHERE id = $1
    `;
    
    let customer;
    try {
      const customerResult = await pool.query(customerQuery, [mockUser.customer_id]);
      customer = customerResult.rows[0] || {
        id: 1,
        company_name: 'Demo Company',
        price_tier: process.env.DEFAULT_PRICE_TIER || 'Wholesale',
        terms: 'Net 30'
      };
    } catch (dbError) {
      console.warn('Customer lookup failed, using defaults:', dbError.message);
      customer = {
        id: 1,
        company_name: 'Demo Company',
        price_tier: process.env.DEFAULT_PRICE_TIER || 'Wholesale',
        terms: 'Net 30'
      };
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        user_id: mockUser.id,
        email: mockUser.email,
        customer_id: customer.id,
        price_tier: customer.price_tier,
        role: mockUser.role
      },
      process.env.JWT_SECRET || 'fallback-secret-change-in-production',
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: mockUser.id,
        email: mockUser.email,
        role: mockUser.role,
        customer: {
          id: customer.id,
          company_name: customer.company_name,
          price_tier: customer.price_tier,
          terms: customer.terms
        }
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-change-in-production', (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

module.exports = { router, authenticateToken };