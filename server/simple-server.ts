import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Serve static files from client directory during development
app.use(express.static(path.resolve(__dirname, "../client")));

// API routes
app.get("/api/user", (req, res) => {
  res.json({ id: 1, username: "demo", companyName: "Demo Company" });
});

app.get("/api/products", (req, res) => {
  res.json({
    products: [
      {
        id: 1,
        sku: "DEMO001",
        name: "Sample Product 1",
        description: "A high-quality product from Reivilo",
        price: 99.99,
        currency: "ZAR"
      },
      {
        id: 2,
        sku: "DEMO002", 
        name: "Sample Product 2",
        description: "Another excellent product with 45 years of quality",
        price: 149.99,
        currency: "ZAR"
      }
    ],
    total: 2
  });
});

app.get("/api/warehouses", (req, res) => {
  res.json([
    { id: 1, name: "Main Warehouse", location: "Cape Town" },
    { id: 2, name: "Johannesburg Branch", location: "Johannesburg" }
  ]);
});

app.get("/api/availability", (req, res) => {
  res.json([
    { productId: 1, warehouseId: 1, available: 25, onHand: 30, onOrder: 10 },
    { productId: 1, warehouseId: 2, available: 15, onHand: 20, onOrder: 5 },
    { productId: 2, warehouseId: 1, available: 40, onHand: 45, onOrder: 0 },
    { productId: 2, warehouseId: 2, available: 30, onHand: 35, onOrder: 15 }
  ]);
});

app.get("/api/cart", (req, res) => {
  res.json({ items: [], location: "Main Warehouse" });
});

// Catch all handler for client-side routing
app.get("*", (req, res) => {
  res.sendFile(path.resolve(__dirname, "../client/index.html"));
});

const port = parseInt(process.env.PORT || '5000', 10);
app.listen(port, "0.0.0.0", () => {
  console.log(`Reivilo B2B Portal running on port ${port}`);
  console.log(`Visit: http://localhost:${port}`);
});