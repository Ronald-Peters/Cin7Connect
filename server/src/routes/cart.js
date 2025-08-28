const express = require('express');
const pool = require('../db');
const cin7Service = require('../services/cin7');
const { authenticateToken } = require('./auth');

const router = express.Router();

// In-memory cart storage (replace with DB later)
const carts = new Map();

// Get cart for current user
router.get('/', authenticateToken, (req, res) => {
  try {
    const userId = req.user.user_id;
    const cart = carts.get(userId) || { items: [], location: null };
    res.json(cart);
  } catch (error) {
    console.error('Error fetching cart:', error);
    res.status(500).json({ error: 'Failed to fetch cart' });
  }
});

// Add/update cart
router.post('/', authenticateToken, (req, res) => {
  try {
    const userId = req.user.user_id;
    const { items, location } = req.body;

    const cart = {
      items: items || [],
      location: location || null
    };

    carts.set(userId, cart);
    res.json(cart);
  } catch (error) {
    console.error('Error updating cart:', error);
    res.status(500).json({ error: 'Failed to update cart' });
  }
});

// Checkout - create quote in Cin7
router.post('/checkout', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const customerId = req.user.customer_id;
    const priceTier = req.user.price_tier;

    const cart = carts.get(userId);
    if (!cart || !cart.items || cart.items.length === 0) {
      return res.status(400).json({ error: 'Cart is empty' });
    }

    if (!cart.location) {
      return res.status(400).json({ error: 'Location is required for checkout' });
    }

    // Get customer details
    const customerQuery = `
      SELECT erp_customer_id, company_name 
      FROM customers 
      WHERE id = $1
    `;
    const customerResult = await pool.query(customerQuery, [customerId]);
    
    if (customerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const customer = customerResult.rows[0];

    // Build quote payload for Cin7
    const quotePayload = {
      Customer: customer.erp_customer_id,
      CustomerID: customer.erp_customer_id,
      PriceTier: priceTier,
      Location: cart.location,
      OrderStatus: 'NOTAUTHORISED', // This makes it a quote
      Lines: cart.items.map(item => ({
        SKU: item.sku,
        Quantity: item.quantity,
        Price: item.price || 0, // Price will be calculated by Cin7 based on tier
        TaxRule: item.taxRule || 'Default'
      }))
    };

    // Create quote in Cin7
    const cin7Response = await cin7Service.createQuote(quotePayload);

    // Save quote to local database
    const saveQuoteQuery = `
      INSERT INTO quotes (erp_sale_id, status, payload)
      VALUES ($1, $2, $3)
      RETURNING id
    `;

    const quoteResult = await pool.query(saveQuoteQuery, [
      cin7Response.ID || cin7Response.SaleID,
      'NOTAUTHORISED',
      JSON.stringify({
        cin7_response: cin7Response,
        original_cart: cart,
        user_id: userId,
        customer_id: customerId
      })
    ]);

    // Clear cart after successful checkout
    carts.delete(userId);

    res.json({
      success: true,
      quote_id: quoteResult.rows[0].id,
      erp_sale_id: cin7Response.ID || cin7Response.SaleID,
      cin7_response: cin7Response
    });

  } catch (error) {
    console.error('Checkout error:', error);
    
    // Handle Cin7 API errors specifically
    if (error.status) {
      return res.status(error.status).json({ 
        error: `Cin7 API Error: ${error.message}`,
        details: error.data 
      });
    }
    
    res.status(500).json({ error: 'Checkout failed' });
  }
});

module.exports = router;