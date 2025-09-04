import { cin7Service } from './services/cin7';
import { storage } from './storage';

interface SyncResult {
  success: boolean;
  message: string;
  recordsProcessed: number;
  error?: string;
}

/**
 * Secure sync endpoints for production scheduler
 * Called by Cloud Scheduler every 5 minutes (availability) and hourly (products/customers)
 */

export class ProductSyncService {
  
  /**
   * Sync product availability from all warehouses (every 5 minutes)
   */
  static async syncAvailability(): Promise<SyncResult> {
    try {
      console.log('[SYNC] Starting availability sync...');
      
      const warehouses = await cin7Service.getLocations();
      let totalRecords = 0;

      for (const warehouse of warehouses) {
        try {
          const availabilityData = await cin7Service.getProductAvailability(
            warehouse.ID || warehouse.Name || '', 
            1, 
            500
          );
          
          // Store availability data in Supabase
          for (const item of availabilityData.data) {
            await storage.upsertProductAvailability({
              sku: item.SKU,
              locationName: warehouse.Name || warehouse.LocationName || '',
              onHand: item.OnHand || 0,
              available: item.Available || 0,
              allocated: item.Allocated || 0,
              onOrder: item.OnOrder || 0,
            });
            totalRecords++;
          }
        } catch (warehouseError) {
          console.error(`[SYNC] Error syncing warehouse ${warehouse.Name}:`, warehouseError);
        }
      }

      await this.updateSyncStatus('availability', 'SUCCESS', totalRecords);
      console.log(`[SYNC] Availability sync complete: ${totalRecords} records`);
      
      return {
        success: true,
        message: `Successfully synced availability for ${totalRecords} products`,
        recordsProcessed: totalRecords
      };
      
    } catch (error: any) {
      console.error('[SYNC] Availability sync failed:', error);
      await this.updateSyncStatus('availability', 'ERROR', 0, error.message);
      
      return {
        success: false,
        message: 'Availability sync failed',
        recordsProcessed: 0,
        error: error.message
      };
    }
  }

  /**
   * Sync products from Cin7 (hourly)
   */
  static async syncProducts(): Promise<SyncResult> {
    try {
      console.log('[SYNC] Starting products sync...');
      
      const products = await cin7Service.getProducts({ limit: 500 });
      let recordsProcessed = 0;

      for (const product of products) {
        try {
          await storage.upsertProduct({
            sku: product.SKU,
            name: product.Name || '',
            category: product.Category || '',
            brand: product.Brand || '',
            barcode: product.Barcode || '',
            defaultSellPrice: product.DefaultSellPrice || '0',
            imageUrl: product.ImageURL || '',
            cin7Data: JSON.stringify(product),
          });
          recordsProcessed++;
        } catch (productError) {
          console.error(`[SYNC] Error syncing product ${product.SKU}:`, productError);
        }
      }

      await this.updateSyncStatus('products', 'SUCCESS', recordsProcessed);
      console.log(`[SYNC] Products sync complete: ${recordsProcessed} records`);
      
      return {
        success: true,
        message: `Successfully synced ${recordsProcessed} products`,
        recordsProcessed
      };
      
    } catch (error: any) {
      console.error('[SYNC] Products sync failed:', error);
      await this.updateSyncStatus('products', 'ERROR', 0, error.message);
      
      return {
        success: false,
        message: 'Products sync failed',
        recordsProcessed: 0,
        error: error.message
      };
    }
  }

  /**
   * Sync customers from Cin7 (hourly)
   */
  static async syncCustomers(): Promise<SyncResult> {
    try {
      console.log('[SYNC] Starting customers sync...');
      
      const customersData = await cin7Service.getCustomers(1, 500);
      let recordsProcessed = 0;

      for (const customer of customersData.data) {
        try {
          await storage.upsertCustomer({
            erpCustomerId: customer.CustomerCode || customer.ID || '',
            companyName: customer.CompanyName || customer.Name || '',
            contactPerson: customer.ContactPerson || '',
            email: customer.Email || '',
            phone: customer.Phone || '',
            terms: customer.Terms || customer.PaymentTerms || '',
            priceTier: customer.PriceTier || 'Wholesale',
            contacts: JSON.stringify(customer.Contacts || []),
            cin7Data: JSON.stringify(customer),
          });
          recordsProcessed++;
        } catch (customerError) {
          console.error(`[SYNC] Error syncing customer ${customer.CustomerCode}:`, customerError);
        }
      }

      await this.updateSyncStatus('customers', 'SUCCESS', recordsProcessed);
      console.log(`[SYNC] Customers sync complete: ${recordsProcessed} records`);
      
      return {
        success: true,
        message: `Successfully synced ${recordsProcessed} customers`,
        recordsProcessed
      };
      
    } catch (error: any) {
      console.error('[SYNC] Customers sync failed:', error);
      await this.updateSyncStatus('customers', 'ERROR', 0, error.message);
      
      return {
        success: false,
        message: 'Customers sync failed',
        recordsProcessed: 0,
        error: error.message
      };
    }
  }

  /**
   * Full system sync (nightly)
   */
  static async fullSync(): Promise<SyncResult> {
    try {
      console.log('[SYNC] Starting full system sync...');
      
      const [productsResult, customersResult, availabilityResult] = await Promise.allSettled([
        this.syncProducts(),
        this.syncCustomers(),
        this.syncAvailability()
      ]);

      const totalRecords = [productsResult, customersResult, availabilityResult]
        .filter(result => result.status === 'fulfilled')
        .reduce((sum, result) => sum + (result.value as SyncResult).recordsProcessed, 0);

      const errors = [productsResult, customersResult, availabilityResult]
        .filter(result => result.status === 'rejected')
        .map(result => (result as any).reason?.message)
        .filter(Boolean);

      if (errors.length === 0) {
        await this.updateSyncStatus('full_sync', 'SUCCESS', totalRecords);
        return {
          success: true,
          message: `Full sync complete: ${totalRecords} total records`,
          recordsProcessed: totalRecords
        };
      } else {
        await this.updateSyncStatus('full_sync', 'PARTIAL', totalRecords, errors.join('; '));
        return {
          success: false,
          message: `Partial sync: ${totalRecords} records, ${errors.length} errors`,
          recordsProcessed: totalRecords,
          error: errors.join('; ')
        };
      }
      
    } catch (error: any) {
      console.error('[SYNC] Full sync failed:', error);
      await this.updateSyncStatus('full_sync', 'ERROR', 0, error.message);
      
      return {
        success: false,
        message: 'Full sync failed',
        recordsProcessed: 0,
        error: error.message
      };
    }
  }

  private static async updateSyncStatus(syncType: string, status: string, recordsProcessed: number, errorMessage?: string) {
    try {
      await storage.updateSyncStatus(syncType, status, recordsProcessed, errorMessage);
    } catch (error) {
      console.error('[SYNC] Failed to update sync status:', error);
    }
  }
}