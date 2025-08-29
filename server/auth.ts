import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

// Create admin users if they don't exist
async function createAdminUsers() {
  const adminUsers = [
    { email: "ronald@reiviloindustrial.co.za", password: "Ron@Reiv25" },
    { email: "sales2@reiviloindustrial.co.za", password: "Kai@Reiv25" }
  ];

  for (const admin of adminUsers) {
    const existingUser = await storage.getUserByEmail(admin.email);
    if (!existingUser) {
      await storage.createUser({
        email: admin.email,
        password: await hashPassword(admin.password),
        role: 'admin',
      });
      console.log(`✅ Created admin user: ${admin.email}`);
    }
  }
}

export function setupAuth(app: Express) {
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || 'reivilo-b2b-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  };

  if (process.env.NODE_ENV === 'production') {
    app.set("trust proxy", 1);
  }
  
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());
  
  // Create admin users on startup
  createAdminUsers().catch(console.error);

  passport.use(
    new LocalStrategy(
      { usernameField: 'email' },
      async (email, password, done) => {
        try {
          const user = await storage.getUserByEmail(email);
          if (!user || !(await comparePasswords(password, user.password))) {
            return done(null, false);
          } else {
            return done(null, user);
          }
        } catch (error) {
          return done(error);
        }
      }
    ),
  );

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user);
    } catch (error) {
      done(error);
    }
  });

  // Admin-only client registration endpoint
  app.post("/api/admin/create-client", async (req, res, next) => {
    try {
      if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { email, password, customerId } = req.body;
      
      if (!email || !password || !customerId) {
        return res.status(400).json({ message: "Email, password, and customer ID are required" });
      }

      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: "Email already registered" });
      }

      const user = await storage.createUser({
        email,
        password: await hashPassword(password),
        customerId: parseInt(customerId),
        role: 'buyer',
        createdBy: req.user.id,
      });

      res.status(201).json({
        id: user.id,
        email: user.email,
        role: user.role,
        customerId: user.customerId,
        success: true,
      });
    } catch (error) {
      next(error);
    }
  });

  // Disable public registration - admin only
  app.post("/api/register", async (req, res) => {
    res.status(403).json({ 
      message: "Registration is restricted. Please contact your administrator for access." 
    });
  });

  app.post("/api/login", passport.authenticate("local"), async (req, res) => {
    try {
      const user = req.user!;
      let customer = null;
      
      if (user.customerId) {
        customer = await storage.getCustomerById(user.customerId);
      }

      res.status(200).json({
        id: user.id,
        email: user.email,
        role: user.role,
        customerId: user.customerId,
        customer: customer ? {
          id: customer.id,
          companyName: customer.companyName,
          priceTier: customer.priceTier,
          terms: customer.terms,
        } : null,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch user details" });
    }
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  // Admin routes
  app.get("/api/admin/customers", async (req, res) => {
    try {
      if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const customers = await storage.getAllActiveCustomers();
      res.json(customers);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch customers" });
    }
  });

  app.post("/api/admin/customers/:id/activate", async (req, res) => {
    try {
      if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const { allowPortalAccess } = req.body;
      const customerId = parseInt(req.params.id);
      
      const customer = await storage.updateCustomer(customerId, {
        isActive: true,
        allowPortalAccess: allowPortalAccess || false,
      });
      
      if (!customer) {
        return res.status(404).json({ message: "Customer not found" });
      }
      
      res.json(customer);
    } catch (error) {
      res.status(500).json({ message: "Failed to update customer" });
    }
  });

  // Admin user management routes
  app.get("/api/admin/users", async (req, res) => {
    try {
      if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const adminUsers = await storage.getAllAdminUsers();
      res.json(adminUsers.map(user => ({
        id: user.id,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
      })));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch admin users" });
    }
  });

  app.post("/api/admin/create-admin", async (req, res, next) => {
    try {
      if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: "Email already registered" });
      }

      const user = await storage.createUser({
        email,
        password: await hashPassword(password),
        role: 'admin',
        createdBy: req.user.id,
      });

      res.status(201).json({
        id: user.id,
        email: user.email,
        role: user.role,
        success: true,
      });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/admin/users/:id", async (req, res) => {
    try {
      if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const userId = req.params.id;
      
      // Prevent deleting yourself
      if (userId === req.user.id) {
        return res.status(400).json({ message: "Cannot delete your own admin account" });
      }
      
      const success = await storage.deleteAdminUser(userId);
      if (!success) {
        return res.status(404).json({ message: "Admin user not found" });
      }
      
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete admin user" });
    }
  });

  app.get("/api/user", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const user = req.user!;
      let customer = null;
      
      if (user.customerId) {
        customer = await storage.getCustomerById(user.customerId);
      }

      res.json({
        id: user.id,
        email: user.email,
        role: user.role,
        customerId: user.customerId,
        customer: customer ? {
          id: customer.id,
          companyName: customer.companyName,
          priceTier: customer.priceTier,
          terms: customer.terms,
        } : null,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch user details" });
    }
  });
}
