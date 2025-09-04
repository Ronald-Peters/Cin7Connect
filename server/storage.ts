import { users, customers, products, warehouses, availability, quotes, type User, type InsertUser, type Customer, type Product, type Warehouse, type Availability, type Quote } from "@shared/schema";
import { db } from "./db";
import { eq, ilike, and, desc, asc, sql } from "drizzle-orm";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { pool } from "./db";

const PostgresSessionStore = connectPg(session);

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: any): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User | undefined>;
  getAllActiveCustomers(): Promise<Customer[]>;
  getAllCustomers(): Promise<Customer[]>;
  updateCustomer(id: number, updates: Partial<Customer>): Promise<Customer | undefined>;
  updateCustomerStatus(id: string, active: boolean): Promise<void>;
  createCustomer(customer: Partial<Customer>): Promise<Customer>;
  syncCin7Customers(): Promise<void>;
  
  // Admin user methods
  getAllAdminUsers(): Promise<User[]>;
  createAdminUser(user: any): Promise<User>;
  deleteAdminUser(id: string): Promise<boolean>;
  
  // Customer methods
  getCustomerById(id: number): Promise<Customer | undefined>;
  getCustomerByErpId(erpId: string): Promise<Customer | undefined>;
  upsertCustomer(customer: Partial<Customer>): Promise<Customer>;
  
  // Product methods
  getProducts(search?: string, page?: number, pageSize?: number): Promise<{ products: Product[], total: number }>;
  getProductById(id: number): Promise<Product | undefined>;
  getProductBySku(sku: string): Promise<Product | undefined>;
  upsertProduct(product: Partial<Product>): Promise<Product>;
  
  // Warehouse methods
  getWarehouses(): Promise<Warehouse[]>;
  getWarehouseById(id: number): Promise<Warehouse | undefined>;
  upsertWarehouse(warehouse: Partial<Warehouse>): Promise<Warehouse>;
  
  // Availability methods
  getAvailabilityByProductIds(productIds: number[]): Promise<(Availability & { warehouse: Warehouse })[]>;
  upsertAvailability(availability: Partial<Availability>): Promise<Availability>;
  
  // Quote methods
  createQuote(quote: Partial<Quote>): Promise<Quote>;
  getQuotesByCustomerId(customerId: number): Promise<Quote[]>;
  
  sessionStore: session.Store;
}

export class DatabaseStorage implements IStorage {
  sessionStore: session.Store;

  constructor() {
    this.sessionStore = new PostgresSessionStore({ 
      pool, 
      createTableIfMissing: true 
    });
  }

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async createUser(userData: any): Promise<User> {
    const insertData: any = {
      email: userData.email,
      password: userData.password,
      customerId: userData.customerId || null,
      role: userData.role || 'buyer',
      createdBy: userData.createdBy || null,
      isActive: true,
    };
    
    const result: any = await db.insert(users).values(insertData).returning();
    return result[0];
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, id))
      .returning();
    return user || undefined;
  }

  async getAllActiveCustomers(): Promise<Customer[]> {
    return await db.select().from(customers).orderBy(asc(customers.companyName));
  }

  async getAllCustomers(): Promise<Customer[]> {
    return await db.select().from(customers).orderBy(asc(customers.companyName));
  }

  async createCustomer(customerData: Partial<Customer>): Promise<Customer> {
    const [created] = await db
      .insert(customers)
      .values(customerData as any)
      .returning();
    return created;
  }

  async updateCustomerStatus(id: string, active: boolean): Promise<void> {
    await db
      .update(customers)
      .set({ isActive: active })
      .where(eq(customers.id, parseInt(id)));
  }

  async updateCustomer(id: number, updates: Partial<Customer>): Promise<Customer | undefined> {
    const [customer] = await db
      .update(customers)
      .set(updates)
      .where(eq(customers.id, id))
      .returning();
    return customer || undefined;
  }

  async syncCin7Customers(): Promise<void> {
    // This will be called from server to sync customers from Cin7
    // Implementation will fetch all customers from Cin7 and upsert them
  }

  async syncCin7Products(): Promise<{ synced: number; errors: number }> {
    try {
      console.log('🔄 Starting Cin7 product sync...');
      
      // Use the exact same logic as the working demo catalog
      const { cin7Service } = await import('./services/cin7');
      
      // Get availability data (this works!)
      const locations = ['S-CPT', 'S-BFN', 'B-VDB']; // JHB, CPT, BFN
      let allAvailability: any[] = [];
      
      for (const location of locations) {
        const { data } = await cin7Service.getProductAvailability(location, 1, 1000);
        if (Array.isArray(data)) {
          allAvailability.push(...data);
        }
      }
      
      // Get pricing data (this works!)
      const allProducts = await cin7Service.getProducts({ page: 1, limit: 1000 });
      
      // Create pricing map
      const pricingMap = new Map();
      if (Array.isArray(allProducts)) {
        allProducts.forEach((product: any) => {
          if (product.SKU) {
            pricingMap.set(product.SKU, {
              price: parseFloat(product.DefaultSellPrice || '0'),
              name: product.Name,
              category: product.Category,
              description: product.Description,
              barcode: product.Barcode,
              brand: product.Brand
            });
          }
        });
      }
      
      // Get unique SKUs from availability data
      const uniqueSkus = Array.from(new Set(allAvailability.map(item => item.SKU).filter(Boolean)));
      
      let synced = 0;
      let errors = 0;
      
      console.log(`📦 Processing ${uniqueSkus.length} unique SKUs from availability data`);
      
      for (const sku of uniqueSkus) {
        try {
          const pricing = pricingMap.get(sku);
          
          await this.upsertProduct({
            sku: sku,
            name: pricing?.name || sku,
            barcode: pricing?.barcode,
            brand: pricing?.brand,
            imageUrl: null,
          });
          synced++;
        } catch (error) {
          console.error(`Error syncing product ${sku}:`, error);
          errors++;
        }
      }
      
      console.log(`✅ Cin7 product sync complete: ${synced} synced, ${errors} errors`);
      return { synced, errors };
    } catch (error) {
      console.error('❌ Cin7 product sync failed:', error);
      return { synced: 0, errors: 1 };
    }
  }

  async getCustomerById(id: number): Promise<Customer | undefined> {
    const [customer] = await db.select().from(customers).where(eq(customers.id, id));
    return customer || undefined;
  }

  async getCustomerByErpId(erpId: string): Promise<Customer | undefined> {
    const [customer] = await db.select().from(customers).where(eq(customers.erpCustomerId, erpId));
    return customer || undefined;
  }

  async upsertCustomer(customerData: Partial<Customer>): Promise<Customer> {
    if (customerData.id) {
      const [updated] = await db
        .update(customers)
        .set(customerData)
        .where(eq(customers.id, customerData.id))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(customers)
        .values(customerData as any)
        .returning();
      return created;
    }
  }

  async getProducts(search?: string, page = 1, pageSize = 50): Promise<{ products: Product[], total: number }> {
    const offset = (page - 1) * pageSize;
    
    let whereCondition = undefined;
    if (search) {
      whereCondition = ilike(products.name, `%${search}%`);
    }
    
    const [productsResult, countResult] = await Promise.all([
      db.select().from(products)
        .where(whereCondition)
        .orderBy(asc(products.name))
        .limit(pageSize)
        .offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(products).where(whereCondition),
    ]);
    
    return {
      products: productsResult,
      total: countResult[0]?.count || 0,
    };
  }

  async getProductById(id: number): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.id, id));
    return product || undefined;
  }

  async getProductBySku(sku: string): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.sku, sku));
    return product || undefined;
  }

  async upsertProduct(productData: Partial<Product>): Promise<Product> {
    if (productData.sku) {
      const existing = await this.getProductBySku(productData.sku);
      if (existing) {
        const [updated] = await db
          .update(products)
          .set(productData)
          .where(eq(products.sku, productData.sku))
          .returning();
        return updated;
      }
    }
    
    const [created] = await db
      .insert(products)
      .values(productData as any)
      .returning();
    return created;
  }

  async getWarehouses(): Promise<Warehouse[]> {
    return await db.select().from(warehouses).orderBy(asc(warehouses.cin7LocationName));
  }

  async getWarehouseById(id: number): Promise<Warehouse | undefined> {
    const [warehouse] = await db.select().from(warehouses).where(eq(warehouses.id, id));
    return warehouse || undefined;
  }

  async upsertWarehouse(warehouseData: Partial<Warehouse>): Promise<Warehouse> {
    if (warehouseData.cin7LocationName) {
      const [existing] = await db.select().from(warehouses).where(eq(warehouses.cin7LocationName, warehouseData.cin7LocationName));
      if (existing) {
        const [updated] = await db
          .update(warehouses)
          .set(warehouseData)
          .where(eq(warehouses.cin7LocationName, warehouseData.cin7LocationName))
          .returning();
        return updated;
      }
    }
    
    const [created] = await db
      .insert(warehouses)
      .values(warehouseData as any)
      .returning();
    return created;
  }

  async getAvailabilityByProductIds(productIds: number[]): Promise<(Availability & { warehouse: Warehouse })[]> {
    if (productIds.length === 0) return [];
    
    return await db
      .select({
        productId: availability.productId,
        warehouseId: availability.warehouseId,
        onHand: availability.onHand,
        allocated: availability.allocated,
        available: availability.available,
        onOrder: availability.onOrder,
        warehouse: warehouses,
      })
      .from(availability)
      .innerJoin(warehouses, eq(availability.warehouseId, warehouses.id))
      .where(sql`${availability.productId} = ANY(ARRAY[${productIds.join(',')}])`);
  }

  async upsertAvailability(availabilityData: Partial<Availability>): Promise<Availability> {
    if (availabilityData.productId && availabilityData.warehouseId) {
      const [existing] = await db
        .select()
        .from(availability)
        .where(
          and(
            eq(availability.productId, availabilityData.productId),
            eq(availability.warehouseId, availabilityData.warehouseId)
          )
        );
      
      if (existing) {
        const [updated] = await db
          .update(availability)
          .set(availabilityData)
          .where(
            and(
              eq(availability.productId, availabilityData.productId),
              eq(availability.warehouseId, availabilityData.warehouseId)
            )
          )
          .returning();
        return updated;
      }
    }
    
    const [created] = await db
      .insert(availability)
      .values(availabilityData as any)
      .returning();
    return created;
  }

  async createQuote(quoteData: Partial<Quote>): Promise<Quote> {
    const [quote] = await db
      .insert(quotes)
      .values(quoteData as any)
      .returning();
    return quote;
  }

  async getQuotesByCustomerId(customerId: number): Promise<Quote[]> {
    // This would need to be implemented with proper user tracking in quotes
    return [];
  }

  // Admin user methods
  async getAllAdminUsers(): Promise<User[]> {
    return await db.select().from(users).where(eq(users.role, 'admin')).orderBy(asc(users.email));
  }

  async createAdminUser(userData: any): Promise<User> {
    const insertData: any = {
      email: userData.email,
      password: userData.password,
      name: userData.name,
      customerId: null,
      role: 'admin',
      isActive: true,
    };
    
    const result: any = await db.insert(users).values(insertData).returning();
    return result[0];
  }

  async deleteAdminUser(id: string): Promise<boolean> {
    const result = await db.delete(users).where(eq(users.id, id)).returning();
    return Array.isArray(result) && result.length > 0;
  }
}

export const storage = new DatabaseStorage();
