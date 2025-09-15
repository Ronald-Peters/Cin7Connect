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

  // Session probe - FIXED for production
  app.get("/api/session", (req: any, res) => {
    const user = (req.session as any)?.user;
    if (user) {
      return res.json({ authenticated: true, user: publicUser(user) });
    }
    return res.json({ authenticated: false });
  });

  // Login (expects { email, password }) - PRODUCTION READY with database fallback
  app.post("/api/login", async (req: any, res: any) => {
    try {
      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      // Check admin credentials - PRODUCTION SECURITY: Require environment variables
      const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
      const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
      
      // SECURITY: No fallback credentials in production - require proper env vars
      if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
        console.error(`[LOGIN] SECURITY: Admin credentials not configured properly`);
        return res.status(500).json({ 
          message: "Server configuration error", 
          error: "Admin authentication not properly configured" 
        });
      }
      
      console.log(`[LOGIN] Admin email configured: ${!!ADMIN_EMAIL}`);
      console.log(`[LOGIN] Attempting login for: ${email}`);
      
      if (email.toLowerCase() === ADMIN_EMAIL.toLowerCase() && password === ADMIN_PASSWORD) {
        const user = { 
          id: "admin-1", 
          email: ADMIN_EMAIL.toLowerCase(), 
          role: "admin", 
          name: "Admin" 
        };
        
        try {
          // Save user to session with error handling
          (req.session as any).user = user;
          console.log(`[LOGIN] Admin session saved successfully`);
        } catch (sessionError: any) {
          console.error(`[LOGIN] Session save failed but continuing:`, sessionError.message);
          // Continue anyway - session might work on subsequent requests
        }
        
        return res.json({ success: true, user: publicUser(user) });
      }
      
      // Check database users (client accounts) with error handling
      try {
        console.log(`[LOGIN] Checking database for user: ${email.toLowerCase()}`);
        const dbUser = await storage.getUserByEmail(email.toLowerCase());
        console.log(`[LOGIN] Database user found: ${!!dbUser}`);
        
        if (dbUser && dbUser.password === password) {
          const user = {
            id: dbUser.id,
            email: dbUser.email,
            role: dbUser.role || "user",
            name: dbUser.name,
            customerId: dbUser.customerId
          };
          
          try {
            // Save user to session with error handling
            (req.session as any).user = user;
            console.log(`[LOGIN] Database user session saved successfully`);
          } catch (sessionError: any) {
            console.error(`[LOGIN] Session save failed but continuing:`, sessionError.message);
            // Continue anyway - session might work on subsequent requests
          }
          
          return res.json({ success: true, user: publicUser(user) });
        }
      } catch (dbError: any) {
        console.error(`[LOGIN] Database error (non-fatal):`, dbError.message);
        // Continue to credential check - admin login should still work
      }
      
      console.log(`[LOGIN] Invalid credentials for: ${email}`);
      return res.status(401).json({ message: "Invalid credentials" });
    } catch (error: any) {
      console.error("[LOGIN] Critical error:", error);
      console.error("[LOGIN] Error stack:", error.stack);
      return res.status(500).json({ 
        message: "Login failed", 
        error: error.message,
        details: "Database or session configuration issue"
      });
    }
  });

  // Logout - FIXED for production
  app.post("/api/logout", (req: any, res: any) => {
    try {
      // Clear user from session
      if (req.session) {
        delete (req.session as any).user;
        req.session.destroy((err: any) => {
          if (err) {
            console.error("Session destroy error:", err);
            return res.status(500).json({ message: "Logout failed" });
          }
          res.clearCookie("connect.sid");
          return res.json({ success: true });
        });
      } else {
        return res.json({ success: true });
      }
    } catch (e) {
      console.error("Logout handler error:", e);
      res.status(500).json({ message: "Logout failed" });
    }
  });

  // Get current user (authentication state) - FIXED for production
  app.get("/api/user", (req: any, res) => {
    const user = (req.session as any)?.user;
    if (user) {
      return res.json(publicUser(user));
    }
    return res.status(401).json({ message: "Not authenticated" });
  });

  // Authentication check endpoint (alternative to /api/user) - FIXED for production
  app.get("/api/auth/me", (req: any, res) => {
    const user = (req.session as any)?.user;
    if (user) {
      return res.json(publicUser(user));
    }
    return res.status(401).json({ message: "Not authenticated" });
  });

  // -------------------------
  // Admin Routes (require admin role)
  // -------------------------
  function requireAdmin(req: any, res: any, next: any) {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      return res.status(401).json({ message: "Authentication required" });
    }
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ message: "Admin access required" });
    }
    next();
  }

  // Get all customers for admin
  app.get("/api/customers", requireAdmin, async (req: any, res) => {
    try {
      const customers = await storage.getAllCustomers();
      res.json({ customers: customers || [] });
    } catch (error) {
      console.error("Error fetching customers:", error);
      res.status(500).json({ message: "Failed to fetch customers" });
    }
  });

  // Create new customer
  app.post("/api/customers", requireAdmin, async (req: any, res) => {
    try {
      const { name, email, company } = req.body;
      
      if (!name || !email || !company) {
        return res.status(400).json({ message: "Name, email, and company are required" });
      }

      const customer = await storage.createCustomer({
        companyName: company,
        erpCustomerId: email.split('@')[0], // Use email prefix as temp ERP ID
        terms: "Net 30",
        priceTier: "Wholesale",
        contacts: JSON.stringify([{ name, email, role: "Primary Contact" }])
      });

      res.json({ success: true, customer });
    } catch (error) {
      console.error("Error creating customer:", error);
      res.status(500).json({ message: "Failed to create customer" });
    }
  });

  // Toggle customer active status
  app.patch("/api/customers/:id/status", requireAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { active } = req.body;
      
      await storage.updateCustomerStatus(id, active);
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating customer status:", error);
      res.status(500).json({ message: "Failed to update customer status" });
    }
  });

  // Get all admin users
  app.get("/api/admin/users", requireAdmin, async (req: any, res) => {
    try {
      const users = await storage.getAllAdminUsers();
      // Return the admin users including the configured ones
      const adminUsers = [
        { id: 1, name: "Ronald", email: "ronald@reiviloindustrial.co.za", role: "admin" },
        { id: 2, name: "Kai", email: "sales2@reiviloindustrial.co.za", role: "admin" },
        ...(users || [])
      ];
      res.json({ users: adminUsers });
    } catch (error) {
      console.error("Error fetching admin users:", error);
      res.status(500).json({ message: "Failed to fetch admin users" });
    }
  });

  // Create new admin user
  app.post("/api/admin/users", requireAdmin, async (req: any, res) => {
    try {
      const { name, email, password } = req.body;
      
      if (!name || !email || !password) {
        return res.status(400).json({ message: "Name, email, and password are required" });
      }

      const user = await storage.createAdminUser({
        name,
        email,
        password,
        role: 'admin'
      });

      res.json({ success: true, user });
    } catch (error) {
      console.error("Error creating admin user:", error);
      res.status(500).json({ message: "Failed to create admin user" });
    }
  });

  // -------------------------
  // Health & Monitoring
  // -------------------------
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/healthz", (_req, res) => {
    res.json({ 
      status: "healthy",
      timestamp: new Date().toISOString(),
      service: "reivilo-b2b-api"
    });
  });

  // -------------------------
  // Production Sync Endpoints (Secured)
  // -------------------------
  function requireSyncToken(req: any, res: any, next: any) {
    const token = req.headers['x-sync-token'] || req.query.token;
    const expectedToken = process.env.SYNC_TOKEN || 'default-sync-token';
    
    if (token !== expectedToken) {
      return res.status(401).json({ message: 'Unauthorized sync request' });
    }
    next();
  }

  // Sync product availability (every 5 minutes)
  app.post("/api/sync/availability", requireSyncToken, async (_req, res) => {
    try {
      const { ProductSyncService } = await import('./sync');
      const result = await ProductSyncService.syncAvailability();
      res.json(result);
    } catch (error: any) {
      console.error("Availability sync error:", error);
      res.status(500).json({ 
        success: false, 
        message: "Sync failed", 
        error: error.message 
      });
    }
  });

  // Sync products (hourly)  
  app.post("/api/sync/products", requireSyncToken, async (_req, res) => {
    try {
      const { ProductSyncService } = await import('./sync');
      const result = await ProductSyncService.syncProducts();
      res.json(result);
    } catch (error: any) {
      console.error("Products sync error:", error);
      res.status(500).json({ 
        success: false, 
        message: "Sync failed", 
        error: error.message 
      });
    }
  });

  // Sync customers (hourly)
  app.post("/api/sync/customers", requireSyncToken, async (_req, res) => {
    try {
      const { ProductSyncService } = await import('./sync');
      const result = await ProductSyncService.syncCustomers();
      res.json(result);
    } catch (error: any) {
      console.error("Customers sync error:", error);
      res.status(500).json({ 
        success: false, 
        message: "Sync failed", 
        error: error.message 
      });
    }
  });

  // Full system sync (nightly)
  app.post("/api/sync/full", requireSyncToken, async (_req, res) => {
    try {
      const { ProductSyncService } = await import('./sync');
      const result = await ProductSyncService.fullSync();
      res.json(result);
    } catch (error: any) {
      console.error("Full sync error:", error);
      res.status(500).json({ 
        success: false, 
        message: "Sync failed", 
        error: error.message 
      });
    }
  });

  // -------------------------
  // Scheduler Monitoring & Control (Admin Only)
  // -------------------------
  
  // Get scheduler status and statistics
  app.get("/api/scheduler/status", requireAdmin, async (_req, res) => {
    try {
      const { syncScheduler } = await import('./scheduler');
      
      const status = {
        isRunning: syncScheduler.isSchedulerRunning(),
        health: syncScheduler.getHealthStatus(),
        stats: syncScheduler.getStats(),
        timestamp: new Date().toISOString()
      };
      
      res.json(status);
    } catch (error: any) {
      console.error("Error getting scheduler status:", error);
      res.status(500).json({ message: "Failed to get scheduler status" });
    }
  });

  // Manual sync triggers
  app.post("/api/scheduler/trigger/:type", requireAdmin, async (req: any, res) => {
    try {
      const { type } = req.params;
      const allowedTypes = ['customers', 'products', 'availability', 'all'];
      
      if (!allowedTypes.includes(type)) {
        return res.status(400).json({ 
          message: `Invalid sync type. Must be one of: ${allowedTypes.join(', ')}` 
        });
      }

      const { syncScheduler } = await import('./scheduler');
      const result = await syncScheduler.triggerSync(type);
      
      res.json({ 
        success: true, 
        message: `Manual ${type} sync triggered successfully`,
        result 
      });
    } catch (error: any) {
      console.error("Error triggering manual sync:", error);
      res.status(500).json({ 
        success: false, 
        message: "Failed to trigger sync", 
        error: error.message 
      });
    }
  });

  // Scheduler health check
  app.get("/api/scheduler/health", requireAdmin, async (_req, res) => {
    try {
      const { syncScheduler } = await import('./scheduler');
      const health = syncScheduler.getHealthStatus();
      
      res.json({
        ...health,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error("Error getting scheduler health:", error);
      res.status(500).json({ message: "Failed to get scheduler health" });
    }
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
    console.log("[PRODUCTS] Request received:", req.query);
    try {
      const q = ((req.query.q as string) || "").trim();
      const page = parseInt((req.query.page as string) || "1", 10) || 1;
      const limit = parseInt((req.query.limit as string) || (req.query.pageSize as string) || "50", 10) || 50;

      // Serve directly from database with timeout protection
      const result = await Promise.race([
        storage.getProducts(q, page, limit),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Database query timeout")), 5000)
        )
      ]);

      // storage.getProducts returns { products: [...], total: number }
      const items = (result as any)?.products || [];
      const total = (result as any)?.total || 0;

      console.log(`[PRODUCTS] Returning ${items.length} products, total: ${total}`);
      res.json({
        items,
        total,
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
