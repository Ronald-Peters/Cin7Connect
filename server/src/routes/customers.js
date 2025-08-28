const express = require('express');
const pool = require('../db');
const { authenticateToken } = require('./auth');

const router = express.Router();

// Get current customer profile
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const customerId = req.user.customer_id;

    const query = `
      SELECT 
        id,
        erp_customer_id,
        company_name,
        terms,
        price_tier,
        default_address,
        billing_address,
        shipping_address,
        contacts,
        updated_at
      FROM customers
      WHERE id = $1
    `;

    const result = await pool.query(query, [customerId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const customer = result.rows[0];
    
    // Parse contacts JSON
    if (customer.contacts) {
      try {
        customer.contacts = JSON.parse(customer.contacts);
      } catch (e) {
        customer.contacts = [];
      }
    }

    res.json(customer);
  } catch (error) {
    console.error('Error fetching customer profile:', error);
    res.status(500).json({ error: 'Failed to fetch customer profile' });
  }
});

module.exports = router;