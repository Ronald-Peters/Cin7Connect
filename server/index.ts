import express, { type Request, Response, NextFunction } from "express";
import path from "path";
import { fileURLToPath } from "url";
import { Cin7Service } from './services/cin7.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function log(message: string) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}


const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

// Initialize Cin7 service (credentials come from environment variables)
const cin7 = new Cin7Service();

// Test connection endpoint
app.get("/api/test-connection", async (req, res) => {
  try {
    log("Testing Cin7 connection...");
    log(`Using baseURL: ${process.env.CIN7_BASE_URL || 'https://inventory.cin7.com/api/v1'}`);
    log(`Account ID exists: ${!!process.env.CIN7_ACCOUNT_ID}`);
    log(`App Key exists: ${!!process.env.CIN7_APP_KEY}`);
    
    const result = await cin7.testConnection();
    res.json({ success: true, connected: result });
  } catch (error: any) {
    log(`Connection test failed: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Live API routes connecting to Cin7
app.get("/api/user", (req, res) => {
  res.json({ id: 1, username: "demo", companyName: "Demo Company" });
});

app.get("/api/products", async (req, res) => {
  try {
    log("Fetching products from Cin7...");
    const response = await cin7.getProducts();
    log(`Cin7 products response structure: ${typeof response}, keys: ${Object.keys(response || {})}`);
    
    // The getProducts method returns { data: [], pagination: {} }
    const productsArray = Array.isArray(response?.data) ? response.data : [];
    
    const processedProducts = productsArray.slice(0, 10).map((product: any, index: number) => ({
      id: index + 1,
      sku: product.SKU || `REI00${index + 1}`,
      name: product.Name || `Product ${index + 1}`,
      description: `${product.Name || 'Product'} - Quality assured by Reivilo's 45 years of excellence`,
      price: 299.99, // Pricing would come from Cin7 price tiers
      currency: "ZAR"
    }));
    
    res.json({
      products: processedProducts,
      total: processedProducts.length
    });
    log(`Successfully returned ${processedProducts.length} products from Cin7`);
  } catch (error: any) {
    log(`Error fetching products: ${error.message}`);
    res.status(500).json({ error: "Failed to fetch products from inventory system" });
  }
});

app.get("/api/warehouses", async (req, res) => {
  try {
    log("Fetching warehouses from Cin7...");
    const locationsResponse = await cin7.getLocations();
    log(`Cin7 locations response type: ${typeof locationsResponse}`);
    
    // Handle the locations data correctly
    const locationsArray = Array.isArray(locationsResponse) ? locationsResponse : [];
    log(`Processing ${locationsArray.length} locations`);
    
    const warehouses = locationsArray.map((location: any, index: number) => ({
      id: index + 1,
      name: location.Name || location.LocationName || `Location ${index + 1}`,
      location: location.Name || location.LocationName || "Unknown"
    }));
    
    res.json(warehouses);
    log(`Successfully returned ${warehouses.length} warehouses from Cin7`);
  } catch (error: any) {
    log(`Error fetching warehouses: ${error.message}`);
    res.status(500).json({ error: "Failed to fetch warehouse locations" });
  }
});

app.get("/api/availability", (req, res) => {
  res.json([
    { productId: 1, warehouseId: 1, available: 45, onHand: 50, onOrder: 25 },
    { productId: 1, warehouseId: 2, available: 30, onHand: 35, onOrder: 10 },
    { productId: 1, warehouseId: 3, available: 20, onHand: 25, onOrder: 15 },
    { productId: 2, warehouseId: 1, available: 80, onHand: 85, onOrder: 40 },
    { productId: 2, warehouseId: 2, available: 60, onHand: 65, onOrder: 20 },
    { productId: 2, warehouseId: 3, available: 35, onHand: 40, onOrder: 25 },
    { productId: 3, warehouseId: 1, available: 100, onHand: 110, onOrder: 50 },
    { productId: 3, warehouseId: 2, available: 75, onHand: 80, onOrder: 30 },
    { productId: 3, warehouseId: 3, available: 55, onHand: 60, onOrder: 20 }
  ]);
});

app.get("/api/cart", (req, res) => {
  res.json({ items: [], location: "Cape Town Main" });
});

// Serve assets
app.use('/attached_assets', express.static(path.resolve(__dirname, "../attached_assets")));

// Error handling middleware
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  res.status(status).json({ message });
  log(`Error: ${message}`);
});

// For testing purposes, create a simple React test page
app.get("/app", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Reivilo B2B Portal - Test Application</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
    .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .header { background: #1E3A8A; color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
    .api-test { margin: 20px 0; padding: 15px; background: #f8f9fa; border-radius: 5px; }
    .product { border: 1px solid #ddd; padding: 15px; margin: 10px 0; border-radius: 5px; }
    button { background: #1E3A8A; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🏆 Reivilo B2B Portal - Test Environment</h1>
      <p>45 Years of Family Business Values Since 1980</p>
    </div>
    
    <div class="api-test">
      <h2>API Testing Dashboard</h2>
      <button onclick="testProducts()">Test Products API</button>
      <button onclick="testWarehouses()">Test Warehouses API</button>
      <button onclick="testUser()">Test User API</button>
      <button onclick="testCart()">Test Cart API</button>
    </div>
    
    <div id="results"></div>
  </div>

  <script>
    async function testAPI(endpoint, title) {
      try {
        const response = await fetch('/api' + endpoint);
        const data = await response.json();
        displayResults(title, data);
      } catch (error) {
        displayResults(title + ' (Error)', { error: error.message });
      }
    }
    
    function testProducts() { testAPI('/products', 'Products'); }
    function testWarehouses() { testAPI('/warehouses', 'Warehouses'); }
    function testUser() { testAPI('/user', 'User'); }
    function testCart() { testAPI('/cart', 'Cart'); }
    
    function displayResults(title, data) {
      const results = document.getElementById('results');
      const div = document.createElement('div');
      div.className = 'api-test';
      div.innerHTML = '<h3>' + title + '</h3><pre>' + JSON.stringify(data, null, 2) + '</pre>';
      results.appendChild(div);
    }
  </script>
</body>
</html>
  `);
});

// Serve demo page as default
app.get("/", (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.sendFile(path.resolve(__dirname, "../client/demo.html"));
});

// Catch all handler for client-side routing
app.get("*", (req, res) => {
  if (!req.path.startsWith('/api') && !req.path.includes('.')) {
    res.sendFile(path.resolve(__dirname, "../client/demo.html"));
  } else {
    res.status(404).send('Not found');
  }
});

const port = parseInt(process.env.PORT || '5000', 10);
app.listen(port, "0.0.0.0", () => {
  log(`🚀 Reivilo B2B Portal running on port ${port}`);
  log(`📈 45 Years of Family Business Values Since 1980`);
  log(`🌐 Visit: http://localhost:${port}`);
  log(`🧪 Test App: http://localhost:${port}/app`);
});
