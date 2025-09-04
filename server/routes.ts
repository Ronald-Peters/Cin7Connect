import type { Express } from "express";
import { createServer, type Server } from "http";
import passport from "passport";
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

const publicUser = (user: any) =>
  user
    ? {
        id: user.id ?? user.userId ?? user.email,
        email: user.email,
        name: user.name,
        role: user.role,
        customerId: user.customerId,
      }
    : null;

export function registerRoutes(app: Express): Server {
  // Initialize passport/session
  setupAuth(app);

  // Prevent cached logged-out pages
  app.use((_: any, res: any, next: any) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  // -------------------------
  // Auth API (Passport-backed)
  // -------------------------

  // Session probe
  app.get("/api/session", (req: any, res) => {
    if (req.isAuthenticated && req.isAuthenticated()) {
      return res.json({ authenticated: true, user: publicUser(req.user) });
    }
    return res.json({ authenticated: false });
  });

  // Login (expects { email, password })
  app.post("/api/login", (req: any, res: any, next: any) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user) {
        return res.status(401).json({ message: info?.message || "Invalid credentials" });
      }

      req.logIn(user, (loginErr: any) => {
        if (loginErr) return next(loginErr);

        // Save the session after successful login
        req.session.save((saveErr: any) => {
          if (saveErr) {
            console.error("Session save error:", saveErr);
            return next(saveErr);
          }
          return res.json({ success: true, user: publicUser(user) });
        });
      });
    })(req, res, next);
  });

  // Logout
  app.post("/api/logout", (req: any, res: any) => {
    try {
      req.logout?.((err: any) => {
        if (err) {
          console.error("Logout error:", err);
          return res.status(500).json({ message: "Logout failed" });
        }
        req.session?.destroy?.(() => {
          res.clearCookie?.("connect.sid");
          return res.json({ success: true });
        });
      });
    } catch (e) {
      console.error("Logout handler error:", e);
      res.status(500).json({ message: "Logout failed" });
    }
  });

  // Get current user (authentication state)
  app.get("/api/user", (req: any, res) => {
    if (req.isAuthenticated && req.isAuthenticated()) {
      return res.json(publicUser(req.user));
    }
    return res.status(401).json({ message: "Not authenticated" });
  });

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
      // Support either getWarehouses() or getLocations()
      const raw = (await (cin7Service as any).getWarehouses?.()) ??
                  (await (cin7Service as any).getLocations?.()) ??
                  [];

      const out = (raw || []).map((w: any) => ({
        // Be defensive about field names coming from Cin7
        id: w.Id ?? w.ID ?? w.id ?? w.LocationId ?? null,
        name: w.Name ?? w.LocationName ?? w.name ?? "Unknown",
        isDefault: !!(w.IsDefault ?? w.isDefault),
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
      const limit =
        parseInt((req.query.limit as string) || (req.query.pageSize as string) || "50", 10) || 50;

      const result = await (cin7Service as any).getProducts?.({
        search: q,
        limit,
      });

      // Accept multiple shapes from the service
      const items =
        Array.isArray(result)
          ? result
          : result?.data ??
            result?.items ??
            result?.Products ??
            [];

      res.json({
        items,
        total: Array.isArray(items) ? items.length : 0,
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
      const uid = String(req.user?.id ?? req.user?.email ?? "anon");
      const cart = carts.get(uid) || { items: [], location: null };
      res.json(cart);
    } catch (error) {
      console.error("Error fetching cart:", error);
      res.status(500).json({ message: "Failed to fetch cart" });
    }
  });

  app.post("/api/cart", requireAuth, (req: any, res) => {
    try {
      const uid = String(req.user?.id ?? req.user?.email ?? "anon");
      const { items, location } = req.body;

      const cart: Cart = {
        items: Array.isArray(items) ? items : [],
        location: location ?? null,
      };

      carts.set(uid, cart);
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
      const uid = String(user?.id ?? user?.email ?? "anon");
      const cart = carts.get(uid);

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
          erpSaleId: (cin7Response as any).ID || (cin7Response as any).SaleID,
          status: "NOTAUTHORISED",
          payload: JSON.stringify({
            cin7_response: cin7Response,
            original_cart: cart,
            user_id: uid,
            customer_id: customer.id,
          }),
        });

        // Clear cart on success
        carts.delete(uid);

        res.json({
          success: true,
          quote_id: quote.id,
          erp_sale_id: (cin7Response as any).ID || (cin7Response as any).SaleID,
          cin7_response: cin7Response,
        });
      } catch (cin7Error: any) {
        console.error("Cin7 API error:", cin7Error);

        const quote = await storage.createQuote({
          status: "FAILED",
          payload: JSON.stringify({
            error: cin7Error?.message,
            original_cart: cart,
            user_id: uid,
            customer_id: customer?.id,
          }),
        });

        res.status(500).json({
          message: `Quote creation failed: ${cin7Error?.message || "Unknown error"}`,
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
