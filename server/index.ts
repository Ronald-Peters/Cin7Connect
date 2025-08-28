import express, { type Request, Response, NextFunction } from "express";
import path from "path";
import { fileURLToPath } from "url";
import fetch from "node-fetch";

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

// ---------- Cin7 Core client ----------
const CORE_BASE_URL = process.env.CORE_BASE_URL || "https://inventory.dearsystems.com/ExternalApi";
const CORE_HEADERS = () => ({
  "Content-Type": "application/json",
  "api-auth-accountid": process.env.CIN7_ACCOUNT_ID,
  "api-auth-applicationkey": process.env.CIN7_APP_KEY,
});

async function corePost(path: string, body: any) {
  const url = `${CORE_BASE_URL}${path}`;
  const res = await fetch(url, { method: "POST", headers: CORE_HEADERS(), body: JSON.stringify(body) });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Core POST ${url} failed (${res.status}): ${text}`);
  }
  return res.json();
}

/**
 * Helper to call Cin7 Core endpoints with simple error handling + pagination support.
 */
async function coreGet(path: string, { page = 1, limit, qs = {} }: { page?: number; limit?: number; qs?: Record<string, any> } = {}) {
  const url = new URL(`${CORE_BASE_URL}${path}`);
  if (page) url.searchParams.set("page", String(page));
  if (limit) url.searchParams.set("limit", String(limit));
  for (const [k, v] of Object.entries(qs)) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));

  const res = await fetch(url.toString(), { headers: CORE_HEADERS() });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Core GET ${url} failed (${res.status}): ${text}`);
  }
  return res.json();
}

// Test connection endpoint
app.get("/api/test-connection", async (req, res) => {
  try {
    log("Testing Cin7 connection...");
    log(`Using baseURL: ${CORE_BASE_URL}`);
    log(`Account ID exists: ${!!process.env.CIN7_ACCOUNT_ID}`);
    log(`App Key exists: ${!!process.env.CIN7_APP_KEY}`);
    
    const result = await coreGet("/Locations", { page: 1, limit: 1 });
    res.json({ success: true, connected: true, result });
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
    log("Fetching products from Cin7 ProductAvailability (filtered warehouses)...");
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 50;
    const warehouseFilter = req.query.warehouse as string;
    
    const data = await coreGet("/ProductAvailability", { page, limit });
    log(`Cin7 ProductAvailability response: ${JSON.stringify(data).substring(0, 200)}...`);
    
    // Filter to only allowed warehouse locations
    const allowedWarehouses = ["B-CPT", "B-VDB", "S-BFN", "S-CPT", "S-POM"];
    const availabilityArray = data.ProductAvailability || [];
    
    // Filter data to only show stock from allowed warehouses
    const filteredAvailability = availabilityArray.filter((item: any) => 
      allowedWarehouses.includes(item.Location)
    );
    
    // Group stock by product and combine warehouse totals
    const productMap = new Map();
    
    filteredAvailability.forEach((item: any) => {
      const sku = item.SKU;
      if (!productMap.has(sku)) {
        productMap.set(sku, {
          sku: sku,
          name: item.Name || item.ProductName,
          available: 0,
          onHand: 0,
          onOrder: 0,
          warehouseBreakdown: {
            jhb: { available: 0, onHand: 0, onOrder: 0 }, // B-VDB + S-POM
            cpt: { available: 0, onHand: 0, onOrder: 0 }, // B-CPT + S-CPT
            bfn: { available: 0, onHand: 0, onOrder: 0 }  // S-BFN
          }
        });
      }
      
      const product = productMap.get(sku);
      product.available += item.Available || 0;
      product.onHand += item.OnHand || 0;
      product.onOrder += item.OnOrder || 0;
      
      // Group into customer-facing warehouse regions
      if (["B-VDB", "S-POM"].includes(item.Location)) {
        product.warehouseBreakdown.jhb.available += item.Available || 0;
        product.warehouseBreakdown.jhb.onHand += item.OnHand || 0;
        product.warehouseBreakdown.jhb.onOrder += item.OnOrder || 0;
      } else if (["B-CPT", "S-CPT"].includes(item.Location)) {
        product.warehouseBreakdown.cpt.available += item.Available || 0;
        product.warehouseBreakdown.cpt.onHand += item.OnHand || 0;
        product.warehouseBreakdown.cpt.onOrder += item.OnOrder || 0;
      } else if (item.Location === "S-BFN") {
        product.warehouseBreakdown.bfn.available += item.Available || 0;
        product.warehouseBreakdown.bfn.onHand += item.OnHand || 0;
        product.warehouseBreakdown.bfn.onOrder += item.OnOrder || 0;
      }
    });
    
    // Convert map to array and format for frontend
    const products = Array.from(productMap.values()).slice(0, 10).map((item: any, index: number) => ({
      id: index + 1,
      sku: item.sku || `REI00${index + 1}`,
      name: item.name || `Product ${index + 1}`,
      description: `${item.name || 'Product'} - Quality assured by Reivilo's 45 years of excellence`,
      price: 299.99, // Pricing would come from Cin7 price tiers
      currency: "ZAR",
      available: item.available,
      onHand: item.onHand,
      onOrder: item.onOrder,
      warehouseBreakdown: item.warehouseBreakdown
    }));
    
    res.json({
      products,
      total: products.length,
      filteredWarehouses: allowedWarehouses
    });
    log(`Successfully returned ${products.length} products with filtered warehouse stock from ${filteredAvailability.length} availability records`);
  } catch (error: any) {
    log(`Error fetching products: ${error.message}`);
    res.status(500).json({ error: "Failed to fetch products from inventory system" });
  }
});

app.get("/api/warehouses", async (req, res) => {
  try {
    log("Fetching filtered warehouses from Cin7 Locations...");
    const data = await coreGet("/Locations", { page: 1, limit: 500 });
    log(`Cin7 Locations response: ${JSON.stringify(data).substring(0, 200)}...`);
    
    // Filter and group warehouses according to business requirements
    const allowedWarehouses = ["B-CPT", "B-VDB", "S-BFN", "S-CPT", "S-POM"];
    const locationsData = data.Locations || data.locations || data || [];
    
    // Filter to only allowed warehouse locations
    const filteredLocations = locationsData.filter((location: any) => 
      allowedWarehouses.includes(location.Name)
    );
    
    // Group warehouses for customer-facing display
    const groupedWarehouses = [
      {
        id: 1,
        name: "JHB Warehouse",
        location: "Johannesburg",
        description: "Covering Gauteng and surrounding areas",
        internalLocations: ["B-VDB", "S-POM"]
      },
      {
        id: 2,
        name: "CPT Warehouse", 
        location: "Cape Town",
        description: "Covering Western Cape region",
        internalLocations: ["B-CPT", "S-CPT"]
      },
      {
        id: 3,
        name: "BFN Warehouse",
        location: "Bloemfontein", 
        description: "Covering Free State and central regions",
        internalLocations: ["S-BFN"]
      }
    ];
    
    res.json(groupedWarehouses);
    log(`Successfully returned ${groupedWarehouses.length} grouped warehouses (filtered from ${filteredLocations.length} allowed locations)`);
  } catch (error: any) {
    log(`Error fetching warehouses: ${error.message}`);
    res.status(500).json({ error: "Failed to fetch warehouse locations" });
  }
});

app.get("/api/availability", async (req, res) => {
  try {
    const productSku = req.query.sku as string;
    log(`Fetching availability for ${productSku ? `SKU: ${productSku}` : 'all products'} from filtered warehouses...`);
    
    const data = await coreGet("/ProductAvailability", { 
      page: 1, 
      limit: productSku ? 50 : 100 
    });
    
    // Filter to only allowed warehouse locations
    const allowedWarehouses = ["B-CPT", "B-VDB", "S-BFN", "S-CPT", "S-POM"];
    const availabilityArray = data.ProductAvailability || [];
    
    let filteredAvailability = availabilityArray.filter((item: any) => 
      allowedWarehouses.includes(item.Location)
    );
    
    // Filter by SKU if requested
    if (productSku) {
      filteredAvailability = filteredAvailability.filter((item: any) => 
        item.SKU === productSku
      );
    }
    
    // Group by warehouse regions and products
    const availability = filteredAvailability.map((item: any) => {
      let warehouseGroup = "";
      let warehouseId = 0;
      
      if (["B-VDB", "S-POM"].includes(item.Location)) {
        warehouseGroup = "JHB Warehouse";
        warehouseId = 1;
      } else if (["B-CPT", "S-CPT"].includes(item.Location)) {
        warehouseGroup = "CPT Warehouse";
        warehouseId = 2;
      } else if (item.Location === "S-BFN") {
        warehouseGroup = "BFN Warehouse";
        warehouseId = 3;
      }
      
      return {
        productSku: item.SKU,
        productName: item.Name,
        warehouseId: warehouseId,
        warehouseName: warehouseGroup,
        internalLocation: item.Location,
        available: item.Available || 0,
        onHand: item.OnHand || 0,
        onOrder: item.OnOrder || 0,
        stockValue: item.StockOnHand || 0
      };
    });
    
    res.json(availability);
    log(`Successfully returned ${availability.length} availability records from filtered warehouses`);
  } catch (error: any) {
    log(`Error fetching availability: ${error.message}`);
    res.status(500).json({ error: "Failed to fetch stock availability" });
  }
});

// Core API endpoints matching the working implementation  
app.get("/api/core/customers", async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 100);
    const data = await coreGet("/Customers", { page, limit });
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get("/api/core/locations", async (req, res) => {
  try {
    const data = await coreGet("/Locations", { page: 1, limit: 500 });
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get("/api/core/availability", async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 100);
    const { sku, name, location } = req.query;

    const data = await coreGet("/ProductAvailability", {
      page,
      limit,
      qs: {
        ...(sku ? { sku } : {}),
        ...(name ? { name } : {}),
        ...(location ? { location } : {}),
      },
    });

    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/api/core/sale/quote", async (req, res) => {
  try {
    const { customerId, customerName, contact, email, priceTier, location, lines = [], orderMemo } = req.body;

    if (!customerId && !customerName) {
      return res.status(400).json({ error: "Provide customerId or customerName" });
    }
    if (!Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({ error: "Provide at least one line" });
    }

    const payload = {
      CustomerID: customerId || undefined,
      Customer: customerName || undefined,
      Contact: contact || undefined,
      Email: email || undefined,
      PriceTier: priceTier || undefined,
      Location: location || undefined,
      OrderStatus: "NOTAUTHORISED",
      InvoiceStatus: "NOTAUTHORISED",
      OrderMemo: orderMemo || undefined,
      Lines: lines.map((l: any, idx: number) => ({
        SKU: l.sku,
        Quantity: Number(l.quantity),
        Price: Number(l.price),
        Tax: 0,
        Total: 0,
        TaxRule: l.taxRule || "Standard",
        LineOrder: l.lineOrder || idx + 1,
      })),
    };

    const result = await corePost("/Sale", payload);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: String(e.message || e) });
  }
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
