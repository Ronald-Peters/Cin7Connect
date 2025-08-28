var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/index.ts
import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import fetch from "node-fetch";

// server/auth.ts
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import session2 from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";

// shared/schema.ts
var schema_exports = {};
__export(schema_exports, {
  availability: () => availability,
  availabilityRelations: () => availabilityRelations,
  customers: () => customers,
  customersRelations: () => customersRelations,
  insertAvailabilitySchema: () => insertAvailabilitySchema,
  insertCustomerSchema: () => insertCustomerSchema,
  insertProductSchema: () => insertProductSchema,
  insertQuoteSchema: () => insertQuoteSchema,
  insertUserSchema: () => insertUserSchema,
  insertWarehouseSchema: () => insertWarehouseSchema,
  products: () => products,
  productsRelations: () => productsRelations,
  quotes: () => quotes,
  users: () => users,
  usersRelations: () => usersRelations,
  warehouses: () => warehouses,
  warehousesRelations: () => warehousesRelations
});
import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, numeric, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
var users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  customerId: integer("customer_id").references(() => customers.id),
  role: text("role").default("buyer"),
  createdAt: timestamp("created_at").defaultNow()
});
var customers = pgTable("customers", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  erpCustomerId: text("erp_customer_id").unique(),
  companyName: text("company_name"),
  terms: text("terms"),
  priceTier: text("price_tier"),
  defaultAddress: text("default_address"),
  billingAddress: text("billing_address"),
  shippingAddress: text("shipping_address"),
  contacts: jsonb("contacts"),
  updatedAt: timestamp("updated_at").defaultNow()
});
var products = pgTable("products", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  sku: text("sku").unique().notNull(),
  name: text("name"),
  barcode: text("barcode"),
  brand: text("brand"),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at").defaultNow()
});
var warehouses = pgTable("warehouses", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  cin7LocationName: text("cin7_location_name").unique().notNull()
});
var availability = pgTable("availability", {
  productId: integer("product_id").references(() => products.id, { onDelete: "cascade" }),
  warehouseId: integer("warehouse_id").references(() => warehouses.id, { onDelete: "cascade" }),
  onHand: numeric("on_hand").default("0"),
  allocated: numeric("allocated").default("0"),
  available: numeric("available").default("0"),
  onOrder: numeric("on_order").default("0")
}, (table) => ({
  pk: sql`PRIMARY KEY (${table.productId}, ${table.warehouseId})`
}));
var quotes = pgTable("quotes", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  erpSaleId: text("erp_sale_id"),
  status: text("status"),
  payload: jsonb("payload"),
  createdAt: timestamp("created_at").defaultNow()
});
var usersRelations = relations(users, ({ one }) => ({
  customer: one(customers, { fields: [users.customerId], references: [customers.id] })
}));
var customersRelations = relations(customers, ({ many }) => ({
  users: many(users)
}));
var productsRelations = relations(products, ({ many }) => ({
  availability: many(availability)
}));
var warehousesRelations = relations(warehouses, ({ many }) => ({
  availability: many(availability)
}));
var availabilityRelations = relations(availability, ({ one }) => ({
  product: one(products, { fields: [availability.productId], references: [products.id] }),
  warehouse: one(warehouses, { fields: [availability.warehouseId], references: [warehouses.id] })
}));
var insertUserSchema = createInsertSchema(users).pick({
  email: true,
  password: true
});
var insertCustomerSchema = createInsertSchema(customers);
var insertProductSchema = createInsertSchema(products);
var insertWarehouseSchema = createInsertSchema(warehouses);
var insertAvailabilitySchema = createInsertSchema(availability);
var insertQuoteSchema = createInsertSchema(quotes);

// server/db.ts
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
neonConfig.webSocketConstructor = ws;
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?"
  );
}
var pool = new Pool({ connectionString: process.env.DATABASE_URL });
var db = drizzle({ client: pool, schema: schema_exports });

// server/storage.ts
import { eq, ilike, and, asc, sql as sql2 } from "drizzle-orm";
import session from "express-session";
import connectPg from "connect-pg-simple";
var PostgresSessionStore = connectPg(session);
var DatabaseStorage = class {
  sessionStore;
  constructor() {
    this.sessionStore = new PostgresSessionStore({
      pool,
      createTableIfMissing: true
    });
  }
  async getUser(id) {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || void 0;
  }
  async getUserByEmail(email) {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || void 0;
  }
  async createUser(userData) {
    const [user] = await db.insert(users).values({
      email: userData.email,
      password: userData.password,
      customerId: userData.customerId
    }).returning();
    return user;
  }
  async getCustomerById(id) {
    const [customer] = await db.select().from(customers).where(eq(customers.id, id));
    return customer || void 0;
  }
  async getCustomerByErpId(erpId) {
    const [customer] = await db.select().from(customers).where(eq(customers.erpCustomerId, erpId));
    return customer || void 0;
  }
  async upsertCustomer(customerData) {
    if (customerData.id) {
      const [updated] = await db.update(customers).set(customerData).where(eq(customers.id, customerData.id)).returning();
      return updated;
    } else {
      const [created] = await db.insert(customers).values(customerData).returning();
      return created;
    }
  }
  async getProducts(search, page = 1, pageSize = 50) {
    const offset = (page - 1) * pageSize;
    let whereCondition = void 0;
    if (search) {
      whereCondition = ilike(products.name, `%${search}%`);
    }
    const [productsResult, countResult] = await Promise.all([
      db.select().from(products).where(whereCondition).orderBy(asc(products.name)).limit(pageSize).offset(offset),
      db.select({ count: sql2`count(*)` }).from(products).where(whereCondition)
    ]);
    return {
      products: productsResult,
      total: countResult[0]?.count || 0
    };
  }
  async getProductById(id) {
    const [product] = await db.select().from(products).where(eq(products.id, id));
    return product || void 0;
  }
  async getProductBySku(sku) {
    const [product] = await db.select().from(products).where(eq(products.sku, sku));
    return product || void 0;
  }
  async upsertProduct(productData) {
    if (productData.sku) {
      const existing = await this.getProductBySku(productData.sku);
      if (existing) {
        const [updated] = await db.update(products).set(productData).where(eq(products.sku, productData.sku)).returning();
        return updated;
      }
    }
    const [created] = await db.insert(products).values(productData).returning();
    return created;
  }
  async getWarehouses() {
    return await db.select().from(warehouses).orderBy(asc(warehouses.cin7LocationName));
  }
  async getWarehouseById(id) {
    const [warehouse] = await db.select().from(warehouses).where(eq(warehouses.id, id));
    return warehouse || void 0;
  }
  async upsertWarehouse(warehouseData) {
    if (warehouseData.cin7LocationName) {
      const [existing] = await db.select().from(warehouses).where(eq(warehouses.cin7LocationName, warehouseData.cin7LocationName));
      if (existing) {
        const [updated] = await db.update(warehouses).set(warehouseData).where(eq(warehouses.cin7LocationName, warehouseData.cin7LocationName)).returning();
        return updated;
      }
    }
    const [created] = await db.insert(warehouses).values(warehouseData).returning();
    return created;
  }
  async getAvailabilityByProductIds(productIds) {
    if (productIds.length === 0) return [];
    return await db.select({
      productId: availability.productId,
      warehouseId: availability.warehouseId,
      onHand: availability.onHand,
      allocated: availability.allocated,
      available: availability.available,
      onOrder: availability.onOrder,
      warehouse: warehouses
    }).from(availability).innerJoin(warehouses, eq(availability.warehouseId, warehouses.id)).where(sql2`${availability.productId} = ANY(ARRAY[${productIds.join(",")}])`);
  }
  async upsertAvailability(availabilityData) {
    if (availabilityData.productId && availabilityData.warehouseId) {
      const [existing] = await db.select().from(availability).where(
        and(
          eq(availability.productId, availabilityData.productId),
          eq(availability.warehouseId, availabilityData.warehouseId)
        )
      );
      if (existing) {
        const [updated] = await db.update(availability).set(availabilityData).where(
          and(
            eq(availability.productId, availabilityData.productId),
            eq(availability.warehouseId, availabilityData.warehouseId)
          )
        ).returning();
        return updated;
      }
    }
    const [created] = await db.insert(availability).values(availabilityData).returning();
    return created;
  }
  async createQuote(quoteData) {
    const [quote] = await db.insert(quotes).values(quoteData).returning();
    return quote;
  }
  async getQuotesByCustomerId(customerId) {
    return [];
  }
};
var storage = new DatabaseStorage();

// server/auth.ts
var scryptAsync = promisify(scrypt);
async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const buf = await scryptAsync(password, salt, 64);
  return `${buf.toString("hex")}.${salt}`;
}
async function comparePasswords(supplied, stored) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = await scryptAsync(supplied, salt, 64);
  return timingSafeEqual(hashedBuf, suppliedBuf);
}
function setupAuth(app2) {
  const sessionSettings = {
    secret: process.env.SESSION_SECRET || "reivilo-b2b-secret-change-in-production",
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1e3
      // 24 hours
    }
  };
  if (process.env.NODE_ENV === "production") {
    app2.set("trust proxy", 1);
  }
  app2.use(session2(sessionSettings));
  app2.use(passport.initialize());
  app2.use(passport.session());
  passport.use(
    new LocalStrategy(
      { usernameField: "email" },
      async (email, password, done) => {
        try {
          const user = await storage.getUserByEmail(email);
          if (!user || !await comparePasswords(password, user.password)) {
            return done(null, false);
          } else {
            return done(null, user);
          }
        } catch (error) {
          return done(error);
        }
      }
    )
  );
  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user);
    } catch (error) {
      done(error);
    }
  });
  app2.post("/api/register", async (req, res, next) => {
    try {
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
        password: await hashPassword(password)
      });
      req.login(user, (err) => {
        if (err) return next(err);
        res.status(201).json({
          id: user.id,
          email: user.email,
          role: user.role,
          customerId: user.customerId
        });
      });
    } catch (error) {
      next(error);
    }
  });
  app2.post("/api/login", passport.authenticate("local"), async (req, res) => {
    try {
      const user = req.user;
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
          terms: customer.terms
        } : null
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch user details" });
    }
  });
  app2.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });
  app2.get("/api/user", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const user = req.user;
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
          terms: customer.terms
        } : null
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch user details" });
    }
  });
}

// server/index.ts
var __dirname = path.dirname(fileURLToPath(import.meta.url));
function log(message) {
  console.log(`[${(/* @__PURE__ */ new Date()).toISOString()}] ${message}`);
}
var app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
setupAuth(app);
app.use((req, res, next) => {
  const start = Date.now();
  const path2 = req.path;
  let capturedJsonResponse = void 0;
  const originalResJson = res.json;
  res.json = function(bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path2.startsWith("/api")) {
      let logLine = `${req.method} ${path2} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "\u2026";
      }
      log(logLine);
    }
  });
  next();
});
var CORE_BASE_URL = process.env.CORE_BASE_URL || "https://inventory.dearsystems.com/ExternalApi";
var CORE_HEADERS = () => ({
  "Content-Type": "application/json",
  "api-auth-accountid": process.env.CIN7_ACCOUNT_ID || "",
  "api-auth-applicationkey": process.env.CIN7_APP_KEY || ""
});
async function corePost(path2, body) {
  const url = `${CORE_BASE_URL}${path2}`;
  const res = await fetch(url, { method: "POST", headers: CORE_HEADERS(), body: JSON.stringify(body) });
  if (!res.ok) {
    const text2 = await res.text();
    throw new Error(`Core POST ${url} failed (${res.status}): ${text2}`);
  }
  return res.json();
}
async function getProductImages(sku) {
  try {
    const productData = await coreGet("/Products", {
      qs: { where: `SKU='${sku}'` },
      page: 1,
      limit: 1
    });
    if (productData?.Products?.length > 0) {
      const product = productData.Products[0];
      const productId = product.ID;
      let images = [];
      if (product.Images && Array.isArray(product.Images)) {
        product.Images.forEach((img) => {
          if (img.URL || img.url) {
            images.push(img.URL || img.url);
          }
        });
      }
      if (product.ImageURL) {
        images.push(product.ImageURL);
      }
      const imageFields = ["ImageURL", "Image", "ThumbURL", "PhotoURL", "Picture", "MainImage"];
      imageFields.forEach((field) => {
        if (product[field] && typeof product[field] === "string" && product[field].trim()) {
          images.push(product[field]);
        }
      });
      if (product.Attachments && Array.isArray(product.Attachments)) {
        const attachmentImages = product.Attachments.filter((attachment) => {
          const fileName = attachment.FileName || attachment.filename || attachment.Name || "";
          return fileName.match(/\.(jpg|jpeg|png|gif|webp|bmp)$/i);
        }).map((attachment) => attachment.URL || attachment.url || attachment.Link).filter((url) => url && url.trim().length > 0);
        images = images.concat(attachmentImages);
      }
      if (images.length === 0 && productId) {
        try {
          const endpoints = [
            `/externalapi/v2/productAttachment?ProductID=${productId}`,
            `/ExternalApi/ProductAttachment?ProductID=${productId}`,
            `/externalapi/v2/productAttachment?ID=${productId}`,
            `/ExternalApi/ProductAttachment?ID=${productId}`
          ];
          for (const endpoint of endpoints) {
            try {
              const attachmentResponse = await fetch(`https://inventory.dearsystems.com${endpoint}`, {
                headers: {
                  "api-auth-accountid": process.env.CIN7_ACCOUNT_ID,
                  "api-auth-applicationkey": process.env.CIN7_APP_KEY,
                  "Content-Type": "application/json"
                }
              });
              if (attachmentResponse.ok) {
                const attachmentData = await attachmentResponse.json();
                let attachments = [];
                if (attachmentData?.Attachments) {
                  attachments = attachmentData.Attachments;
                } else if (Array.isArray(attachmentData)) {
                  attachments = attachmentData;
                }
                const attachmentImages = attachments.filter((attachment) => {
                  const fileName = attachment.FileName || attachment.filename || attachment.Name || "";
                  return fileName.match(/\.(jpg|jpeg|png|gif|webp|bmp)$/i);
                }).map((attachment) => {
                  return attachment.URL || attachment.url || attachment.Link || attachment.FileURL;
                }).filter((url) => url && url.trim().length > 0);
                if (attachmentImages.length > 0) {
                  images = images.concat(attachmentImages);
                  log(`\u2705 Found ${attachmentImages.length} attachment images for SKU ${sku} via ${endpoint}`);
                  break;
                }
              }
            } catch (endpointError) {
              continue;
            }
          }
        } catch (attachmentError) {
          if (!String(attachmentError).includes("Unexpected token")) {
            log(`Could not fetch attachments for ${sku}: ${String(attachmentError)}`);
          }
        }
      }
      if (images.length > 0) {
        log(`\u2705 Found ${images.length} total images for SKU ${sku}`);
        return images;
      }
    }
    return [];
  } catch (error) {
    log(`Error fetching images for ${sku}: ${error}`);
    return [];
  }
}
function getProductImageUrl(sku, productName) {
  return `https://via.placeholder.com/400x300/1E3A8A/FFFFFF?text=${encodeURIComponent(sku)}`;
}
async function coreGet(path2, { page = 1, limit, qs = {} } = {}) {
  const url = new URL(`${CORE_BASE_URL}${path2}`);
  if (page) url.searchParams.set("page", String(page));
  if (limit) url.searchParams.set("limit", String(limit));
  for (const [k, v] of Object.entries(qs)) if (v !== void 0 && v !== null) url.searchParams.set(k, String(v));
  const res = await fetch(url.toString(), { headers: CORE_HEADERS() });
  if (!res.ok) {
    const text2 = await res.text();
    throw new Error(`Core GET ${url} failed (${res.status}): ${text2}`);
  }
  return res.json();
}
app.get("/api/test-connection", async (req, res) => {
  try {
    log("Testing Cin7 connection...");
    log(`Using baseURL: ${CORE_BASE_URL}`);
    log(`Account ID exists: ${!!process.env.CIN7_ACCOUNT_ID}`);
    log(`App Key exists: ${!!process.env.CIN7_APP_KEY}`);
    const result = await coreGet("/Locations", { page: 1, limit: 1 });
    res.json({ success: true, connected: true, result });
  } catch (error) {
    log(`Connection test failed: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});
app.get("/api/user", (req, res) => {
  res.json({
    id: 1,
    username: "demo",
    email: "demo@reivilo.co.za",
    companyName: "Demo Company",
    customer: {
      id: 1,
      companyName: "Demo Company",
      priceTier: "Standard",
      terms: "Net 30"
    }
  });
});
app.get("/api/products", async (req, res) => {
  try {
    log("Fetching products from Cin7 ProductAvailability (filtered warehouses)...");
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 1e3;
    const warehouseFilter = req.query.warehouse;
    let allAvailabilityData = [];
    let currentPage = 1;
    let totalFetched = 0;
    do {
      log(`Fetching availability page ${currentPage} (max 1000 per page due to Cin7 API limit)...`);
      const pageData = await coreGet("/ProductAvailability", {
        page: currentPage,
        limit: 1e3
      });
      const pageRecords = pageData.ProductAvailability || [];
      allAvailabilityData = allAvailabilityData.concat(pageRecords);
      totalFetched += pageRecords.length;
      log(`\u{1F4CA} Page ${currentPage}: ${pageRecords.length} records (Total: ${totalFetched})`);
      if (pageRecords.length === 1e3) {
        currentPage++;
      } else {
        break;
      }
      if (currentPage > 100) {
        log(`\u{1F4C8} Large dataset: page ${currentPage} - continuing to fetch ALL data...`);
      }
    } while (true);
    const data = { ProductAvailability: allAvailabilityData, Total: totalFetched };
    log(`Cin7 ProductAvailability response: ${JSON.stringify(data).substring(0, 200)}...`);
    const allowedWarehouses = ["B-CPT", "B-VDB", "S-BFN", "S-CPT", "S-POM"];
    const availabilityArray = data.ProductAvailability || [];
    const filteredAvailability = availabilityArray.filter(
      (item) => allowedWarehouses.includes(item.Location)
    );
    const productMap = /* @__PURE__ */ new Map();
    filteredAvailability.forEach((item) => {
      const sku = item.SKU;
      if (!productMap.has(sku)) {
        productMap.set(sku, {
          sku,
          name: item.Name || item.ProductName,
          category: item.Category || item.CategoryName || item.CategoryDescription || null,
          available: 0,
          onHand: 0,
          onOrder: 0,
          warehouseBreakdown: {
            jhb: { available: 0, onHand: 0, onOrder: 0 },
            // B-VDB + S-POM
            cpt: { available: 0, onHand: 0, onOrder: 0 },
            // B-CPT + S-CPT
            bfn: { available: 0, onHand: 0, onOrder: 0 }
            // S-BFN
          }
        });
      }
      const product = productMap.get(sku);
      product.available += item.Available || 0;
      product.onHand += item.OnHand || 0;
      product.onOrder += item.OnOrder || 0;
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
    const categoryMapping = /* @__PURE__ */ new Map();
    categoryMapping.set("A0601", "F-2 / Tractor Front");
    categoryMapping.set("A0343", "Agri Bias");
    categoryMapping.set("A0521", "F-2 / Tractor Front");
    categoryMapping.set("A0763", "Implement");
    categoryMapping.set("A0517", "F-2 / Tractor Front");
    categoryMapping.set("ATV0001", "ATV Tyres");
    categoryMapping.set("ATV0004", "ATV Tyres");
    categoryMapping.set("FS0150", "Flap & Tube");
    categoryMapping.set("ATV0014", "ATV Tyres");
    categoryMapping.set("A0718", "Agri Bias");
    categoryMapping.set("A0594", "Agri Bias");
    categoryMapping.set("FS0149", "Flap & Tube");
    const productDetails = /* @__PURE__ */ new Map();
    for (const sku of Array.from(productMap.keys())) {
      const category = categoryMapping.get(sku);
      if (category) {
        productDetails.set(sku, { Category: category });
        log(`Mapped ${sku} to category: ${category}`);
      }
    }
    const products2 = await Promise.all(
      Array.from(productMap.values()).map(async (item, index) => {
        const images = await getProductImages(item.sku);
        const primaryImage = images.length > 0 ? images[0] : getProductImageUrl(item.sku, item.name);
        const productDetail = productDetails.get(item.sku);
        const categoryName = productDetail?.Category || "Tire Product";
        log(`Final category for ${item.sku}: "${categoryName}" (productDetail: ${JSON.stringify(productDetail)})`);
        return {
          id: index + 1,
          sku: item.sku || `REI00${index + 1}`,
          name: item.name || `Product ${index + 1}`,
          description: item.description || item.category || "Agriculture Tire",
          price: item.price || 0,
          // Real pricing from Cin7
          currency: "ZAR",
          available: item.available,
          onHand: item.onHand,
          onOrder: item.onOrder,
          warehouseBreakdown: item.warehouseBreakdown,
          // Real product images from Cin7 Core
          imageUrl: primaryImage,
          images
          // Additional product images
        };
      })
    );
    res.json({
      products: products2,
      total: products2.length,
      filteredWarehouses: allowedWarehouses
    });
    log(`Successfully returned ${products2.length} products with filtered warehouse stock from ${filteredAvailability.length} availability records`);
  } catch (error) {
    log(`Error fetching products: ${error.message}`);
    res.status(500).json({ error: "Failed to fetch products from inventory system" });
  }
});
app.get("/api/warehouses", async (req, res) => {
  try {
    log("Fetching filtered warehouses from Cin7 Locations...");
    const data = await coreGet("/Locations", { page: 1, limit: 500 });
    log(`Cin7 Locations response: ${JSON.stringify(data).substring(0, 200)}...`);
    const allowedWarehouses = ["B-CPT", "B-VDB", "S-BFN", "S-CPT", "S-POM"];
    const locationsData = data.Locations || data.locations || data || [];
    const filteredLocations = locationsData.filter(
      (location) => allowedWarehouses.includes(location.Name)
    );
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
  } catch (error) {
    log(`Error fetching warehouses: ${error.message}`);
    res.status(500).json({ error: "Failed to fetch warehouse locations" });
  }
});
app.get("/api/availability", async (req, res) => {
  try {
    const productSku = req.query.sku;
    log(`Fetching availability for ${productSku ? `SKU: ${productSku}` : "all products"} from filtered warehouses...`);
    const data = await coreGet("/ProductAvailability", {
      page: 1,
      limit: productSku ? 50 : 1e3
    });
    const allowedWarehouses = ["B-CPT", "B-VDB", "S-BFN", "S-CPT", "S-POM"];
    const availabilityArray = data.ProductAvailability || [];
    let filteredAvailability = availabilityArray.filter(
      (item) => allowedWarehouses.includes(item.Location)
    );
    if (productSku) {
      filteredAvailability = filteredAvailability.filter(
        (item) => item.SKU === productSku
      );
    }
    const availability2 = filteredAvailability.map((item) => {
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
        warehouseId,
        warehouseName: warehouseGroup,
        internalLocation: item.Location,
        available: item.Available || 0,
        onHand: item.OnHand || 0,
        onOrder: item.OnOrder || 0,
        stockValue: item.StockOnHand || 0
      };
    });
    res.json(availability2);
    log(`Successfully returned ${availability2.length} availability records from filtered warehouses`);
  } catch (error) {
    log(`Error fetching availability: ${error.message}`);
    res.status(500).json({ error: "Failed to fetch stock availability" });
  }
});
app.get("/api/core/customers", async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 1e4);
    const data = await coreGet("/Customers", { page, limit });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});
app.get("/api/product-images/:sku", async (req, res) => {
  try {
    const sku = req.params.sku;
    log(`Fetching product images for SKU: ${sku}`);
    const imageUrl = getProductImageUrl(sku, `Product ${sku}`);
    res.json({
      sku,
      primaryImage: imageUrl,
      additionalImages: [],
      totalImages: 1
    });
    log(`Returned placeholder image for SKU: ${sku}`);
  } catch (error) {
    log(`Error fetching product images for ${req.params.sku}: ${error.message}`);
    res.status(500).json({ error: "Failed to fetch product images" });
  }
});
app.get("/api/core/products", async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 1e4);
    const data = await coreGet("/ProductMaster", { page, limit });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});
app.get("/api/core/attachments", async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 1e4);
    const productId = req.query.productid;
    const params = { page, limit };
    if (productId) {
      params.productid = productId;
    }
    const data = await coreGet("/ProductAttachments", params);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});
app.get("/api/core/locations", async (req, res) => {
  try {
    const data = await coreGet("/Locations", { page: 1, limit: 500 });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});
app.get("/api/core/availability", async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 1e4);
    const { sku, name, location } = req.query;
    const data = await coreGet("/ProductAvailability", {
      page,
      limit,
      qs: {
        ...sku ? { sku } : {},
        ...name ? { name } : {},
        ...location ? { location } : {}
      }
    });
    res.json(data);
  } catch (e) {
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
      CustomerID: customerId || void 0,
      Customer: customerName || void 0,
      Contact: contact || void 0,
      Email: email || void 0,
      PriceTier: priceTier || void 0,
      Location: location || void 0,
      OrderStatus: "NOTAUTHORISED",
      InvoiceStatus: "NOTAUTHORISED",
      OrderMemo: orderMemo || void 0,
      Lines: lines.map((l, idx) => ({
        SKU: l.sku,
        Quantity: Number(l.quantity),
        Price: Number(l.price),
        Tax: 0,
        Total: 0,
        TaxRule: l.taxRule || "Standard",
        LineOrder: l.lineOrder || idx + 1
      }))
    };
    const result = await corePost("/Sale", payload);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});
app.get("/api/cart", (req, res) => {
  res.json({ items: [], location: "Cape Town Main" });
});
app.use("/attached_assets", express.static(path.resolve(__dirname, "../attached_assets")));
app.use((err, _req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  res.status(status).json({ message });
  log(`Error: ${message}`);
});
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
      <h1>\u{1F3C6} Reivilo B2B Portal - Test Environment</h1>
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
app.get("/catalog", async (req, res) => {
  try {
    log("Loading live product catalog from Cin7...");
    log("\u{1F4E6} Fetching stock availability data...");
    let allAvailabilityData = [];
    let currentPage = 1;
    let totalFetched = 0;
    do {
      log(`Fetching availability page ${currentPage} (max 1000 records per page)...`);
      const pageData = await coreGet("/ProductAvailability", {
        page: currentPage,
        limit: 1e3
      });
      const pageRecords = pageData.ProductAvailability || [];
      allAvailabilityData = allAvailabilityData.concat(pageRecords);
      totalFetched += pageRecords.length;
      log(`\u{1F4CA} Page ${currentPage}: ${pageRecords.length} records (Total so far: ${totalFetched})`);
      if (pageRecords.length === 1e3) {
        currentPage++;
      } else {
        break;
      }
      if (currentPage > 50) {
        log(`\u{1F4C8} Fetching extensive dataset: page ${currentPage} (continuing...)`);
      }
    } while (true);
    log(`\u{1F389} STOCK DATA: ${allAvailabilityData.length} records fetched from ${currentPage} pages`);
    log("\u{1F4B0} Fetching product pricing data...");
    let allProductData = [];
    currentPage = 1;
    totalFetched = 0;
    do {
      log(`Fetching products page ${currentPage} (max 1000 records per page)...`);
      const pageData = await coreGet("/Products", {
        page: currentPage,
        limit: 1e3
      });
      const pageRecords = pageData.Products || [];
      allProductData = allProductData.concat(pageRecords);
      totalFetched += pageRecords.length;
      log(`\u{1F4B0} Page ${currentPage}: ${pageRecords.length} products (Total so far: ${totalFetched})`);
      if (pageRecords.length === 1e3) {
        currentPage++;
      } else {
        break;
      }
      if (currentPage > 50) {
        log(`\u{1F4B0} Fetching extensive product dataset: page ${currentPage} (continuing...)`);
      }
    } while (true);
    log(`\u{1F389} PRICING DATA: ${allProductData.length} products fetched from ${currentPage} pages`);
    const pricingMap = /* @__PURE__ */ new Map();
    allProductData.forEach((product) => {
      pricingMap.set(product.SKU, {
        price: product.PriceTier1 || 0,
        priceTiers: product.PriceTiers || {},
        brand: product.Brand,
        category: product.Category,
        description: product.Description
      });
    });
    log(`\u{1F4B0} PRICING MAP: ${pricingMap.size} products with pricing data`);
    const allLocations = Array.from(new Set(allAvailabilityData.map((item) => item.Location)));
    log(`\u{1F4CD} ALL LOCATIONS found: ${allLocations.join(", ")}`);
    const locationCounts = {};
    allAvailabilityData.forEach((item) => {
      locationCounts[item.Location] = (locationCounts[item.Location] || 0) + 1;
    });
    log(`\u{1F4C8} RECORDS PER LOCATION: ${JSON.stringify(locationCounts)}`);
    const allowedWarehouses = ["B-CPT", "B-VDB", "S-BFN", "S-CPT", "S-POM"];
    const filteredAvailability = allAvailabilityData.filter(
      (item) => allowedWarehouses.includes(item.Location)
    );
    log(`\u2705 FILTERED to ${filteredAvailability.length} records from allowed warehouses`);
    const uniqueProducts = Array.from(new Set(filteredAvailability.map((item) => item.SKU)));
    log(`\u{1F3F7}\uFE0F  UNIQUE PRODUCTS: ${uniqueProducts.length} SKUs found`);
    if (filteredAvailability.length > 0) {
      const sampleSku = filteredAvailability[0].SKU;
      const samplePricing = pricingMap.get(sampleSku);
      const categoryStats = {};
      Array.from(pricingMap.values()).forEach((product) => {
        const cat = product.category || "No Category";
        if (cat !== "Claims") {
          categoryStats[cat] = (categoryStats[cat] || 0) + 1;
        }
      });
      log(`\u{1F4C2} Categories loaded: ${Object.keys(categoryStats).length} customer categories from Cin7`);
      log(`\u{1F6AB} Claims category excluded from customer catalog`);
    }
    const productMap = /* @__PURE__ */ new Map();
    filteredAvailability.forEach((item) => {
      const sku = item.SKU;
      if (!productMap.has(sku)) {
        const pricing = pricingMap.get(sku) || {};
        productMap.set(sku, {
          sku,
          name: item.Name || item.ProductName,
          available: 0,
          onHand: 0,
          price: pricing.price || 0,
          brand: pricing.brand || "",
          category: pricing.category || "",
          description: pricing.description || "",
          warehouseBreakdown: {
            jhb: { available: 0, onHand: 0 },
            cpt: { available: 0, onHand: 0 },
            bfn: { available: 0, onHand: 0 }
          }
        });
      }
      const product = productMap.get(sku);
      product.available += item.Available || 0;
      product.onHand += item.OnHand || 0;
      if (["B-VDB", "S-POM"].includes(item.Location)) {
        product.warehouseBreakdown.jhb.available += item.Available || 0;
        product.warehouseBreakdown.jhb.onHand += item.OnHand || 0;
      } else if (["B-CPT", "S-CPT"].includes(item.Location)) {
        product.warehouseBreakdown.cpt.available += item.Available || 0;
        product.warehouseBreakdown.cpt.onHand += item.OnHand || 0;
      } else if (item.Location === "S-BFN") {
        product.warehouseBreakdown.bfn.available += item.Available || 0;
        product.warehouseBreakdown.bfn.onHand += item.OnHand || 0;
      }
    });
    const categoryMapping = /* @__PURE__ */ new Map();
    categoryMapping.set("A0601", "F-2 / Tractor Front");
    categoryMapping.set("A0343", "Agri Bias");
    categoryMapping.set("A0521", "F-2 / Tractor Front");
    categoryMapping.set("A0763", "Implement");
    categoryMapping.set("A0517", "F-2 / Tractor Front");
    categoryMapping.set("ATV0001", "ATV Tyres");
    categoryMapping.set("ATV0004", "ATV Tyres");
    categoryMapping.set("FS0150", "Flap & Tube");
    categoryMapping.set("ATV0014", "ATV Tyres");
    categoryMapping.set("A0718", "Agri Bias");
    categoryMapping.set("A0594", "Agri Bias");
    categoryMapping.set("FS0149", "Flap & Tube");
    const allProducts = Array.from(productMap.values());
    const productsWithStock = allProducts.filter(
      (item) => item.available > 0 && item.category !== "Claims"
      // Exclude Claims from customer-facing catalog
    );
    const selectedProducts = productsWithStock.sort((a, b) => b.available - a.available).slice(0, 12);
    log(`Displaying ${selectedProducts.length} products with pricing and categories for verification`);
    const productsWithImages = [];
    const rawProducts = selectedProducts;
    for (const item of rawProducts) {
      try {
        log(`Checking for images for SKU: ${item.sku}`);
        const images = await getProductImages(item.sku);
        const primaryImage = images.length > 0 ? images[0] : null;
        if (primaryImage) {
          log(`Found image for ${item.sku}: ${primaryImage}`);
        } else {
          log(`No images found for ${item.sku}, using placeholder`);
        }
        const category = item.category || "Agriculture Tire";
        const description = item.description || category;
        productsWithImages.push({
          ...item,
          imageUrl: primaryImage,
          images,
          category,
          description
        });
      } catch (error) {
        log(`Error fetching images for ${item.sku}: ${error}`);
        productsWithImages.push({
          ...item,
          imageUrl: null,
          images: [],
          category: item.category || "Agriculture Tire",
          description: item.description || item.category || "Agriculture Tire"
        });
      }
    }
    const products2 = productsWithImages;
    res.setHeader("Content-Type", "text/html");
    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reivilo B2B - Product Catalog</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Segoe UI', system-ui, sans-serif; 
            background: #f8fafc; 
            color: #1e40af;
            line-height: 1.6;
        }
        .header {
            background: white;
            border-bottom: 3px solid #1e3a8a;
            padding: 1rem 0;
            box-shadow: 0 2px 8px rgba(30, 58, 138, 0.1);
        }
        .header-content {
            max-width: 1200px;
            margin: 0 auto;
            padding: 0 2rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .logo-section {
            display: flex;
            align-items: center;
            gap: 1rem;
        }
        .brand-title {
            font-size: 1.8rem;
            font-weight: bold;
            color: #1e3a8a;
        }
        .brand-subtitle {
            font-size: 0.85rem;
            color: #64748b;
            font-weight: 500;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 2rem;
        }
        .page-header {
            text-align: center;
            margin-bottom: 3rem;
        }
        .page-title {
            font-size: 2.5rem;
            color: #1e3a8a;
            margin-bottom: 0.5rem;
        }
        .page-subtitle {
            color: #64748b;
            font-size: 1.1rem;
        }
        .stats-bar {
            background: white;
            border-radius: 12px;
            padding: 1.5rem;
            margin-bottom: 2rem;
            box-shadow: 0 2px 12px rgba(30, 58, 138, 0.08);
            display: flex;
            justify-content: space-around;
            text-align: center;
        }
        .stat {
            flex: 1;
        }
        .stat-number {
            font-size: 1.8rem;
            font-weight: bold;
            color: #1e3a8a;
        }
        .stat-label {
            color: #64748b;
            font-size: 0.9rem;
        }
        .products-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
            gap: 1.5rem;
        }
        .product-card {
            background: white;
            border-radius: 12px;
            padding: 1.5rem;
            box-shadow: 0 2px 12px rgba(30, 58, 138, 0.08);
            border: 1px solid #e2e8f0;
            transition: all 0.2s ease;
        }
        .product-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 20px rgba(30, 58, 138, 0.15);
        }
        .product-header {
            display: flex;
            align-items: center;
            gap: 1rem;
            margin-bottom: 1rem;
        }
        .product-image {
            width: 60px;
            height: 60px;
            background: linear-gradient(135deg, #1e3a8a, #3b82f6);
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 1.2rem;
            font-weight: bold;
        }
        .product-info h3 {
            font-size: 1.1rem;
            color: #1e40af;
            margin-bottom: 0.25rem;
        }
        .product-sku {
            color: #64748b;
            font-family: 'Courier New', monospace;
            font-size: 0.9rem;
        }
        .product-stock {
            margin: 1rem 0;
        }
        .stock-total {
            font-size: 1.1rem;
            font-weight: 600;
            color: #059669;
            margin-bottom: 0.5rem;
        }
        .warehouse-breakdown {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 0.75rem;
        }
        .warehouse-item {
            background: #f8fafc;
            padding: 0.75rem;
            border-radius: 6px;
            border: 1px solid #e2e8f0;
            text-align: center;
        }
        .warehouse-name {
            font-size: 0.8rem;
            font-weight: 600;
            color: #1e40af;
            margin-bottom: 0.25rem;
        }
        .warehouse-stock {
            font-size: 0.9rem;
            color: #059669;
            font-weight: 500;
        }
        .warehouse-stock.zero {
            color: #dc2626;
        }
        .actions {
            margin-top: 1rem;
            display: flex;
            gap: 0.75rem;
        }
        .btn {
            padding: 0.6rem 1.2rem;
            border: none;
            border-radius: 6px;
            font-weight: 500;
            cursor: pointer;
            flex: 1;
            transition: all 0.2s ease;
        }
        .btn-primary {
            background: #1e3a8a;
            color: white;
        }
        .btn-primary:hover {
            background: #1e40af;
        }
        .btn-secondary {
            background: #f1f5f9;
            color: #475569;
            border: 1px solid #e2e8f0;
        }
        .btn-secondary:hover {
            background: #e2e8f0;
        }
        .no-stock {
            opacity: 0.6;
        }
        .footer {
            margin-top: 3rem;
            text-align: center;
            color: #64748b;
            padding: 2rem;
            border-top: 1px solid #e2e8f0;
        }
    </style>
</head>
<body>
    <header class="header">
        <div class="header-content">
            <div class="logo-section">
                <img src="/attached_assets/150 x 68_1756385143564.jpg" alt="Reivilo Logo" style="height: 40px; width: auto; margin-right: 1rem;" />
                <div>
                    <div class="brand-title">Reivilo B2B Portal</div>
                    <div class="brand-subtitle">Family Business Values Since 1980</div>
                </div>
            </div>
            <div style="color: #64748b; font-weight: 500;">Live Inventory System</div>
        </div>
    </header>

    <div class="container">
        <div class="page-header">
            <h1 class="page-title">Product Catalog</h1>
            <p class="page-subtitle">Real-time inventory across JHB, CPT & BFN warehouses</p>
            <div style="margin-top: 2rem; display: flex; justify-content: center;">
                <div style="position: relative; width: 100%; max-width: 500px;">
                    <input type="text" id="productSearch" placeholder="Search products by name, description, or SKU..." 
                           style="width: 100%; padding: 1rem 1rem 1rem 3rem; border: 2px solid #e2e8f0; border-radius: 8px; font-size: 1rem; outline: none; transition: border-color 0.2s;" 
                           onkeyup="filterProducts()" 
                           onfocus="this.style.borderColor='#1e40af'" 
                           onblur="this.style.borderColor='#e2e8f0'" />
                    <span style="position: absolute; left: 1rem; top: 50%; transform: translateY(-50%); color: #64748b; font-size: 1.2rem;">\u{1F50D}</span>
                </div>
            </div>
        </div>

        <div class="stats-bar">
            <div class="stat">
                <div class="stat-number">${products2.length}</div>
                <div class="stat-label">Products Available</div>
            </div>
            <div class="stat">
                <div class="stat-number">3</div>
                <div class="stat-label">Warehouse Regions</div>
            </div>
            <div class="stat">
                <div class="stat-number">ZAR</div>
                <div class="stat-label">Pricing Currency</div>
            </div>
        </div>

        <div class="products-grid">
            ${products2.map((product) => `
                <div class="product-card ${product.available === 0 ? "no-stock" : ""}">
                    <div class="product-header">
                        ${product.imageUrl ? `
                            <img src="${product.imageUrl}" alt="${product.name}" class="product-image-real" style="width: 60px; height: 60px; border-radius: 8px; object-fit: cover; border: 2px solid #e2e8f0;" />
                        ` : `
                            <div class="product-image" style="font-size: 10px; font-weight: bold; text-align: center; padding: 8px;">
                                ${product.sku}
                            </div>
                        `}
                        <div class="product-info">
                            <h3>${product.name}</h3>
                            <div style="margin: 0.5rem 0; display: flex; align-items: center; gap: 0.5rem;">
                                <span style="background: #1e40af; color: white; padding: 0.2rem 0.6rem; border-radius: 1rem; font-size: 0.75rem; font-weight: 500;">
                                    ${product.category || "General"}
                                </span>
                            </div>
                            <p style="color: #64748b; font-size: 0.9rem; margin: 0.5rem 0;">${product.description || product.category || "Quality tire product"}</p>
                            <div style="font-size: 1.25rem; font-weight: 700; color: #1e40af; margin: 0.75rem 0;">
                                R ${product.price ? parseFloat(product.price).toFixed(2) : "0.00"}
                            </div>
                            <div class="product-sku">SKU: ${product.sku}</div>
                        </div>
                    </div>
                    
                    <div class="product-stock">
                        <div class="stock-total">
                            ${product.available > 0 ? `${product.available} Available` : "Out of Stock"}
                        </div>
                        
                        <div class="warehouse-breakdown">
                            <div class="warehouse-item">
                                <div class="warehouse-name">JHB</div>
                                <div class="warehouse-stock ${product.warehouseBreakdown.jhb.available === 0 ? "zero" : ""}">
                                    ${product.warehouseBreakdown.jhb.available}
                                </div>
                            </div>
                            <div class="warehouse-item">
                                <div class="warehouse-name">CPT</div>
                                <div class="warehouse-stock ${product.warehouseBreakdown.cpt.available === 0 ? "zero" : ""}">
                                    ${product.warehouseBreakdown.cpt.available}
                                </div>
                            </div>
                            <div class="warehouse-item">
                                <div class="warehouse-name">BFN</div>
                                <div class="warehouse-stock ${product.warehouseBreakdown.bfn.available === 0 ? "zero" : ""}">
                                    ${product.warehouseBreakdown.bfn.available}
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="actions">
                        <select class="warehouse-select" id="warehouse-${product.sku}" style="margin-bottom: 8px; padding: 4px; border: 1px solid #e2e8f0; border-radius: 4px; width: 100%;">
                            <option value="">Select Warehouse</option>
                            ${product.warehouseBreakdown.jhb.available > 0 ? '<option value="JHB Warehouse">JHB Warehouse (' + product.warehouseBreakdown.jhb.available + " available)</option>" : ""}
                            ${product.warehouseBreakdown.cpt.available > 0 ? '<option value="CPT Warehouse">CPT Warehouse (' + product.warehouseBreakdown.cpt.available + " available)</option>" : ""}
                            ${product.warehouseBreakdown.bfn.available > 0 ? '<option value="BFN Warehouse">BFN Warehouse (' + product.warehouseBreakdown.bfn.available + " available)</option>" : ""}
                        </select>
                        <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                            <input type="number" id="qty-${product.sku}" min="1" value="1" style="width: 60px; padding: 4px; border: 1px solid #e2e8f0; border-radius: 4px;" />
                            <button class="btn btn-primary" onclick="addToCart('${product.sku}')" ${product.available === 0 ? "disabled" : ""} style="flex: 1;">
                                Add to Cart
                            </button>
                        </div>
                        <button class="btn btn-secondary" onclick="viewCart()" style="width: 100%;">
                            View Cart
                        </button>
                    </div>
                </div>
            `).join("")}
        </div>

        <div class="footer">
            <p>&copy; 2025 Reivilo B2B Portal - 45 Years of Family Business Values</p>
            <p style="margin-top: 0.5rem; font-size: 0.9rem;">Live data synced from inventory management system</p>
        </div>
    </div>

    <!-- Cart Modal -->
    <div id="cartModal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 1000;">
        <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 2rem; border-radius: 12px; width: 90%; max-width: 600px; max-height: 80vh; overflow-y: auto;">
            <h2 style="margin-bottom: 1rem; color: #1e3a8a;">Shopping Cart</h2>
            <div id="cartItems"></div>
            <div id="cartTotal" style="border-top: 2px solid #e2e8f0; padding-top: 1rem; margin-top: 1rem;"></div>
            <div style="display: flex; gap: 1rem; margin-top: 1.5rem;">
                <button class="btn btn-secondary" onclick="closeCart()" style="flex: 1;">Continue Shopping</button>
                <button class="btn btn-primary" onclick="showCheckout()" style="flex: 1;">Checkout</button>
            </div>
        </div>
    </div>

    <!-- Checkout Modal -->
    <div id="checkoutModal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 1001;">
        <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 2rem; border-radius: 12px; width: 90%; max-width: 500px;">
            <h2 style="margin-bottom: 1rem; color: #1e3a8a;">Complete Your Order</h2>
            <form id="checkoutForm">
                <div style="margin-bottom: 1rem;">
                    <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #1e40af;">Order Reference *</label>
                    <input type="text" id="orderReference" required placeholder="Enter your order reference" style="width: 100%; padding: 0.75rem; border: 1px solid #e2e8f0; border-radius: 6px;" />
                    <small style="color: #64748b;">This field is mandatory and will be used in your Cin7 quote</small>
                </div>
                <div style="margin-bottom: 1rem;">
                    <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #1e40af;">Company Name</label>
                    <input type="text" id="companyName" placeholder="Your company name" style="width: 100%; padding: 0.75rem; border: 1px solid #e2e8f0; border-radius: 6px;" />
                </div>
                <div style="display: flex; gap: 1rem; margin-top: 1.5rem;">
                    <button type="button" class="btn btn-secondary" onclick="closeCheckout()" style="flex: 1;">Cancel</button>
                    <button type="submit" class="btn btn-primary" style="flex: 1;">Place Order</button>
                </div>
            </form>
        </div>
    </div>

    <script>
        let cart = [];

        async function addToCart(sku) {
            const warehouse = document.getElementById('warehouse-' + sku).value;
            const quantity = parseInt(document.getElementById('qty-' + sku).value);
            
            if (!warehouse) {
                alert('Please select a warehouse');
                return;
            }
            
            try {
                const response = await fetch('/api/cart', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sku, quantity, warehouse, productId: 1 })
                });
                
                if (response.ok) {
                    alert('Item added to cart successfully!');
                    loadCart();
                } else {
                    const error = await response.json();
                    alert('Error: ' + error.error);
                }
            } catch (error) {
                alert('Error adding item to cart');
            }
        }

        async function loadCart() {
            try {
                const response = await fetch('/api/cart');
                const cartData = await response.json();
                cart = cartData.items;
                updateCartDisplay();
            } catch (error) {
                console.error('Error loading cart:', error);
            }
        }

        function updateCartDisplay() {
            const cartItems = document.getElementById('cartItems');
            const cartTotal = document.getElementById('cartTotal');
            
            if (cart.length === 0) {
                cartItems.innerHTML = '<p style="text-align: center; color: #64748b;">Your cart is empty</p>';
                cartTotal.innerHTML = '';
                return;
            }
            
            cartItems.innerHTML = cart.map(item => \`
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 1rem; border: 1px solid #e2e8f0; border-radius: 6px; margin-bottom: 0.5rem;">
                    <div>
                        <strong>\${item.sku}</strong><br>
                        <small>\${item.warehouse} \u2022 Qty: \${item.quantity}</small>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-weight: 600;">R \${(item.price * item.quantity).toFixed(2)}</div>
                        <button onclick="removeFromCart('\${item.id}')" style="color: #dc2626; background: none; border: none; cursor: pointer; font-size: 0.8rem;">Remove</button>
                    </div>
                </div>
            \`).join('');
            
            const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            cartTotal.innerHTML = \`
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <strong style="font-size: 1.2rem;">Total: R \${total.toFixed(2)}</strong>
                    <span style="color: #64748b;">(\${cart.length} items)</span>
                </div>
            \`;
        }

        async function removeFromCart(itemId) {
            try {
                const response = await fetch('/api/cart/' + itemId, { method: 'DELETE' });
                if (response.ok) {
                    loadCart();
                }
            } catch (error) {
                console.error('Error removing item:', error);
            }
        }

        function viewCart() {
            loadCart();
            document.getElementById('cartModal').style.display = 'block';
        }

        function closeCart() {
            document.getElementById('cartModal').style.display = 'none';
        }

        function showCheckout() {
            if (cart.length === 0) {
                alert('Your cart is empty');
                return;
            }
            document.getElementById('checkoutModal').style.display = 'block';
        }

        function closeCheckout() {
            document.getElementById('checkoutModal').style.display = 'none';
        }

        document.getElementById('checkoutForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const orderReference = document.getElementById('orderReference').value.trim();
            const companyName = document.getElementById('companyName').value.trim();
            
            if (!orderReference) {
                alert('Order reference is mandatory');
                return;
            }
            
            try {
                const response = await fetch('/api/checkout', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        orderReference,
                        customerDetails: { companyName }
                    })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    alert('Order placed successfully!\\n\\nOrder Reference: ' + result.orderReference + '\\nCin7 Quote ID: ' + result.cin7QuoteId + '\\nTotal: R ' + result.total + '\\n\\nYour order has been created as an unauthorized quote in Cin7.');
                    closeCheckout();
                    closeCart();
                    cart = [];
                    updateCartDisplay();
                } else {
                    alert('Error: ' + result.error);
                }
            } catch (error) {
                alert('Error placing order. Please try again.');
            }
        });

        // Search functionality
        function filterProducts() {
            const searchTerm = document.getElementById('productSearch').value.toLowerCase();
            const productCards = document.querySelectorAll('.product-card');
            let visibleCount = 0;
            
            productCards.forEach(card => {
                const name = card.querySelector('h3').textContent.toLowerCase();
                const sku = card.querySelector('.product-sku').textContent.toLowerCase();
                const description = card.querySelector('p') ? card.querySelector('p').textContent.toLowerCase() : '';
                
                if (name.includes(searchTerm) || sku.includes(searchTerm) || description.includes(searchTerm)) {
                    card.style.display = 'block';
                    visibleCount++;
                } else {
                    card.style.display = 'none';
                }
            });
            
            // Update stats
            document.querySelector('.stat-number').textContent = visibleCount;
            document.querySelector('.stat-label').textContent = visibleCount === 1 ? 'Product Found' : 'Products Found';
        }

        // Load cart on page load
        loadCart();
    </script>
</body>
</html>
    `);
    log(`Successfully generated product catalog with ${products2.length} live products`);
  } catch (error) {
    log(`Error generating catalog: ${error.message}`);
    res.status(500).send("Error loading product catalog");
  }
});
var cartStore = /* @__PURE__ */ new Map();
app.get("/api/cart", (req, res) => {
  const cartItems = Array.from(cartStore.values());
  const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const totalValue = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  res.json({
    items: cartItems,
    totalItems,
    totalValue: totalValue.toFixed(2),
    currency: "ZAR"
  });
});
app.post("/api/cart", (req, res) => {
  const { sku, quantity, warehouse, productId } = req.body;
  if (!sku || !quantity || !warehouse) {
    return res.status(400).json({ error: "SKU, quantity, and warehouse are required" });
  }
  const cartKey = `${sku}-${warehouse}`;
  const existingItem = cartStore.get(cartKey);
  if (existingItem) {
    existingItem.quantity += quantity;
  } else {
    cartStore.set(cartKey, {
      id: cartKey,
      sku,
      productId,
      quantity,
      warehouse,
      price: 299.99,
      // Would come from Cin7 pricing tiers
      currency: "ZAR",
      addedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
  log(`Added to cart: ${quantity}x ${sku} from ${warehouse}`);
  res.json({ success: true, message: "Item added to cart" });
});
app.delete("/api/cart/:id", (req, res) => {
  const { id } = req.params;
  const deleted = cartStore.delete(id);
  if (deleted) {
    log(`Removed from cart: ${id}`);
    res.json({ success: true, message: "Item removed from cart" });
  } else {
    res.status(404).json({ error: "Item not found in cart" });
  }
});
app.post("/api/checkout", async (req, res) => {
  try {
    const { orderReference, customerDetails, deliveryAddress } = req.body;
    if (!orderReference || orderReference.trim() === "") {
      return res.status(400).json({ error: "Order reference is mandatory and cannot be empty" });
    }
    const cartItems = Array.from(cartStore.values());
    if (cartItems.length === 0) {
      return res.status(400).json({ error: "Cart is empty" });
    }
    log(`Processing checkout for order reference: ${orderReference}`);
    const quoteData = {
      CustomerName: customerDetails?.companyName || "B2B Portal Customer",
      CustomerID: customerDetails?.id || null,
      Status: "UNAUTHORISED",
      // Ensures quote requires authorization in Cin7
      OrderNumber: orderReference,
      OrderDate: (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
      Note: `B2B Portal Order - Reference: ${orderReference}\\nCustomer: ${customerDetails?.companyName || "Unknown"}`,
      Lines: cartItems.map((item) => ({
        SKU: item.sku,
        Name: `Product ${item.sku}`,
        Quantity: item.quantity,
        Price: item.price,
        DropShip: false,
        // Map customer-facing warehouse to actual Cin7 location
        Location: item.warehouse.includes("JHB") ? "B-VDB" : item.warehouse.includes("CPT") ? "B-CPT" : "S-BFN"
      }))
    };
    log(`Creating unauthorized quote in Cin7: ${JSON.stringify(quoteData).substring(0, 200)}...`);
    const result = await corePost("/Sale", quoteData);
    cartStore.clear();
    log(`Successfully created unauthorized quote in Cin7. Quote ID: ${result.ID || "Unknown"}`);
    res.json({
      success: true,
      message: "Order placed successfully as unauthorized quote in Cin7",
      orderReference,
      cin7QuoteId: result.ID,
      items: cartItems.length,
      total: cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0).toFixed(2),
      status: "UNAUTHORISED"
    });
  } catch (error) {
    log(`Error processing checkout: ${error.message}`);
    res.status(500).json({
      success: false,
      error: "Failed to process order. Please try again.",
      details: error.message
    });
  }
});
app.use("/attached_assets", express.static(path.resolve(__dirname, "../attached_assets")));
var reactAppPath = path.resolve(__dirname, "public");
var reactIndexPath = path.join(reactAppPath, "index.html");
var reactAppExists = fs.existsSync(reactIndexPath);
if (reactAppExists) {
  log(`\u{1F5C2}\uFE0F Serving React app from: ${reactAppPath}`);
  app.use(express.static(reactAppPath));
  app.get("*", (req, res) => {
    if (!req.path.startsWith("/api") && !req.path.startsWith("/app")) {
      log(`\u{1F4C4} Serving React app for route: ${req.path}`);
      res.sendFile(reactIndexPath);
    } else if (req.path.startsWith("/api")) {
      res.status(404).send("API route not found");
    }
  });
} else {
  log(`\u26A0\uFE0F React app not found - deployment may be incomplete`);
  app.get("*", (req, res) => {
    if (!req.path.startsWith("/api") && !req.path.startsWith("/app")) {
      res.status(503).send(`
        <html>
          <head><title>Reivilo B2B Portal</title></head>
          <body style="font-family: Arial; text-align: center; padding: 50px;">
            <h1>React App Loading...</h1>
            <p>The React application is being deployed. Please refresh in a moment.</p>
            <p>If this message persists, the build may be incomplete.</p>
          </body>
        </html>
      `);
    } else if (req.path.startsWith("/api")) {
      res.status(404).send("API route not found");
    }
  });
}
var port = parseInt(process.env.PORT || "5000", 10);
app.listen(port, "0.0.0.0", () => {
  log(`\u{1F680} Reivilo B2B Portal running on port ${port}`);
  log(`\u{1F4C8} 45 Years of Family Business Values Since 1980`);
  log(`\u{1F310} Visit: http://localhost:${port}`);
  log(`\u{1F9EA} Test App: http://localhost:${port}/app`);
});
