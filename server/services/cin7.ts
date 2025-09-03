// services/cin7.ts
import axios, { AxiosInstance, AxiosError } from "axios";

/**
 * Cin7 Core (Dear Systems) REST client
 * Docs: https://inventory.dearsystems.com/ExternalApi
 */

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
        "https://inventory.dearsystems.com/ExternalApi",
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
      },
      timeout: 30000,
    });

    // Simple retry with exponential backoff (1s, 2s, 4s) for transient errors.
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const cfg = error.config as any;
        if (!cfg) throw this.formatError(error);

        cfg.__retryCount = cfg.__retryCount || 0;
        if (cfg.__retryCount >= 3) throw this.formatError(error);

        cfg.__retryCount++;
        const delayMs = Math.pow(2, cfg.__retryCount) * 1000;
        await new Promise((r) => setTimeout(r, delayMs));
        return this.client(cfg);
      }
    );
  }

  // ---------- Helpers ----------

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

  // Use a simple call that should always succeed if creds are correct.
  async testConnection(): Promise<boolean> {
    try {
      // Dear/Core: warehouses live under /Ref/Warehouse
      await this.client.get("/Ref/Warehouse", { params: { Page: 1, Limit: 1 } });
      return true;
    } catch (error) {
      throw this.formatError(error as AxiosError);
    }
  }

  // ---------- Warehouses ----------

  // UPDATED: Dear/Core endpoint for locations/warehouses
  async getLocations(): Promise<Cin7Location[]> {
    try {
      const response = await this.client.get("/Ref/Warehouse", {
        params: { Page: 1, Limit: 500 },
      });
      // Dear usually returns an array payload (not wrapped)
      return (response.data as any[]) || [];
    } catch (error) {
      throw this.formatError(error as AxiosError);
    }
  }

  // ---------- Products ----------

  /**
   * UPDATED: Dear/Core products endpoint.
   * - Endpoint: /Ref/Product
   * - Params: Search?, Page, Limit
   * Returns a plain array so your routes.ts can do:
   *   items: products, total: products.length
   */
  async getProducts(options?: {
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<Cin7Product[]> {
    const page = options?.page ?? 1;
    const limit = Math.min(options?.limit ?? 50, 500);
    const search = (options?.search || "").trim();

    try {
      const params: any = { Page: page, Limit: limit };
      if (search) params.Search = search;

      const response = await this.client.get("/Ref/Product", { params });
      // Dear returns an array of product objects
      const raw = (response.data as any[]) || [];

      // Light normalization to the fields you use in UI
      const products: Cin7Product[] = raw.map((p: any) => ({
        SKU: p?.SKU ?? p?.Sku ?? "",
        Name: p?.Name,
        Barcode: p?.Barcode,
        Brand: p?.Brand,
        LastModified: p?.LastModified,
      }));

      return products;
    } catch (error) {
      throw this.formatError(error as AxiosError);
    }
  }

  // (Optional) Availability — left as-is; adapt when you decide which Dear report you’ll use
  async getProductAvailability(
    location: string,
    page = 1,
    limit = 500
  ): Promise<{ data: Cin7Availability[]; pagination: any }> {
    try {
      // Placeholder – availability/report endpoints differ in Dear.
      // Keep existing shape so calling code doesn’t break.
      const params = { location, page, limit: Math.min(limit, 500) };
      const response = await this.client.get("/ProductAvailability", { params });
      return {
        data: (response.data as any[]) || [],
        pagination: {
          page,
          limit,
          total: (response.headers && (response.headers as any)["x-total-count"]) || 0,
        },
      };
    } catch (error) {
      throw this.formatError(error as AxiosError);
    }
  }

  // ---------- Customers (unchanged) ----------

  async getCustomers(
    page = 1,
    limit = 500
  ): Promise<{ data: Cin7Customer[]; pagination: any }> {
    try {
      const params = { Page: page, Limit: Math.min(limit, 500) };
      const response = await this.client.get("/Customers", { params });
      return {
        data: (response.data as any[]) || [],
        pagination: {
          page,
          limit,
          total: (response.headers && (response.headers as any)["x-total-count"]) || 0,
        },
      };
    } catch (error) {
      throw this.formatError(error as AxiosError);
    }
  }

  // ---------- Quotes (Sale with NOTAUTHORISED) ----------

  async createQuote(saleData: Cin7Sale): Promise<any> {
    try {
      const payload = { ...saleData, OrderStatus: "NOTAUTHORISED" };
      const response = await this.client.post("/Sale", payload);
      return response.data;
    } catch (error) {
      throw this.formatError(error as AxiosError);
    }
  }
}

export const cin7Service = new Cin7Service();
