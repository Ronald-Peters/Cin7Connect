#!/usr/bin/env node

const { Pool } = require('pg');
const cin7Service = require('../src/services/cin7');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

class CustomerSync {
  constructor() {
    this.since = null;
    this.processArgs();
  }

  processArgs() {
    const args = process.argv.slice(2);
    const sinceIndex = args.indexOf('--since');
    if (sinceIndex !== -1 && args[sinceIndex + 1]) {
      this.since = args[sinceIndex + 1];
      console.log(`Running partial sync since: ${this.since}`);
    } else {
      console.log('Running full sync');
    }
  }

  normalizeCustomerData(cin7Customer) {
    // Extract and normalize customer data from Cin7 format
    const normalized = {
      erp_customer_id: cin7Customer.ID || cin7Customer.CustomerCode,
      company_name: cin7Customer.Name || cin7Customer.CompanyName,
      terms: cin7Customer.PaymentTerms || cin7Customer.Terms,
      price_tier: cin7Customer.PriceTier || cin7Customer.CustomerGroup || process.env.DEFAULT_PRICE_TIER || 'Wholesale',
      default_address: null,
      billing_address: null,
      shipping_address: null,
      contacts: []
    };

    // Handle addresses
    if (cin7Customer.Addresses && Array.isArray(cin7Customer.Addresses)) {
      const addresses = cin7Customer.Addresses;
      
      // Find billing and shipping addresses
      const billingAddr = addresses.find(addr => addr.Type === 'Billing' || addr.Type === 'Business');
      const shippingAddr = addresses.find(addr => addr.Type === 'Shipping' || addr.Type === 'Delivery');
      const defaultAddr = addresses.find(addr => addr.Default === true) || addresses[0];

      if (billingAddr) {
        normalized.billing_address = this.formatAddress(billingAddr);
      }
      
      if (shippingAddr) {
        normalized.shipping_address = this.formatAddress(shippingAddr);
      }
      
      if (defaultAddr) {
        normalized.default_address = this.formatAddress(defaultAddr);
      }
    } else if (cin7Customer.Address) {
      // Single address format
      normalized.default_address = this.formatAddress(cin7Customer.Address);
      normalized.billing_address = normalized.default_address;
    }

    // Handle contacts
    if (cin7Customer.Contacts && Array.isArray(cin7Customer.Contacts)) {
      normalized.contacts = cin7Customer.Contacts.map(contact => ({
        name: contact.Name || contact.ContactName,
        email: contact.Email,
        phone: contact.Phone || contact.Mobile,
        role: contact.Role || contact.Position || 'Contact'
      })).filter(contact => contact.name || contact.email);
    } else if (cin7Customer.ContactPerson) {
      // Single contact format
      normalized.contacts = [{
        name: cin7Customer.ContactPerson,
        email: cin7Customer.Email,
        phone: cin7Customer.Phone,
        role: 'Primary Contact'
      }];
    }

    return normalized;
  }

  formatAddress(address) {
    if (!address) return null;

    const parts = [
      address.Line1,
      address.Line2,
      address.City || address.Suburb,
      address.State || address.Province,
      address.PostCode || address.Zip,
      address.Country
    ].filter(Boolean);

    return parts.join(', ') || null;
  }

  async upsertCustomer(customerData) {
    const query = `
      INSERT INTO customers (
        erp_customer_id,
        company_name,
        terms,
        price_tier,
        default_address,
        billing_address,
        shipping_address,
        contacts,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      ON CONFLICT (erp_customer_id)
      DO UPDATE SET
        company_name = EXCLUDED.company_name,
        terms = EXCLUDED.terms,
        price_tier = EXCLUDED.price_tier,
        default_address = EXCLUDED.default_address,
        billing_address = EXCLUDED.billing_address,
        shipping_address = EXCLUDED.shipping_address,
        contacts = EXCLUDED.contacts,
        updated_at = NOW()
      RETURNING id
    `;

    const result = await pool.query(query, [
      customerData.erp_customer_id,
      customerData.company_name,
      customerData.terms,
      customerData.price_tier,
      customerData.default_address,
      customerData.billing_address,
      customerData.shipping_address,
      JSON.stringify(customerData.contacts)
    ]);

    return result.rows[0].id;
  }

  async run() {
    const startTime = Date.now();
    console.log(`Starting customer sync at ${new Date().toISOString()}`);

    try {
      // Test connection first
      await cin7Service.testConnection();
      console.log('Cin7 API connection successful');

      let page = 1;
      let totalProcessed = 0;
      let hasMore = true;

      while (hasMore) {
        try {
          console.log(`Processing customers page ${page}...`);
          
          const result = await cin7Service.getCustomers(page, 500);
          const customers = result.data;

          if (!customers || customers.length === 0) {
            hasMore = false;
            break;
          }

          // Process each customer
          for (const cin7Customer of customers) {
            if (!cin7Customer.ID && !cin7Customer.CustomerCode) {
              console.warn('Skipping customer without ID:', cin7Customer);
              continue;
            }

            // Filter by --since if provided
            if (this.since && cin7Customer.LastModified) {
              const customerDate = new Date(cin7Customer.LastModified);
              const sinceDate = new Date(this.since);
              if (customerDate < sinceDate) {
                continue;
              }
            }

            try {
              const normalizedCustomer = this.normalizeCustomerData(cin7Customer);
              
              if (!normalizedCustomer.erp_customer_id) {
                console.warn('Skipping customer without ERP ID after normalization');
                continue;
              }

              await this.upsertCustomer(normalizedCustomer);
              totalProcessed++;

              if (totalProcessed % 50 === 0) {
                console.log(`  Processed ${totalProcessed} customers...`);
              }

            } catch (error) {
              console.error(`Error processing customer ${cin7Customer.ID || cin7Customer.CustomerCode}:`, error.message);
            }
          }

          // Check if there are more pages
          hasMore = customers.length === 500;
          page++;

          // Small delay between pages to be gentle on the API
          await new Promise(resolve => setTimeout(resolve, 500));

        } catch (error) {
          console.error(`Error processing page ${page}:`, error.message);
          hasMore = false;
        }
      }

      const duration = (Date.now() - startTime) / 1000;
      console.log(`Customer sync completed in ${duration}s`);
      console.log(`Total customers processed: ${totalProcessed}`);

    } catch (error) {
      console.error('Customer sync failed:', error.message);
      process.exit(1);
    } finally {
      await pool.end();
    }
  }
}

// Run if called directly
if (require.main === module) {
  const sync = new CustomerSync();
  sync.run().catch(error => {
    console.error('Sync failed:', error);
    process.exit(1);
  });
}

module.exports = CustomerSync;