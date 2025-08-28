require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const pool = require('./src/db');

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(express.json());

// Import routes
const { router: authRoutes } = require('./src/routes/auth');
const productsRoutes = require('./src/routes/products');
const customersRoutes = require('./src/routes/customers');
const cartRoutes = require('./src/routes/cart');
const miscRoutes = require('./src/routes/misc');

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/customers', customersRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api', miscRoutes);

// Serve frontend in production
const clientDistPath = path.join(__dirname, '../client/dist');
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(clientDistPath));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

// Initialize database schema
async function initializeDatabase() {
  try {
    const fs = require('fs');
    const schemaPath = path.join(__dirname, 'db/schema.sql');
    
    if (fs.existsSync(schemaPath)) {
      const schema = fs.readFileSync(schemaPath, 'utf8');
      await pool.query(schema);
      console.log('Database schema initialized');
    }
  } catch (error) {
    console.error('Failed to initialize database:', error.message);
  }
}

// Start server
async function startServer() {
  try {
    await initializeDatabase();
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();