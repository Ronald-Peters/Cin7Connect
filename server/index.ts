// server/index.ts
import express, { type Request, type Response, type NextFunction } from "express";
import path from "path";
import { fileURLToPath } from "url";
import fetch from "node-fetch";

// ---------- basics ----------
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

function log(message: string) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

// ---------- Cin7 Core helpers ----------
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
    page,
    limit,
    qs = {},
  }: { page?: number; limit?: number; qs?: Record<string, string | number | boolean> } = {}
) {
  const url = new URL(`${CORE_BASE_URL}${path}`);
  if (page) url.searchParams.set("page", String(page));
  if (limit) url.searchParams.set("limit", String(limit));
  for (const [k, v] of Object.entries(qs)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }

  const res = await fetch(url.toString(), { headers: CORE_HEADERS() });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Core GET ${url} failed (${res.status}): ${text}`);
  }
  return res.json();
}

async function corePost(path: string, body: any) {
  const url = `${CORE_BASE_URL}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: CORE_HEADERS(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Core POST ${url} failed (${res.status}): ${text}`);
  }
  return res.json();
}

// ---------- Shared constants/utilities ----------
const ALLOWED_INTERNAL_LOCATIONS = ["B-CPT", "B-VDB", "S-BFN", "S-CPT", "S-POM"] as const;
type AllowedLoc = (typeof ALLOWED_INTERNAL_LOCATIONS)[number];

const REGION_FROM_LOCATION: Record<AllowedLoc, "JHB" | "CPT" | "BFN"> = {
  "B-VDB": "JHB",
  "S-POM": "JHB",
  "B-CPT": "CPT",
  "S-CPT": "CPT",
  "S-BFN": "BFN",
};

const displayCount = (n: number) => (n > 20 ? "20+" : String(n));

// Fetch **all** pages from /ProductAvailability but only for allowed locations
async function getAllAvailability(): Promise<
  Array<{
    SKU: string;
    Name?: string;
    Location: AllowedLoc | string;
    Available?: number;
    OnHand?: number;
    OnOrder?: number;
  }>
> {
  const all: any[] = [];
  let page = 1;

  // Cin7 Core allows up to 1000 per page
  const PAGE_SIZE = 1000;

  while (true) {
    const data = (await coreGet("/ProductAvailability", {
      page,
      limit: PAGE_SIZE,
    })) as any;

    const rows: any[] = data?.ProductAvailability || [];
    if (!rows.length) break;

    all.push(...rows);
    if (rows.length < PAGE_SIZE) break; // last page
    page++;
  }

  // Filter to allowed locations (ignore other plants/baskets/etc.)
  return all.filter((r) => ALLOWED_INTERNAL_LOCATIONS.includes(r.Location));
}

// Build the products array with region breakdown + masked display values
async function aggregateProducts() {
  const availability = await getAllAvailability();

  // Map SKU -> aggregated product view
  const map = new Map<
    string,
    {
      sku: string;
      name: string;
      available: number;
      onHand: number;
      onOrder: number;
      warehouseBreakdown: {
        jhb: { available: number; onHand: number; onOrder: number };
        cpt: { available: number; onHand: number; onOrder: number };
        bfn: { available: number; onHand: number; onOrder: number };
      };
    }
  >();

  for (const row of availability) {
    const sku = row.SKU;
    if (!sku) continue;

    if (!map.has(sku)) {
      map.set(sku, {
        sku,
        name: row.Name || sku,
        available: 0,
        onHand: 0,
        onOrder: 0,
        warehouseBreakdown: {
          jhb: { available: 0, onHand: 0, onOrder: 0 },
          cpt: { available: 0, onHand: 0, onOrder: 0 },
          bfn: { available: 0, onHand: 0, onOrder: 0 },
        },
      });
    }

    const p = map.get(sku)!;
    const loc = row.Location as AllowedLoc;
    const region = REGION_FROM_LOCATION[loc];

    const inc = {
      available: Number(row.Available || 0),
      onHand: Number(row.OnHand || 0),
      onOrder: Number(row.OnOrder || 0),
    };

    p.available += inc.available;
    p.onHand += inc.onHand;
    p.onOrder += inc.onOrder;

    if (region === "JHB") {
      p.warehouseBreakdown.jhb.available += inc.available;
      p.warehouseBreakdown.jhb.onHand += inc.onHand;
      p.warehouseBreakdown.jhb.onOrder += inc.onOrder;
    } else if (region === "CPT") {
      p.warehouseBreakdown.cpt.available += inc.available;
      p.warehouseBreakdown.cpt.onHand += inc.onHand;
      p.warehouseBreakdown.cpt.onOrder += inc.onOrder;
    } else if (region === "BFN") {
      p.warehouseBreakdown.bfn.available += inc.available;
      p.warehouseBreakdown.bfn.onHand += inc.onHand;
      p.warehouseBreakdown.bfn.onOrder += inc.onOrder;
    }
  }

  // Turn map -> array & add masked display fields
  const products = Array.from(map.values()).map((p, idx) => ({
    id: idx + 1,
    sku: p.sku,
    name: p.name,
    description: "Agriculture Tire",
    price: 0,
    currency: "ZAR",

    // totals
    available: p.available,
    onHand: p.onHand,
    onOrder: p.onOrder,

    // exact values (useful for maths/quotes)
    warehouseBreakdown: p.warehouseBreakdown,

    // masked values for UI
    warehouseBreakdownDisplay: {
      jhb: {
        available: displayCount(p.warehouseBreakdown.jhb.available),
        onHand: displayCount(p.warehouseBreakdown.jhb.onHand),
        onOrder: displayCount(p.warehouseBreakdown.jhb.onOrder),
      },
      cpt: {
        available: displayCount(p.warehouseBreakdown.cpt.available),
        onHand: displayCount(p.warehouseBreakdown.cpt.onHand),
        onOrder: displayCount(p.warehouseBreakdown.cpt.onOrder),
      },
      bfn: {
        available: displayCount(p.warehouseBreakdown.bfn.available),
        onHand: displayCount(p.warehouseBreakdown.bfn.onHand),
        onOrder: displayCount(p.warehouseBreakdown.bfn.onOrder),
      },
    },

    // image placeholders (swap out later with real attachments)
    imageUrl: `https://via.placeholder.com/400x300/1E3A8A/FFFFFF?text=${encodeURIComponent(
      p.sku
    )}`,
    images: [],
  }));

  return products;
}

// ---------- ROUTES ----------

// Health
app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

// Quick connection test against /Locations
app.get("/api/test-connection", async (_req, res) => {
  try {
    const result = await coreGet("/Locations", { page: 1, limit: 1 });
    res.json({ success: true, connected: true, result });
  } catch (e: any) {
    res.status(500).json({ success: false, error: String(e.message || e) });
  }
});

// Warehouses (grouped)
app.get("/api/warehouses", async (_req, res) => {
  try {
    // sanity fetch (not strictly required, but confirms connectivity)
    await coreGet("/Locations", { page: 1, limit: 500 });

    const grouped = [
      { id: 1, name: "JHB Warehouse", internalLocations: ["B-VDB", "S-POM"] },
      { id: 2, name: "CPT Warehouse", internalLocations: ["B-CPT", "S-CPT"] },
      { id: 3, name: "BFN Warehouse", internalLocations: ["S-BFN"] },
    ];
    res.json(grouped);
  } catch (e: any) {
    res.status(500).json({ message: "Failed to fetch warehouses", error: String(e.message || e) });
  }
});

// Products (aggregated + masked display)
app.get("/api/products", async (req, res) => {
  try {
    const q = ((req.query.q as string) || "").trim().toLowerCase();
    const products = await aggregateProducts();

    const filtered =
      q.length > 0
        ? products.filter(
            (p) =>
              p.sku.toLowerCase().includes(q) ||
              (p.name || "").toLowerCase().includes(q) ||
              (p.description || "").toLowerCase().includes(q)
          )
        : products;

    res.json({
      products: filtered,
      total: filtered.length,
      filteredWarehouses: ["JHB", "CPT", "BFN"],
    });
  } catch (e: any) {
    log(`Error in /api/products: ${e.message}`);
    res.status(500).json({ message: "Failed to fetch products", error: String(e.message || e) });
  }
});

// Availability (paged pass-through to avoid huge payloads)
app.get("/api/availability", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10));
    const limit = Math.min(1000, Math.max(1, parseInt(String(req.query.limit || "500"), 10)));
    const { sku, name, location } = req.query;

    const data = await coreGet("/ProductAvailability", {
      page,
      limit,
      qs: {
        ...(sku ? { sku: String(sku) } : {}),
        ...(name ? { name: String(name) } : {}),
        ...(location ? { location: String(location) } : {}),
      },
    });

    res.json({ page, limit, data });
  } catch (e: any) {
    res.status(500).json({ message: "Failed to fetch availability", error: String(e.message || e) });
  }
});

// Optional: simple catalog page that uses the aggregated data and masked values
app.get("/catalog", async (_req, res) => {
  try {
    const products = await aggregateProducts();

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Reivilo B2B - Catalog</title>
  <style>
    body{font-family:system-ui,Arial,sans-serif;background:#f8fafc;margin:0}
    .wrap{max-width:1100px;margin:30px auto;padding:0 16px}
    .head{background:#1e3a8a;color:#fff;border-radius:10px;padding:16px 20px}
    .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px;margin-top:18px}
    .card{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:14px}
    .sku{font-family:monospace;color:#475569}
    .chip{display:inline-block;padding:.15rem .55rem;border-radius:999px;background:#eef2ff;color:#1e3a8a;font-size:.8rem;margin:.25rem 0}
    .row{display:flex;gap:8px}
    .box{flex:1;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px;text-align:center}
    .label{font-size:.78rem;color:#475569}
    .num{font-weight:600}
    .zero{color:#dc2626}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="head">
      <h2 style="margin:0">Reivilo B2B — Product Catalog</h2>
      <div>Live stock by region (values above 20 shown as “20+”)</div>
    </div>
    <div style="margin-top:12px;color:#334155">Products: ${products.length} • Regions: JHB, CPT, BFN</div>

    <div class="grid">
      ${products
        .map(
          (p) => `
        <div class="card">
          <div style="display:flex;gap:12px;align-items:center">
            <div style="width:58px;height:58px;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;display:flex;align-items:center;justify-content:center;background:#eef2ff;color:#1e3a8a;font-weight:700">
              ${p.sku.slice(0,6)}
            </div>
            <div style="flex:1">
              <div style="font-weight:600">${p.name || p.sku}</div>
              <div class="sku">SKU: ${p.sku}</div>
              <div class="chip">${p.description || "Agriculture Tire"}</div>
            </div>
          </div>

          <div style="margin-top:10px;font-weight:600;color:#1e40af">
            Total Available: ${p.available}
          </div>

          <div class="row" style="margin-top:8px">
            <div class="box">
              <div class="label">JHB</div>
              <div class="num ${Number(p.warehouseBreakdown.jhb.available) === 0 ? "zero" : ""}">
                ${p.warehouseBreakdownDisplay.jhb.available}
              </div>
            </div>
            <div class="box">
              <div class="label">CPT</div>
              <div class="num ${Number(p.warehouseBreakdown.cpt.available) === 0 ? "zero" : ""}">
                ${p.warehouseBreakdownDisplay.cpt.available}
              </div>
            </div>
            <div class="box">
              <div class="label">BFN</div>
              <div class="num ${Number(p.warehouseBreakdown.bfn.available) === 0 ? "zero" : ""}">
                ${p.warehouseBreakdownDisplay.bfn.available}
              </div>
            </div>
          </div>
        </div>`
        )
        .join("")}
    </div>
  </div>
</body>
</html>`;
    res.setHeader("Content-Type", "text/html");
    res.send(html);
  } catch (e: any) {
    res.status(500).send(`Catalog error: ${String(e.message || e)}`);
  }
});

// ---------- Static assets ----------
app.use(
  "/attached_assets",
  express.static(path.resolve(__dirname, "../attached_assets"))
);

const publicPath =
  process.env.NODE_ENV === "production"
    ? path.resolve(__dirname, "./public")
    : path.resolve(__dirname, "../dist/public");

app.use("/assets", express.static(path.join(publicPath, "assets")));
log(`📁 Serving assets from: ${path.join(publicPath, "assets")}`);

// ---------- Root / fallback ----------
app.get("/", (_req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.send(`<html><body style="font-family:system-ui;padding:24px">
    <h2>Reivilo B2B API</h2>
    <ul>
      <li><a href="/api/health">/api/health</a></li>
      <li><a href="/api/test-connection">/api/test-connection</a></li>
      <li><a href="/api/warehouses">/api/warehouses</a></li>
      <li><a href="/api/products">/api/products</a></li>
      <li><a href="/api/availability">/api/availability</a></li>
      <li><a href="/catalog">/catalog</a></li>
    </ul>
  </body></html>`);
});

// ---------- Error handler ----------
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  log(`❌ Error middleware: ${message}`);
  res.status(status).json({ message });
});

// ---------- Start ----------
const PORT = process.env.PORT || 8080;
const HOST = "0.0.0.0";
app.listen(PORT, HOST, () => {
  console.log(`🚀 API listening on http://${HOST}:${PORT}`);
});
