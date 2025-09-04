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
    await this.client.get("/Ref/Warehouse", { params: { Page: 1, Limit: 1 } });
    return true;
  }

  // ---------- Warehouses (Dear/Core) ----------

  /** Primary method */
  async getLocations(): Promise<Cin7Location[]> {
    const resp = await this.client.get("/Ref/Warehouse", {
      params: { Page: 1, Limit: 500 },
    });
    return (resp.data as any[]) || [];
  }

  /** Back-compat alias for routes.ts */
  async getWarehouses(): Promise<Cin7Location[]> {
    return this.getLocations();
  }

  // ---------- Products (Dear/Core) ----------

  /**
   * Products list
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

    const params: any = { Page: page, Limit: limit };
    if (search) params.Search = search;

    const resp = await this.client.get("/Ref/Product", { params });
    const raw = (resp.data as any[]) || [];

    return raw.map((p: any) => ({
      SKU: p?.SKU ?? p?.Sku ?? "",
      Name: p?.Name,
      Barcode: p?.Barcode,
      Brand: p?.Brand,
      Category: p?.Category,
      DefaultSellPrice: p?.DefaultSellPrice,
      ImageURL: p?.ImageURL || p?.Image,
      LastModified: p?.LastModified,
    }));
  }

  // (Optional) Availability – leave as-is until you pick a Dear report
  async getProductAvailability(
    location: string,
    page = 1,
    limit = 500
  ): Promise<{ data: Cin7Availability[]; pagination: any }> {
    const params = { location, page, limit: Math.min(limit, 500) };
    const resp = await this.client.get("/ProductAvailability", { params });
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
    const resp = await this.client.get("/Customers", {
      params: { Page: page, Limit: Math.min(limit, 500) },
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
    const resp = await this.client.post("/Sale", payload);
    return resp.data;
  }
}

export const cin7Service = new Cin7Service();
