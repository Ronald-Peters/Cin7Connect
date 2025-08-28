import express, { type Request, Response, NextFunction } from "express";
import path from "path";
import { fileURLToPath } from "url";

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

// Demo API routes with Reivilo branding
app.get("/api/user", (req, res) => {
  res.json({ id: 1, username: "demo", companyName: "Demo Company" });
});

app.get("/api/products", (req, res) => {
  res.json({
    products: [
      {
        id: 1,
        sku: "REI001",
        name: "Premium Business Solution",
        description: "A high-quality business solution from Reivilo - 45 years of excellence",
        price: 299.99,
        currency: "ZAR"
      },
      {
        id: 2,
        sku: "REI002", 
        name: "Enterprise Package",
        description: "Comprehensive enterprise solution with family business values since 1980",
        price: 599.99,
        currency: "ZAR"
      },
      {
        id: 3,
        sku: "REI003",
        name: "Professional Service",
        description: "Professional grade service with Reivilo's proven track record",
        price: 199.99,
        currency: "ZAR"
      }
    ],
    total: 3
  });
});

app.get("/api/warehouses", (req, res) => {
  res.json([
    { id: 1, name: "Cape Town Main", location: "Cape Town" },
    { id: 2, name: "Johannesburg Branch", location: "Johannesburg" },
    { id: 3, name: "Durban Facility", location: "Durban" }
  ]);
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

// Serve assets only, not HTML files
app.use('/attached_assets', express.static(path.resolve(__dirname, "../attached_assets")));


// Error handling middleware
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  res.status(status).json({ message });
  log(`Error: ${message}`);
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
});
