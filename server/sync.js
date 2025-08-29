// sync.js
import { db } from "./db.js";

// --- Use your existing coreGet(...) if present ---
// Comment OUT the fallback if you already have coreGet.
async function coreGet(path, { page = 1, limit = 100, qs = {} } = {}) {
  const base = process.env.CORE_BASE_URL || "https://inventory.dearsystems.com/ExternalApi";
  const url = new URL(`${base}${path}`);
  url.searchParams.set("page", String(page));
  url.searchParams.set("limit", String(limit));
  Object.entries(qs).forEach(([k, v]) => v != null && url.searchParams.set(k, String(v)));
  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      "api-auth-accountid": process.env.CORE_ACCOUNT_ID,
      "api-auth-applicationkey": process.env.CORE_API_KEY,
    },
  });
  if (!res.ok) throw new Error(`Cin7 Core GET ${url} -> ${res.status}`);
  return res.json();
}

// Helper to page through everything
async function getAll(path, opts = {}) {
  let page = 1, out = [];
  // some endpoints expose Total; we'll just loop until empty
  // (safe because we limit per page)
  while (true) {
    const data = await coreGet(path, { ...opts, page });
    const arr =
      data?.Customers ||
      data?.Locations ||
      data?.ProductAvailability ||
      data?.Items ||
      Array.isArray(data) ? data : [];
    if (!arr || arr.length === 0) break;
    out = out.concat(arr);
    if (arr.length < (opts.limit || 100)) break;
    page++;
  }
  return out;
}

// ---- SYNCERS ----
export async function syncLocations() {
  const list = await getAll("/Locations", { limit: 500 });
  for (const l of list) {
    const name = l.Name || l.name;
    if (!name) continue;
    await db.query(
      `insert into warehouses (cin7_location_name)
       values ($1)
       on conflict (cin7_location_name) do nothing`,
      [name]
    );
  }
}

export async function syncCustomers() {
  const list = await getAll("/Customers", { limit: 500 });
  for (const c of list) {
    const erpCustomerId = c.ID || c.Id || c.Guid || c.GuidID;
    if (!erpCustomerId) continue;
    await db.query(
      `insert into customers (erp_customer_id, company_name, terms, price_tier, synced_at, updated_at)
       values ($1,$2,$3,$4,now(),now())
       on conflict (erp_customer_id) do update set 
       company_name=$2, terms=$3, price_tier=$4, synced_at=now(), updated_at=now()`,
      [erpCustomerId, c.Name || c.Customer || "Unknown", c.Terms || null, c.PriceTier || null]
    );
  }
}

export async function syncAvailabilityFor(locationName) {
  // pull availability for ONE warehouse (by location name)
  const items = await getAll("/ProductAvailability", { limit: 500, qs: { location: locationName } });
  
  // Get warehouse ID
  const warehouseResult = await db.query(
    `select id from warehouses where cin7_location_name = $1`,
    [locationName]
  );
  
  if (warehouseResult.rows.length === 0) {
    console.log(`Warehouse ${locationName} not found, skipping availability sync`);
    return;
  }
  
  const warehouseId = warehouseResult.rows[0].id;

  for (const it of items) {
    const sku = it.SKU || it.Sku || it.ProductCode;
    const name = it.ProductName || it.Name || null;
    const brand = it.Brand || null;
    const img = it.ImageUrl || it.ImageURL || null;
    const onHand = it.OnHand ?? it.On_Hand ?? 0;
    const available = it.Available ?? 0;
    const onOrder = it.OnOrder ?? 0;

    if (!sku) continue;

    // Insert/update product
    await db.query(
      `insert into products (sku, name, brand, image_url, created_at)
       values ($1,$2,$3,$4,now())
       on conflict (sku) do update set name=excluded.name, brand=excluded.brand, image_url=excluded.image_url`,
      [sku, name, brand, img]
    );
    
    // Get product ID
    const productResult = await db.query(
      `select id from products where sku = $1`,
      [sku]
    );
    
    if (productResult.rows.length > 0) {
      const productId = productResult.rows[0].id;
      
      // Insert/update availability
      await db.query(
        `insert into availability (product_id, warehouse_id, on_hand, available, on_order)
         values ($1,$2,$3,$4,$5)
         on conflict (product_id, warehouse_id)
         do update set on_hand=excluded.on_hand, available=excluded.available, on_order=excluded.on_order`,
        [productId, warehouseId, onHand, available, onOrder]
      );
    }
  }
}

export async function syncAllAvailability() {
  const { rows } = await db.query(`select cin7_location_name from warehouses order by cin7_location_name`);
  for (const r of rows) {
    await syncAvailabilityFor(r.cin7_location_name);
  }
}

// One-shot full sync you can call at startup
export async function initialSync() {
  await syncLocations();
  await syncCustomers();
  await syncAllAvailability();
}

// Background refresher you can start once
export function startBackgroundSync() {
  // availability every 5 min
  setInterval(syncAllAvailability, 5 * 60 * 1000);
  // customers & locations hourly
  setInterval(async () => {
    await syncLocations();
    await syncCustomers();
  }, 60 * 60 * 1000);
}