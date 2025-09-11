import * as cron from 'node-cron';
import { ProductSyncService } from './sync';

interface SchedulerStats {
  totalSyncs: number;
  successfulSyncs: number;
  failedSyncs: number;
  lastSync: string | null;
  lastSuccess: string | null;
  lastFailure: string | null;
  currentlyRunning: boolean;
}

interface SyncJobStats extends SchedulerStats {
  jobType: 'customers' | 'products' | 'availability';
  schedule: string;
  nextRun: string | null;
}

export class SyncScheduler {
  private customerSyncTask: cron.ScheduledTask | null = null;
  private productSyncTask: cron.ScheduledTask | null = null;
  private isRunning = false;
  
  private stats: {
    customers: SchedulerStats;
    products: SchedulerStats;
    availability: SchedulerStats;
  };

  constructor() {
    this.stats = {
      customers: this.createEmptyStats(),
      products: this.createEmptyStats(), 
      availability: this.createEmptyStats()
    };

    // Handle graceful shutdown
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());
  }

  private createEmptyStats(): SchedulerStats {
    return {
      totalSyncs: 0,
      successfulSyncs: 0,
      failedSyncs: 0,
      lastSync: null,
      lastSuccess: null,
      lastFailure: null,
      currentlyRunning: false
    };
  }

  /**
   * Start the scheduler with automatic sync jobs
   */
  public start(): void {
    if (this.isRunning) {
      this.log('⚠️  Scheduler already running');
      return;
    }

    this.log('🚀 Starting Cin7 sync scheduler...');

    try {
      // Customer sync: Every 60 minutes
      this.customerSyncTask = cron.schedule('0 */60 * * * *', async () => {
        await this.executeWithRetry('customers', () => ProductSyncService.syncCustomers());
      }, {
        timezone: "Africa/Johannesburg"
      });

      // Product sync: Every 10 minutes (includes prices and availability)
      this.productSyncTask = cron.schedule('*/10 * * * *', async () => {
        // Run both product and availability sync together since they're related
        await this.executeWithRetry('products', () => ProductSyncService.syncProducts());
        await this.executeWithRetry('availability', () => ProductSyncService.syncAvailability());
      }, {
        timezone: "Africa/Johannesburg"
      });

      // Start the scheduled tasks
      this.customerSyncTask.start();
      this.productSyncTask.start();

      this.isRunning = true;
      
      this.log('✅ Sync scheduler started successfully');
      this.log('📅 Customer sync: Every 60 minutes');
      this.log('📅 Product sync: Every 10 minutes');
      this.log('🌍 Timezone: Africa/Johannesburg');

      // Run an initial sync after 30 seconds to populate data
      setTimeout(async () => {
        this.log('🔄 Running initial sync...');
        await this.runInitialSync();
      }, 30000);

    } catch (error: any) {
      this.log(`❌ Failed to start scheduler: ${error.message}`);
      throw error;
    }
  }

  /**
   * Stop the scheduler and clean up resources
   */
  public shutdown(): void {
    if (!this.isRunning) {
      this.log('⚠️  Scheduler not running');
      return;
    }

    this.log('🛑 Shutting down sync scheduler...');

    try {
      if (this.customerSyncTask) {
        this.customerSyncTask.stop();
        this.customerSyncTask = null;
      }

      if (this.productSyncTask) {
        this.productSyncTask.stop();
        this.productSyncTask = null;
      }

      this.isRunning = false;
      this.log('✅ Sync scheduler stopped successfully');

    } catch (error: any) {
      this.log(`❌ Error during shutdown: ${error.message}`);
    }
  }

  /**
   * Execute sync operation with retry logic and exponential backoff
   */
  private async executeWithRetry(
    syncType: keyof typeof this.stats,
    syncFunction: () => Promise<any>,
    maxRetries = 3
  ): Promise<void> {
    const stats = this.stats[syncType];
    
    if (stats.currentlyRunning) {
      this.log(`⚠️  ${syncType} sync already in progress, skipping...`);
      return;
    }

    stats.currentlyRunning = true;
    stats.totalSyncs++;
    stats.lastSync = new Date().toISOString();

    this.log(`🔄 Starting ${syncType} sync (attempt 1/${maxRetries + 1})`);

    let lastError: any = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Add exponential backoff delay for retries
        if (attempt > 0) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000); // Cap at 30 seconds
          this.log(`⏳ Retrying ${syncType} sync in ${delay/1000}s (attempt ${attempt + 1}/${maxRetries + 1})`);
          await this.sleep(delay);
        }

        const result = await syncFunction();
        
        if (result.success) {
          stats.successfulSyncs++;
          stats.lastSuccess = new Date().toISOString();
          this.log(`✅ ${syncType} sync completed: ${result.message} (${result.recordsProcessed} records)`);
          return;
        } else {
          throw new Error(result.error || result.message);
        }

      } catch (error: any) {
        lastError = error;
        this.log(`❌ ${syncType} sync attempt ${attempt + 1} failed: ${error.message}`);

        // Handle specific API rate limit errors
        if (this.isRateLimitError(error)) {
          const rateLimitDelay = this.getRateLimitDelay(error);
          this.log(`🕐 Rate limit detected, waiting ${rateLimitDelay/1000}s before retry...`);
          await this.sleep(rateLimitDelay);
        }
      }
    }

    // All attempts failed
    stats.failedSyncs++;
    stats.lastFailure = new Date().toISOString();
    this.log(`💥 ${syncType} sync failed after ${maxRetries + 1} attempts. Last error: ${lastError?.message}`);
    
    // Log the stack trace for debugging
    if (lastError?.stack) {
      console.error(`[SCHEDULER ERROR STACK] ${syncType}:`, lastError.stack);
    }

    stats.currentlyRunning = false;
  }

  /**
   * Run initial sync to populate data on startup
   */
  private async runInitialSync(): Promise<void> {
    this.log('🌱 Running initial system sync...');

    try {
      // Run them sequentially to avoid overwhelming the API
      await this.executeWithRetry('customers', () => ProductSyncService.syncCustomers());
      await this.sleep(5000); // 5 second delay between syncs
      
      await this.executeWithRetry('products', () => ProductSyncService.syncProducts());
      await this.sleep(5000);
      
      await this.executeWithRetry('availability', () => ProductSyncService.syncAvailability());

      this.log('🎉 Initial sync completed successfully');
    } catch (error: any) {
      this.log(`❌ Initial sync failed: ${error.message}`);
    }
  }

  /**
   * Check if error is due to API rate limiting
   */
  private isRateLimitError(error: any): boolean {
    const message = error.message?.toLowerCase() || '';
    const status = error.status || error.statusCode;
    
    return (
      status === 429 || 
      message.includes('rate limit') ||
      message.includes('too many requests') ||
      message.includes('quota exceeded')
    );
  }

  /**
   * Get delay time for rate limit errors
   */
  private getRateLimitDelay(error: any): number {
    // Check for Retry-After header
    const retryAfter = error.headers?.['retry-after'] || error.response?.headers?.['retry-after'];
    if (retryAfter) {
      return parseInt(retryAfter) * 1000; // Convert to milliseconds
    }

    // Default delay for rate limiting (with some jitter)
    const baseDelay = 60000; // 1 minute
    const jitter = Math.random() * 10000; // Up to 10 seconds
    return baseDelay + jitter;
  }

  /**
   * Sleep utility function
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Enhanced logging with timestamps and context
   */
  private log(message: string): void {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [SCHEDULER] ${message}`);
  }

  /**
   * Get comprehensive scheduler statistics
   */
  public getStats(): { [key: string]: SyncJobStats } {
    return {
      customers: {
        ...this.stats.customers,
        jobType: 'customers',
        schedule: 'Every 60 minutes',
        nextRun: this.customerSyncTask ? this.getNextRunTime(this.customerSyncTask) : null
      },
      products: {
        ...this.stats.products,
        jobType: 'products', 
        schedule: 'Every 10 minutes',
        nextRun: this.productSyncTask ? this.getNextRunTime(this.productSyncTask) : null
      },
      availability: {
        ...this.stats.availability,
        jobType: 'availability',
        schedule: 'Every 10 minutes (with products)',
        nextRun: this.productSyncTask ? this.getNextRunTime(this.productSyncTask) : null
      }
    };
  }

  /**
   * Get next scheduled run time for a cron task
   */
  private getNextRunTime(task: cron.ScheduledTask): string | null {
    try {
      // This is a simple approximation - cron tasks don't expose next run time directly
      return 'Calculated based on cron expression';
    } catch {
      return null;
    }
  }

  /**
   * Manual trigger for sync operations (useful for testing/admin)
   */
  public async triggerSync(type: 'customers' | 'products' | 'availability' | 'all'): Promise<any> {
    this.log(`🔧 Manual trigger requested: ${type}`);

    try {
      switch (type) {
        case 'customers':
          return await ProductSyncService.syncCustomers();
        
        case 'products':
          return await ProductSyncService.syncProducts();
        
        case 'availability':
          return await ProductSyncService.syncAvailability();
        
        case 'all':
          return await ProductSyncService.fullSync();
        
        default:
          throw new Error(`Invalid sync type: ${type}`);
      }
    } catch (error: any) {
      this.log(`❌ Manual sync failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check if scheduler is running
   */
  public isSchedulerRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Get scheduler health status
   */
  public getHealthStatus(): {
    isRunning: boolean;
    uptime: string;
    totalSyncs: number;
    successRate: string;
    lastActivity: string | null;
  } {
    const allStats = Object.values(this.stats);
    const totalSyncs = allStats.reduce((sum, stat) => sum + stat.totalSyncs, 0);
    const successfulSyncs = allStats.reduce((sum, stat) => sum + stat.successfulSyncs, 0);
    const successRate = totalSyncs > 0 ? ((successfulSyncs / totalSyncs) * 100).toFixed(1) + '%' : '0%';
    
    const lastActivities = allStats
      .map(stat => stat.lastSync)
      .filter(Boolean)
      .sort()
      .reverse();

    return {
      isRunning: this.isRunning,
      uptime: this.isRunning ? 'Running since server start' : 'Not running',
      totalSyncs,
      successRate,
      lastActivity: lastActivities[0] || null
    };
  }
}

// Create singleton instance
export const syncScheduler = new SyncScheduler();

// Auto-start scheduler when module is imported (unless in test environment)
if (process.env.NODE_ENV !== 'test' && process.env.DISABLE_SCHEDULER !== 'true') {
  try {
    syncScheduler.start();
  } catch (error: any) {
    console.error('[SCHEDULER] Failed to auto-start:', error.message);
  }
}