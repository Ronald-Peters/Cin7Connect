const express = require('express');
const pool = require('../db');

const router = express.Router();

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ ok: true });
});

// Get warehouses
router.get('/warehouses', async (req, res) => {
  try {
    const query = `
      SELECT id, cin7_location_name as name
      FROM warehouses
      ORDER BY cin7_location_name ASC
    `;
    
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching warehouses:', error);
    res.status(500).json({ error: 'Failed to fetch warehouses' });
  }
});

module.exports = router;