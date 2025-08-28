#!/usr/bin/env node

const { Pool } = require('pg');
const cin7Service = require('../src/services/cin7');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

class AvailabilitySync {
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

  async upsertWarehouse(locationName) {
    const query = `
      INSERT INTO warehouses (cin7_location_name)
      VALUES ($1)
      ON CONFLICT (cin7_location_name)
      DO UPDATE SET cin7_location_name = EXCLUDED.cin7_location_name
      RETURNING id
    `;
    
    const result = await pool.query(query, [locationName]);
    return result.rows[0].id;
  }

  async upsertProduct(sku, name = null) {
    const query = `
      INSERT INTO products (sku, name)
      VALUES ($1, $2)
      ON CONFLICT (sku)
      DO UPDATE SET 
        name = COALESCE(EXCLUDED.name, products.name)
      RETURNING id
    `;
    
    const result = await pool.query(query, [sku, name]);
    return result.rows[0].id;
  }

  async upsertAvailability(productId, warehouseId, availability) {
    const query = `
      INSERT INTO availability (
        product_id, 
        warehouse_id, 
        on_hand, 
        allocated, 
        available, 
        on_order
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (product_id, warehouse_id)
      DO UPDATE SET
        on_hand = EXCLUDED.on_hand,
        allocated = EXCLUDED.allocated,
        available = EXCLUDED.available,
        on_order = EXCLUDED.on_order
    `;

    await pool.query(query, [
      productId,
      warehouseId,
      availability.OnHand || 0,
      availability.Allocated || 0,
      availability.Available || 0,
      availability.OnOrder || 0
    ]);
  }

  async syncLocation(locationName) {
    console.log(`Syncing availability for location: ${locationName}`);
    
    const warehouseId = await this.upsertWarehouse(locationName);
    let page = 1;
    let totalProcessed = 0;
    let hasMore = true;

    while (hasMore) {
      try {
        console.log(`  Processing page ${page} for ${locationName}...`);
        
        const result = await cin7Service.getProductAvailability(locationName, page, 500);
        const availabilityData = result.data;

        if (!availabilityData || availabilityData.length === 0) {
          hasMore = false;
          break;
        }

        // Process each availability record
        for (const item of availabilityData) {
          if (!item.SKU) {
            console.warn(`Skipping item without SKU:`, item);
            continue;
          }

          // Filter by --since if provided
          if (this.since && item.LastModified) {
            const itemDate = new Date(item.LastModified);
            const sinceDate = new Date(this.since);
            if (itemDate < sinceDate) {
              continue;
            }
          }

          try {
            const productId = await this.upsertProduct(item.SKU, item.Name);
            await this.upsertAvailability(productId, warehouseId, item);
            totalProcessed++;
          } catch (error) {
            console.error(`Error processing item ${item.SKU}:`, error.message);
          }
        }

        // Check if there are more pages
        hasMore = availabilityData.length === 500;
        page++;

      } catch (error) {
        console.error(`Error processing page ${page} for ${locationName}:`, error.message);
        hasMore = false;
      }
    }

    console.log(`  Completed ${locationName}: ${totalProcessed} items processed`);
    return totalProcessed;
  }

  async run() {
    const startTime = Date.now();
    console.log(`Starting availability sync at ${new Date().toISOString()}`);

    try {
      // Test connection first
      await cin7Service.testConnection();
      console.log('Cin7 API connection successful');

      // Get all locations
      const locations = await cin7Service.getLocations();
      console.log(`Found ${locations.length} locations to sync`);

      if (locations.length === 0) {
        console.log('No locations found, nothing to sync');
        return;
      }

      let totalProcessed = 0;

      // Sync each location sequentially to avoid API rate limits
      for (const location of locations) {
        const locationName = location.Name || location.LocationName;
        if (!locationName) {
          console.warn('Skipping location without name:', location);
          continue;
        }

        try {
          const processed = await this.syncLocation(locationName);
          totalProcessed += processed;
        } catch (error) {
          console.error(`Failed to sync location ${locationName}:`, error.message);
        }

        // Small delay between locations to be gentle on the API
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      const duration = (Date.now() - startTime) / 1000;
      console.log(`Availability sync completed in ${duration}s`);
      console.log(`Total items processed: ${totalProcessed}`);

    } catch (error) {
      console.error('Availability sync failed:', error.message);
      process.exit(1);
    } finally {
      await pool.end();
    }
  }
}

// Run if called directly
if (require.main === module) {
  const sync = new AvailabilitySync();
  sync.run().catch(error => {
    console.error('Sync failed:', error);
    process.exit(1);
  });
}

module.exports = AvailabilitySync;