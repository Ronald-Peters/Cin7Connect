import axios, { AxiosInstance, AxiosError } from "axios";

/** Dear Systems (Cin7 Core) client */
interface Cin7Config {
  baseURL: string;
  accountId: string;
  appKey: string;
}

interface Cin7Location {
  ID?: string;
  Name?: string;
  LocationName?: string;
}

export interface Cin7Product {
  SKU: string;
  Name?: string;
  Barcode?: string;
  Brand?: string;
  Category?: string;
  DefaultSellPrice?: string;
  ImageURL?: string;
  LastModified?: string;
}

interface Cin7Availability {
  SKU: string;
  Name?: string;
  OnHand?: number;
  Allocated?: number;
  Available?: number;
  OnOrder?: number;
  LastModified?: string;
}

interface Cin7Customer {
  ID?: string;
  CustomerCode?: string;
  Name?: string;
  CompanyName?: string;
  PaymentTerms?: string;
  Terms?: string;
  PriceTier?: string;
  CustomerGroup?: string;
  Addresses?: any[];
  Address?: any;
  Contacts?: any[];
  ContactPerson?: string;
  Email?: string;
  Phone?: string;
  LastModified?: string;
}

interface Cin7SaleLine {
  SKU: string;
  Quantity: number;
  Price?: number;
  TaxRule?: string;
}

interface Cin7Sale {
  Customer?: string;
  CustomerID?: string;
  PriceTier?: string;
  Location?: string;
  OrderStatus?: string; // "NOTAUTHORISED" to create a quote
  Lines?: Cin7SaleLine[];
}

export class Cin7Service {
  private client: AxiosInstance;
  private config: Cin7Config;

  constructor() {
    this.config = {
      baseURL:
        process.env.CIN7_BASE_URL ||
        "https://inventory.dearsystems.com/externalapi/v2/",
      accountId: process.env.CIN7_ACCOUNT_ID || "",
      appKey: process.env.CIN7_APP_KEY || "",
    };

    if (!this.config.accountId || !this.config.appKey) {
      console.warn(
        "CIN7_ACCOUNT_ID and CIN7_APP_KEY environment variables are not set"
      );
    }

    this.client = axios.create({
      baseURL: this.config.baseURL,
      headers: {
        "api-auth-accountid": this.config.accountId,
        "api-auth-applicationkey": this.config.appKey,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      timeout: 30000,
    });

    // Retry transient failures (1s, 2s, 4s)
    this.client.interceptors.response.use(
      (resp) => resp,
      async (error: AxiosError) => {
        const cfg = error.config as any;
        if (!cfg) throw this.formatError(error);
        cfg.__retryCount = cfg.__retryCount || 0;
        if (cfg.__retryCount >= 3) throw this.formatError(error);
        cfg.__retryCount++;
        await new Promise((r) => setTimeout(r, Math.pow(2, cfg.__retryCount) * 1000));
        return this.client(cfg);
      }
    );
  }

  private formatError(error: AxiosError): Error {
    if (error.response) {
      const { status, data } = error.response;
      const message =
        (data as any)?.ErrorMessage ||
        (data as any)?.message ||
        `HTTP ${status} error`;
      const err = new Error(`Cin7 API Error: ${message}`);
      (err as any).status = status;
      (err as any).data = data;
      return err;
    } else if (error.request) {
      return new Error("Cin7 API Error: No response received");
    } else {
      return new Error(`Cin7 API Error: ${error.message}`);
    }
  }

  /** Smoke test: should succeed if creds/baseURL are correct */
  async testConnection(): Promise<boolean> {
    console.log(`🔗 Testing connection to: ${this.config.baseURL}`);
    console.log(`🔑 Using Account ID: ${this.config.accountId ? 'SET' : 'NOT SET'}`);
    console.log(`🔑 Using App Key: ${this.config.appKey ? 'SET' : 'NOT SET'}`);
    
    try {
      // Test with the working ProductAvailability endpoint first
      console.log(`📊 Testing with working ProductAvailability endpoint...`);
      const resp = await this.client.post("ProductAvailability", { Page: 1, Limit: 1 });
      
      if (typeof resp.data === 'string' && resp.data.includes('<!DOCTYPE html>')) {
        throw new Error('ProductAvailability returned HTML - auth/URL issue');
      }
      
      console.log(`✅ ProductAvailability works! Response type: ${typeof resp.data}`);
      return true;
    } catch (error: any) {
      console.log(`❌ ProductAvailability failed: ${error.message}`);
      throw error;
    }
  }

  // ---------- Warehouses (Dear/Core) ----------

  /** Primary method */
  async getLocations(): Promise<Cin7Location[]> {
    console.log(`🏭 Fetching warehouses from Cin7...`);
    
    // Try the most common Cin7 Core endpoints for warehouses
    const endpoints = ["Ref/Warehouse", "ref/Warehouse", "Warehouse"];
    
    for (const endpoint of endpoints) {
      try {
        console.log(`🔄 Trying warehouse endpoint: ${endpoint}`);
        const resp = await this.client.post(endpoint, {
          Page: 1,
          Limit: 500,
        });
        
        // Check if we got HTML response
        if (typeof resp.data === 'string' && resp.data.includes('<!DOCTYPE html>')) {
          console.log(`❌ ${endpoint} returned HTML - trying next endpoint`);
          continue;
        }
        
        console.log(`✅ ${endpoint} worked! Found ${(resp.data as any[])?.length || 0} warehouses`);
        return (resp.data as any[]) || [];
      } catch (error: any) {
        console.log(`❌ ${endpoint} failed: ${error.message}`);
        // Continue to next endpoint
      }
    }
    
    throw new Error('All warehouse endpoints failed - check Cin7 Core API documentation');
  }

  /** Back-compat alias for routes.ts */
  async getWarehouses(): Promise<Cin7Location[]> {
    return this.getLocations();
  }

  // ---------- Products (Dear/Core) ----------

  /**
   * Products list using correct Cin7 Core POST endpoint
   * Params: Search (optional), Page, Limit
   * Returns a plain array for your routes.
   */
  async getProducts(options?: {
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<Cin7Product[]> {
    const page = options?.page ?? 1;
    const limit = Math.min(options?.limit ?? 50, 500);
    const search = (options?.search || "").trim();

    console.log(`🔍 Fetching products from Cin7 using POST endpoints (trying multiple Cin7 Core formats)`);
    
    try {
      // Use POST method with request body - this is the correct Cin7 Core format
      const requestBody: any = {
        Page: page,
        Limit: limit
      };
      
      if (search) {
        requestBody.Search = search;
      }
      
      // Try the most common Cin7 Core endpoints for products
      const endpoints = ["product", "Product", "products", "Products", "me/Product", "productlist"];
      let resp: any;
      
      for (const endpoint of endpoints) {
        try {
          console.log(`🔄 Trying product endpoint: ${endpoint}`);
          resp = await this.client.post(endpoint, requestBody);
          
          // Check if we got HTML response
          if (typeof resp.data === 'string' && resp.data.includes('<!DOCTYPE html>')) {
            console.log(`❌ ${endpoint} returned HTML - trying next endpoint`);
            continue;
          }
          
          console.log(`✅ ${endpoint} worked!`);
          break;
        } catch (error: any) {
          console.log(`❌ ${endpoint} failed: ${error.message}`);
          if (endpoints.indexOf(endpoint) === endpoints.length - 1) {
            throw error; // Last endpoint, throw the error
          }
          // Continue to next endpoint
        }
      }
      
      console.log(`✅ Successfully fetched products from Cin7`);
      console.log(`📊 Response type: ${typeof resp.data}, length: ${Array.isArray(resp.data) ? resp.data.length : 'N/A'}`);
      console.log(`🔍 Response headers:`, JSON.stringify(resp.headers || {}, null, 2));
      
      // Validate we got JSON response, not HTML
      if (typeof resp.data === 'string' && resp.data.includes('<!DOCTYPE html>')) {
        throw new Error('Received HTML response instead of JSON - check API endpoint and credentials');
      }
      
      console.log("Cin7 Products API Response (first 500 chars):", JSON.stringify(resp.data, null, 2).substring(0, 500) + '...');
      
      // Handle different response formats from Cin7 API
      let raw: any[] = [];
      if (Array.isArray(resp.data)) {
        raw = resp.data;
      } else if (resp.data && Array.isArray(resp.data.Products)) {
        raw = resp.data.Products;
      } else if (resp.data && typeof resp.data === 'object') {
        // If it's an object, try to extract array from common property names
        raw = resp.data.data || resp.data.items || resp.data.results || [];
        
        // If still empty, log the actual structure we received
        if (raw.length === 0) {
          console.log('🔍 Response structure:', Object.keys(resp.data || {}));
          console.log('🔍 Full response (limited):', JSON.stringify(resp.data, null, 2).substring(0, 1000));
        }
      }

      console.log(`Processing ${raw.length} products from Cin7`);
      
      // Map product data from Cin7 API response
      return raw.map((p: any) => ({
        SKU: p?.SKU ?? p?.Sku ?? "",
        Name: p?.Name || p?.SKU,
        Barcode: p?.Barcode || "",
        Brand: p?.Brand || "", 
        Category: p?.Category || "",
        DefaultSellPrice: p?.DefaultSellPrice || "0",
        ImageURL: p?.ImageURL || p?.Image || "",
        LastModified: p?.LastModified,
      }));
      
    } catch (error: any) {
      console.error(`❌ Failed to fetch products from Cin7:`, error.message);
      
      // Enhanced error logging for debugging
      if (error.response) {
        console.error(`HTTP Status: ${error.response.status}`);
        console.error(`Content-Type: ${error.response.headers?.['content-type']}`);
        
        if (error.response.data && typeof error.response.data === 'string' && error.response.data.includes('<!DOCTYPE html>')) {
          console.error('❌ Received HTML response - likely wrong endpoint or authentication issue');
          console.error('Response preview:', error.response.data.substring(0, 200) + '...');
        } else {
          console.error("Error response data:", JSON.stringify(error.response.data, null, 2));
        }
      }
      
      throw this.formatError(error);
    }
  }

  // (Optional) Availability – leave as-is until you pick a Dear report
  async getProductAvailability(
    location: string,
    page = 1,
    limit = 500
  ): Promise<{ data: Cin7Availability[]; pagination: any }> {
    const body = { Location: location, Page: page, Limit: Math.min(limit, 500) };
    const resp = await this.client.post("ProductAvailability", body);
    return {
      data: (resp.data as any[]) || [],
      pagination: {
        page,
        limit,
        total: (resp.headers && (resp.headers as any)["x-total-count"]) || 0,
      },
    };
  }

  // ---------- Customers (unchanged) ----------

  async getCustomers(
    page = 1,
    limit = 500
  ): Promise<{ data: Cin7Customer[]; pagination: any }> {
    const resp = await this.client.post("Customer", {
      Page: page,
      Limit: Math.min(limit, 500),
    });
    return {
      data: (resp.data as any[]) || [],
      pagination: {
        page,
        limit,
        total: (resp.headers && (resp.headers as any)["x-total-count"]) || 0,
      },
    };
  }

  // ---------- Quotes (Sale with NOTAUTHORISED) ----------

  async createQuote(saleData: Cin7Sale): Promise<any> {
    const payload = { ...saleData, OrderStatus: "NOTAUTHORISED" };
    const resp = await this.client.post("Sale", payload);
    return resp.data;
  }
}

export const cin7Service = new Cin7Service();
