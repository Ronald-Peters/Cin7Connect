import express, { type Request, Response, NextFunction } from "express";
import path from "path";
import { fileURLToPath } from "url";
import fetch from "node-fetch";
import { setupAuth } from "./auth";
// If you need other routes as well, keep the import — our endpoints are registered first
import { registerRoutes } from "./routes";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const log = (msg: string) => console.log(`[${new Date().toISOString()}] ${msg}`);

// ---------- Cin7 Core client ----------
const CORE_BASE_URL =
  process.env.CORE_BASE_URL || "https://inventory.dearsystems.com/ExternalApi";

const CORE_HEADERS = () => ({
  "Content-Type": "application/json",
  "api-auth-accountid": process.env.CIN7_ACCOUNT_ID || "",
  "api-auth-applicationkey": process.env.CIN7_APP_KEY || "",
});

async function coreGet(
  path: string,
  {
    page = 1,
    limit,
    qs = {},
  }: { page?: number; limit?: number; qs?: Record<string, any> } = {}
) {
  const url = new URL(`${CORE_BASE_URL}${path}`);
  if (page) url.searchParams.set("page", String(page));
  if (limit) url.searchParams.set("limit", String(limit));
  for (const [k, v] of Object.entries(qs))
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));

  const res = await fetch(url.toString(), { headers: CORE_HEADERS() });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Core GET ${url} failed (${res.status}): ${text}`);
  }
  return res.json();
}

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Auth
setupAuth(app);

// -------- Health & diagnostics --------
app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.get("/api/test-connection", async (_req, res) => {
  try {
    log("Testing Cin7 connection -> /Locations?page=1&limit=1");
    const result = await coreGet("/Locations", { page: 1, limit: 1 });
    res.json({ success: true, connected: true, result });
  } catch (e: any) {
    log(`❌ Connection test failed: ${e.message}`);
    res.status(500).json({ success: false, error: e.message });
  }
});

// -------- Warehouses (grouped JHB/CPT/BFN) --------
app.get("/api/warehouses", async (_req, res) => {
  try {
    const data = await coreGet("/Locations", { page: 1, limit: 500 });
    const locations =
      (data as any).Locations ||
      (data as any).locations ||
      (Array.isArray(data) ? data : []);
    log(`✅ /Locations returned ${locations.length} records`);

    // Allowed internal locations
    const allowed = ["B-CPT", "B-VDB", "S-BFN", "S-CPT", "S-POM"];
    const filtered = locations.filter((l: any) => allowed.includes(l.Name));
    log(`✅ Filtered to ${filtered.length} allowed locations`);

    // Group to customer-facing regions
    const grouped = [
      {
        id: 1,
        name: "JHB Warehouse",
        location: "Johannesburg",
        description: "Gauteng & surrounds",
        internalLocations: ["B-VDB", "S-POM"],
      },
      {
        id: 2,
        name: "CPT Warehouse",
        location: "Cape Town",
        description: "Western Cape",
        internalLocations: ["B-CPT", "S-CPT"],
      },
      {
        id: 3,
        name: "BFN Warehouse",
        location: "Bloemfontein",
        description: "Free State & central",
        internalLocations: ["S-BFN"],
      },
    ];

    res.json(grouped);
  } catch (e: any) {
    log(`❌ Error fetching warehouses: ${e.message}`);
    res.status(500).json({ message: "Failed to fetch warehouses", error: e.message });
  }
});

// -------- Products (merged with stock & grouped by region) --------
//
// 1) Pull ALL (or requested page’s) ProductAvailability (live stock)
// 2) Pull matching Products for pricing/brand/category
// 3) Merge & group by JHB/CPT/BFN
//
app.get("/api/products", async (req, res) => {
  try {
    // Client controls page/limit for final payload; availability still fetched fully but capped reasonably
    const clientPage = Math.max(1, Number(req.query.page) || 1);
    const clientLimit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));
    const searchQ = ((req.query.q as string) || "").trim();

    // Allowed internal locations
    const allowed = ["B-CPT", "B-VDB", "S-BFN", "S-CPT", "S-POM"];

    // --- Step 1: Fetch availability (paginate up to a sane cap) ---
    let availability: any[] = [];
    let aPage = 1;
    const A_LIMIT = 1000; // Cin7 max per page
    const MAX_A_PAGES = 50; // hard cap to prevent runaway loops

    log("📦 Fetching ProductAvailability...");
    while (aPage <= MAX_A_PAGES) {
      const pageData = await coreGet("/ProductAvailability", {
        page: aPage,
        limit: A_LIMIT,
      });
      const pageArr =
        (pageData as any).ProductAvailability ||
        (pageData as any).productAvailability ||
        (Array.isArray(pageData) ? pageData : []);
      log(`• availability page ${aPage} -> ${pageArr.length} rows`);
      availability.push(...pageArr);
      if (pageArr.length < A_LIMIT) break;
      aPage++;
    }
    log(`✅ Availability rows total: ${availability.length}`);

    // Filter to allowed internal locations
    availability = availability.filter((r: any) => allowed.includes(r.Location));

    // Optional search filter by SKU/name
    if (searchQ) {
      const q = searchQ.toLowerCase();
      availability = availability.filter(
        (r: any) =>
          String(r.SKU || "").toLowerCase().includes(q) ||
          String(r.Name || r.ProductName || "").toLowerCase().includes(q)
      );
    }

    // --- Step 2: Fetch product info for the SKUs we found (pricing/brand/category) ---
    const skus = Array.from(new Set(availability.map((r: any) => r.SKU)));
    log(`🔎 Unique SKUs after filters: ${skus.length}`);

    // Cin7 /Products supports pagination but not direct batch by SKUs.
    // We'll fetch several pages until we have "enough"; if the dataset is huge,
    // you can optimize by maintaining a local product index in DB.
    let products: any[] = [];
    let pPage = 1;
    const P_LIMIT = 1000;
    const MAX_P_PAGES = 50;

    log("💰 Fetching Products (to enrich with price/brand/category)...");
    while (pPage <= MAX_P_PAGES) {
      const pdata = await coreGet("/Products", { page: pPage, limit: P_LIMIT });
      const parr =
        (pdata as any).Products ||
        (pdata as any).products ||
        (Array.isArray(pdata) ? pdata : []);
      log(`• products page ${pPage} -> ${parr.length} rows`);
      products.push(...parr);
      if (parr.length < P_LIMIT) break;
      pPage++;
    }
    log(`✅ Products rows total: ${products.length}`);

    // Build quick lookup
    const productIndex = new Map<string, any>();
    for (const p of products) {
      if (p?.SKU) productIndex.set(p.SKU, p);
    }

    // --- Step 3: Group availability by SKU and compute regional totals ---
    type Region = "jhb" | "cpt" | "bfn";
    const skuMap = new Map<
      string,
      {
        sku: string;
        name: string;
        available: number;
        onHand: number;
        onOrder: number;
        // merged details:
        price: number;
        brand: string;
        category: string;
        description: string;
        warehouseBreakdown: Record<Region, { available: number; onHand: number; onOrder: number }>;
      }
    >();

    const toRegion = (loc: string): Region | null => {
      if (loc === "S-BFN") return "bfn";
      if (loc === "B-CPT" || loc === "S-CPT") return "cpt";
      if (loc === "B-VDB" || loc === "S-POM") return "jhb";
      return null;
    };

    for (const row of availability) {
      const sku = row.SKU;
      if (!sku) continue;
      if (!skuMap.has(sku)) {
        const p = productIndex.get(sku) || {};
        skuMap.set(sku, {
          sku,
          name: row.Name || row.ProductName || p.Name || sku,
          available: 0,
          onHand: 0,
          onOrder: 0,
          price: Number(p.PriceTier1 || 0),
          brand: p.Brand || "",
          category: p.Category || "",
          description: p.Description || "",
          warehouseBreakdown: {
            jhb: { available: 0, onHand: 0, onOrder: 0 },
            cpt: { available: 0, onHand: 0, onOrder: 0 },
            bfn: { available: 0, onHand: 0, onOrder: 0 },
          },
        });
      }
      const entry = skuMap.get(sku)!;
      entry.available += Number(row.Available || 0);
      entry.onHand += Number(row.OnHand || 0);
      entry.onOrder += Number(row.OnOrder || 0);

      const r = toRegion(row.Location);
      if (r) {
        entry.warehouseBreakdown[r].available += Number(row.Available || 0);
        entry.warehouseBreakdown[r].onHand += Number(row.OnHand || 0);
        entry.warehouseBreakdown[r].onOrder += Number(row.OnOrder || 0);
      }
    }

    // Turn into array and sort by availability desc
    let merged = Array.from(skuMap.values()).sort(
      (a, b) => b.available - a.available
    );

    const total = merged.length;

    // Pagination on merged results
    const start = (clientPage - 1) * clientLimit;
    merged = merged.slice(start, start + clientLimit);

    res.json({
      total,
      page: clientPage,
      pageSize: clientLimit,
      items: merged.map((m, idx) => ({
        id: start + idx + 1,
        sku: m.sku,
        name: m.name,
        description: m.description || m.category || "",
        brand: m.brand,
        category: m.category,
        price: m.price,
        currency: "ZAR",
        available: m.available,
        onHand: m.onHand,
        onOrder: m.onOrder,
        warehouseBreakdown: m.warehouseBreakdown,
      })),
    });
  } catch (e: any) {
    log(`❌ Error in /api/products: ${e.message}`);
    res.status(500).json({ message: "Failed to fetch products", error: e.message });
  }
});

/**
 * Register any other project routes AFTER the ones above so our corrected
 * /api/products and /api/warehouses take precedence.
 */
registerRoutes(app);

// ---------- Static assets (optional; keep if you use /assets) ----------
const publicPath =
  process.env.NODE_ENV === "production"
    ? path.resolve(__dirname, "./public")
    : path.resolve(__dirname, "../dist/public");
app.use("/assets", express.static(path.join(publicPath, "assets")));
log(`📁 Serving assets from: ${path.join(publicPath, "assets")}`);

// ---------- Error handler ----------
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  log(`❌ Error middleware: ${message}`);
  res.status(status).json({ message });
});

// ---------- Start server ----------
const PORT = process.env.PORT || 8080;
const HOST = "0.0.0.0";
app.listen(PORT, HOST, () => {
  log(`🚀 API listening on http://${HOST}:${PORT}`);
});
