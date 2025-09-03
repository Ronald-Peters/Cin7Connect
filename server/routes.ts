import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { cin7Service } from "./services/cin7";

interface CartItem {
  sku: string;
  quantity: number;
  warehouse: string;
  price?: number;
}

interface Cart {
  items: CartItem[];
  location?: string | null;
}

// In-memory cart storage (replace with DB/Redis in production)
const carts = new Map<string, Cart>();

function requireAuth(req: any, res: any, next: any) {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({ message: "Authentication required" });
  }
  next();
}

export function registerRoutes(app: Express): Server {
  // Auth/session middleware
  setupAuth(app);

  // -------------------------
  // Health
  // -------------------------
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  // -------------------------
  // Manual product sync (optional – keeps your old DB sync utility)
  // -------------------------
  app.post("/api/products/sync", async (_req, res) => {
    try {
      const result = await storage.syncCin7Products();
      res.json(result);
    } catch (error) {
      console.error("Error syncing products:", error);
      res.status(500).json({ message: "Failed to sync products" });
    }
  });

  // -------------------------
  // Warehouses (direct from Cin7)
  // -------------------------
  app.get("/api/warehouses", async (_req, res) => {
    try {
      const warehouses = await cin7Service.getWarehouses();
      const out = (warehouses || []).map((w: any) => ({
        // ✅ Cin7 returns "Id" (capital I, lowercase d), not "ID"
        id: w.Id,
        name: w.Name,
        isDefault: !!w.IsDefault,
      }));
      res.json(out);
    } catch (error) {
      console.error("Error fetching warehouses:", error);
      res.status(500).json({ message: "Failed to fetch warehouses" });
    }
  });

  // -------------------------
  // Products (direct from Cin7)
  // -------------------------
  app.get("/api/products", async (req, res) => {
    try {
      const q = ((req.query.q as string) || "").trim();
      // accept either ?limit= or ?pageSize=; default 50
      const limit =
        parseInt((req.query.limit as string) || (req.query.pageSize as string) || "50", 10) || 50;

      const products = await cin7Service.getProducts({
        search: q,
        limit,
      });

      res.json({
        items: products || [],
        total: (products || []).length,
      });
    } catch (error) {
      console.error("Error fetching products:", error);
      res.status(500).json({ message: "Failed to fetch products" });
    }
  });

  // -------------------------
  // Customer profile (requires auth, reads from your DB)
  // -------------------------
  app.get("/api/customers/me", requireAuth, async (req: any, res) => {
    try {
      const user = req.user!;
      if (!user?.customerId) {
        return res.status(404).json({ message: "No customer profile found" });
      }

      const customer = await storage.getCustomerById(user.customerId);
      if (!customer) {
        return res.status(404).json({ message: "Customer not found" });
      }

      // Parse contacts JSON safely
      let contacts: any[] = [];
      if (customer.contacts) {
        try {
          contacts = JSON.parse(customer.contacts as string);
        } catch {
          contacts = [];
        }
      }

      res.json({
        ...customer,
        contacts,
      });
    } catch (error) {
      console.error("Error fetching customer profile:", error);
      res.status(500).json({ message: "Failed to fetch customer profile" });
    }
  });

  // -------------------------
  // Cart (requires auth) – in-memory for now
  // -------------------------
  app.get("/api/cart", requireAuth, (req: any, res) => {
    try {
      const userId = req.user!.id;
      const cart = carts.get(userId) || { items: [], location: null };
      res.json(cart);
    } catch (error) {
      console.error("Error fetching cart:", error);
      res.status(500).json({ message: "Failed to fetch cart" });
    }
  });

  app.post("/api/cart", requireAuth, (req: any, res) => {
    try {
      const userId = req.user!.id;
      const { items, location } = req.body;

      const cart: Cart = {
        items: Array.isArray(items) ? items : [],
        location: location ?? null,
      };

      carts.set(userId, cart);
      res.json(cart);
    } catch (error) {
      console.error("Error updating cart:", error);
      res.status(500).json({ message: "Failed to update cart" });
    }
  });

  // -------------------------
  // Checkout (requires auth) – creates an UNAUTHORISED quote in Cin7
  // -------------------------
  app.post("/api/cart/checkout", requireAuth, async (req: any, res) => {
    try {
      const user = req.user!;
      const cart = carts.get(user.id);

      if (!cart || !cart.items || cart.items.length === 0) {
        return res.status(400).json({ message: "Cart is empty" });
      }
      if (!cart.location) {
        return res.status(400).json({ message: "Location is required for checkout" });
      }

      // Load customer (from your DB)
      let customer = null;
      if (user.customerId) {
        customer = await storage.getCustomerById(user.customerId);
      }
      if (!customer) {
        return res.status(404).json({ message: "Customer profile required for checkout" });
      }

      // Build payload for Cin7
      const quotePayload = {
        Customer: customer.erpCustomerId || customer.companyName || "",
        CustomerID: customer.erpCustomerId || "",
        PriceTier: customer.priceTier || "Wholesale",
        Location: cart.location,
        OrderStatus: "NOTAUTHORISED",
        Lines: cart.items.map((item) => ({
          SKU: item.sku,
          Quantity: item.quantity,
          Price: item.price || 0,
          TaxRule: "Default",
        })),
      };

      try {
        // Create in Cin7
        const cin7Response = await cin7Service.createQuote(quotePayload);

        // Save locally
        const quote = await storage.createQuote({
          erpSaleId: cin7Response.ID || cin7Response.SaleID,
          status: "NOTAUTHORISED",
          payload: JSON.stringify({
            cin7_response: cin7Response,
            original_cart: cart,
            user_id: user.id,
            customer_id: customer.id,
          }),
        });

        // Clear cart on success
        carts.delete(user.id);

        res.json({
          success: true,
          quote_id: quote.id,
          erp_sale_id: cin7Response.ID || cin7Response.SaleID,
          cin7_response: cin7Response,
        });
      } catch (cin7Error: any) {
        console.error("Cin7 API error:", cin7Error);

        const quote = await storage.createQuote({
          status: "FAILED",
          payload: JSON.stringify({
            error: cin7Error.message,
            original_cart: cart,
            user_id: user.id,
            customer_id: customer.id,
          }),
        });

        res.status(500).json({
          message: `Quote creation failed: ${cin7Error.message}`,
          quote_id: quote.id,
        });
      }
    } catch (error) {
      console.error("Checkout error:", error);
      res.status(500).json({ message: "Checkout failed" });
    }
  });

  // Return Node HTTP server
  const httpServer = createServer(app);
  return httpServer;
}
