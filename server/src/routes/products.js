const express = require('express');
const pool = require('../db');

const router = express.Router();

// Get products with availability
router.get('/', async (req, res) => {
  try {
    const { q = '', page = 1, pageSize = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const limit = parseInt(pageSize);

    // Build search condition
    let searchCondition = '';
    let searchParams = [];
    
    if (q.trim()) {
      searchCondition = `
        WHERE (
          p.name ILIKE $1 OR 
          p.sku ILIKE $1 OR 
          p.barcode ILIKE $1 OR 
          p.brand ILIKE $1
        )
      `;
      searchParams.push(`%${q.trim()}%`);
    }

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM products p
      ${searchCondition}
    `;
    
    const countResult = await pool.query(countQuery, searchParams);
    const total = parseInt(countResult.rows[0].total);

    // Get products
    const productsQuery = `
      SELECT 
        p.id,
        p.sku,
        p.name,
        p.barcode,
        p.brand,
        p.image_url,
        p.created_at
      FROM products p
      ${searchCondition}
      ORDER BY p.name ASC
      LIMIT $${searchParams.length + 1} OFFSET $${searchParams.length + 2}
    `;

    const productsResult = await pool.query(
      productsQuery, 
      [...searchParams, limit, offset]
    );

    // Get availability for these products
    const productIds = productsResult.rows.map(p => p.id);
    let availability = [];

    if (productIds.length > 0) {
      const availabilityQuery = `
        SELECT 
          a.product_id,
          w.cin7_location_name as warehouse,
          a.available,
          a.on_hand,
          a.allocated,
          a.on_order
        FROM availability a
        JOIN warehouses w ON a.warehouse_id = w.id
        WHERE a.product_id = ANY($1)
        ORDER BY w.cin7_location_name ASC
      `;

      const availabilityResult = await pool.query(availabilityQuery, [productIds]);
      availability = availabilityResult.rows;
    }

    res.json({
      items: productsResult.rows,
      availability,
      total,
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      totalPages: Math.ceil(total / parseInt(pageSize))
    });

  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

module.exports = router;