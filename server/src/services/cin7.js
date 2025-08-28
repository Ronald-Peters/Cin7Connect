const axios = require('axios');

class Cin7Service {
  constructor() {
    this.baseURL = process.env.CIN7_BASE_URL || 'https://inventory.dearsystems.com/externalapi/v2';
    this.accountId = process.env.CIN7_ACCOUNT_ID;
    this.appKey = process.env.CIN7_APP_KEY;
    
    if (!this.accountId || !this.appKey) {
      throw new Error('CIN7_ACCOUNT_ID and CIN7_APP_KEY are required');
    }

    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'api-auth-accountid': this.accountId,
        'api-auth-applicationkey': this.appKey,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    // Add retry logic with exponential backoff
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        const config = error.config;
        
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

  formatError(error) {
    if (error.response) {
      const { status, data } = error.response;
      const message = data?.ErrorMessage || data?.message || `HTTP ${status} error`;
      const err = new Error(`Cin7 API Error: ${message}`);
      err.status = status;
      err.data = data;
      return err;
    } else if (error.request) {
      return new Error('Cin7 API Error: No response received');
    } else {
      return new Error(`Cin7 API Error: ${error.message}`);
    }
  }

  /**
   * Get all warehouse/location data
   * @returns {Promise<Array>} Array of locations
   */
  async getLocations() {
    try {
      const response = await this.client.get('/Locations');
      return response.data || [];
    } catch (error) {
      throw this.formatError(error);
    }
  }

  /**
   * Get product availability for a specific location
   * @param {string} location - Location name
   * @param {number} page - Page number (default: 1)
   * @param {number} limit - Items per page (default: 500, max: 500)
   * @returns {Promise<Object>} Availability data with pagination info
   */
  async getProductAvailability(location, page = 1, limit = 500) {
    try {
      const params = {
        location,
        page,
        limit: Math.min(limit, 500) // Ensure limit doesn't exceed 500
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
      throw this.formatError(error);
    }
  }

  /**
   * Get all product availability across all locations
   * @returns {Promise<Array>} Array of all availability records
   */
  async getAllProductAvailability() {
    try {
      const locations = await this.getLocations();
      const allAvailability = [];

      for (const location of locations) {
        let page = 1;
        let hasMore = true;

        while (hasMore) {
          const result = await this.getProductAvailability(location.Name, page, 500);
          allAvailability.push(...result.data);
          
          hasMore = result.data.length === 500; // If we got a full page, there might be more
          page++;
        }
      }

      return allAvailability;
    } catch (error) {
      throw this.formatError(error);
    }
  }

  /**
   * Get product metadata and details
   * @param {number} page - Page number (default: 1)
   * @param {number} limit - Items per page (default: 500)
   * @returns {Promise<Object>} Products data with pagination info
   */
  async getProducts(page = 1, limit = 500) {
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
      throw this.formatError(error);
    }
  }

  /**
   * Get all products (paginated automatically)
   * @returns {Promise<Array>} Array of all products
   */
  async getAllProducts() {
    try {
      const allProducts = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const result = await this.getProducts(page, 500);
        allProducts.push(...result.data);
        
        hasMore = result.data.length === 500;
        page++;
      }

      return allProducts;
    } catch (error) {
      throw this.formatError(error);
    }
  }

  /**
   * Get customer data
   * @param {number} page - Page number (default: 1)
   * @param {number} limit - Items per page (default: 500)
   * @returns {Promise<Object>} Customers data with pagination info
   */
  async getCustomers(page = 1, limit = 500) {
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
      throw this.formatError(error);
    }
  }

  /**
   * Get all customers (paginated automatically)
   * @returns {Promise<Array>} Array of all customers
   */
  async getAllCustomers() {
    try {
      const allCustomers = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const result = await this.getCustomers(page, 500);
        allCustomers.push(...result.data);
        
        hasMore = result.data.length === 500;
        page++;
      }

      return allCustomers;
    } catch (error) {
      throw this.formatError(error);
    }
  }

  /**
   * Create a quote in Cin7 (Sale with OrderStatus=NOTAUTHORISED)
   * @param {Object} saleData - Sale/Quote data
   * @returns {Promise<Object>} Created sale/quote response
   */
  async createQuote(saleData) {
    try {
      const quotePayload = {
        ...saleData,
        OrderStatus: 'NOTAUTHORISED' // This creates it as a quote
      };

      const response = await this.client.post('/Sale', quotePayload);
      return response.data;
    } catch (error) {
      throw this.formatError(error);
    }
  }

  /**
   * Test the connection to Cin7 API
   * @returns {Promise<boolean>} True if connection is successful
   */
  async testConnection() {
    try {
      await this.client.get('/Locations', { 
        params: { limit: 1 } 
      });
      return true;
    } catch (error) {
      throw this.formatError(error);
    }
  }
}

module.exports = new Cin7Service();