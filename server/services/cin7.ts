import axios, { AxiosInstance, AxiosError } from 'axios';

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

interface Cin7Product {
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

interface Cin7Sale {
  Customer?: string;
  CustomerID?: string;
  PriceTier?: string;
  Location?: string;
  OrderStatus?: string;
  Lines?: Cin7SaleLine[];
}

interface Cin7SaleLine {
  SKU: string;
  Quantity: number;
  Price?: number;
  TaxRule?: string;
}

export class Cin7Service {
  private client: AxiosInstance;
  private config: Cin7Config;

  constructor() {
    this.config = {
      baseURL: process.env.CIN7_BASE_URL || 'https://inventory.dearsystems.com/externalapi/v2',
      accountId: process.env.CIN7_ACCOUNT_ID || '',
      appKey: process.env.CIN7_APP_KEY || '',
    };

    if (!this.config.accountId || !this.config.appKey) {
      console.warn('CIN7_ACCOUNT_ID and CIN7_APP_KEY environment variables are not set');
    }

    this.client = axios.create({
      baseURL: this.config.baseURL,
      headers: {
        'api-auth-accountid': this.config.accountId,
        'api-auth-applicationkey': this.config.appKey,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    // Add retry logic with exponential backoff
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const config = error.config as any;
        
        if (!config || config.__retryCount >= 3) {
          throw this.formatError(error);
        }

        config.__retryCount = config.__retryCount || 0;
        config.__retryCount++;

        const delay = Math.pow(2, config.__retryCount) * 1000; // 1s, 2s, 4s
        await new Promise(resolve => setTimeout(resolve, delay));

        return this.client(config);
      }
    );
  }

  private formatError(error: AxiosError): Error {
    if (error.response) {
      const { status, data } = error.response;
      const message = (data as any)?.ErrorMessage || (data as any)?.message || `HTTP ${status} error`;
      const err = new Error(`Cin7 API Error: ${message}`);
      (err as any).status = status;
      (err as any).data = data;
      return err;
    } else if (error.request) {
      return new Error('Cin7 API Error: No response received');
    } else {
      return new Error(`Cin7 API Error: ${error.message}`);
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.client.get('/Locations', { 
        params: { limit: 1 } 
      });
      return true;
    } catch (error) {
      throw this.formatError(error as AxiosError);
    }
  }

  async getLocations(): Promise<Cin7Location[]> {
    try {
      const response = await this.client.get('/Locations');
      return response.data || [];
    } catch (error) {
      throw this.formatError(error as AxiosError);
    }
  }

  async getProductAvailability(location: string, page = 1, limit = 500): Promise<{ data: Cin7Availability[], pagination: any }> {
    try {
      const params = {
        location,
        page,
        limit: Math.min(limit, 500),
      };
      
      const response = await this.client.get('/ProductAvailability', { params });
      return {
        data: response.data || [],
        pagination: {
          page,
          limit,
          total: response.headers['x-total-count'] || 0
        }
      };
    } catch (error) {
      throw this.formatError(error as AxiosError);
    }
  }

  async getProducts(page = 1, limit = 500): Promise<{ data: Cin7Product[], pagination: any }> {
    try {
      const params = {
        page,
        limit: Math.min(limit, 500)
      };
      
      const response = await this.client.get('/Products', { params });
      return {
        data: response.data || [],
        pagination: {
          page,
          limit,
          total: response.headers['x-total-count'] || 0
        }
      };
    } catch (error) {
      throw this.formatError(error as AxiosError);
    }
  }

  async getCustomers(page = 1, limit = 500): Promise<{ data: Cin7Customer[], pagination: any }> {
    try {
      const params = {
        page,
        limit: Math.min(limit, 500)
      };
      
      const response = await this.client.get('/Customers', { params });
      return {
        data: response.data || [],
        pagination: {
          page,
          limit,
          total: response.headers['x-total-count'] || 0
        }
      };
    } catch (error) {
      throw this.formatError(error as AxiosError);
    }
  }

  async createQuote(saleData: Cin7Sale): Promise<any> {
    try {
      const quotePayload = {
        ...saleData,
        OrderStatus: 'NOTAUTHORISED' // This creates it as a quote
      };

      const response = await this.client.post('/Sale', quotePayload);
      return response.data;
    } catch (error) {
      throw this.formatError(error as AxiosError);
    }
  }
}

export const cin7Service = new Cin7Service();
