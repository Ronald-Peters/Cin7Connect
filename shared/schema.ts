import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, numeric, jsonb, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table for authentication
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  customerId: integer("customer_id").references(() => customers.id),
  role: text("role").default("buyer"), // 'admin', 'buyer'
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  createdBy: varchar("created_by").references(() => users.id),
});

// Customers (cached from Cin7)
export const customers = pgTable("customers", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  erpCustomerId: text("erp_customer_id").unique(),
  companyName: text("company_name"),
  terms: text("terms"),
  priceTier: text("price_tier"),
  defaultAddress: text("default_address"),
  billingAddress: text("billing_address"),
  shippingAddress: text("shipping_address"),
  contacts: jsonb("contacts"),
  isActive: boolean("is_active").default(false), // Admin must activate
  allowPortalAccess: boolean("allow_portal_access").default(false),
  syncedAt: timestamp("synced_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Products (cached from Cin7)
export const products = pgTable("products", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  sku: text("sku").unique().notNull(),
  name: text("name"),
  barcode: text("barcode"),
  brand: text("brand"),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Warehouses (cached from Cin7)
export const warehouses = pgTable("warehouses", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  cin7LocationName: text("cin7_location_name").unique().notNull(),
});

// Product availability per warehouse
export const availability = pgTable("availability", {
  productId: integer("product_id").references(() => products.id, { onDelete: "cascade" }),
  warehouseId: integer("warehouse_id").references(() => warehouses.id, { onDelete: "cascade" }),
  onHand: numeric("on_hand").default("0"),
  allocated: numeric("allocated").default("0"),
  available: numeric("available").default("0"),
  onOrder: numeric("on_order").default("0"),
}, (table) => ({
  pk: sql`PRIMARY KEY (${table.productId}, ${table.warehouseId})`,
}));

// Quotes (app-native)
export const quotes = pgTable("quotes", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  erpSaleId: text("erp_sale_id"),
  status: text("status"),
  payload: jsonb("payload"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ one }) => ({
  customer: one(customers, { fields: [users.customerId], references: [customers.id] }),
}));

export const customersRelations = relations(customers, ({ many }) => ({
  users: many(users),
}));

export const productsRelations = relations(products, ({ many }) => ({
  availability: many(availability),
}));

export const warehousesRelations = relations(warehouses, ({ many }) => ({
  availability: many(availability),
}));

export const availabilityRelations = relations(availability, ({ one }) => ({
  product: one(products, { fields: [availability.productId], references: [products.id] }),
  warehouse: one(warehouses, { fields: [availability.warehouseId], references: [warehouses.id] }),
}));

// Schemas
export const insertUserSchema = createInsertSchema(users).pick({
  email: true,
  password: true,
});

export const insertCustomerSchema = createInsertSchema(customers);
export const insertProductSchema = createInsertSchema(products);
export const insertWarehouseSchema = createInsertSchema(warehouses);
export const insertAvailabilitySchema = createInsertSchema(availability);
export const insertQuoteSchema = createInsertSchema(quotes);

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Warehouse = typeof warehouses.$inferSelect;
export type Availability = typeof availability.$inferSelect;
export type Quote = typeof quotes.$inferSelect;
