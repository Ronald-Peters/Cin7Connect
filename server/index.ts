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
  const PAGE_SIZE = 1000;

  while (true) {
    const data = (await coreGet("/ProductAvailability", {
      page,
      limit: PAGE_SIZE,
    })) as any;

    const rows: any[] = data?.ProductAvailability || [];
    if (!rows.length) break;

    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    page++;
  }

  return all.filter((r) => ALLOWED_INTERNAL_LOCATIONS.includes(r.Location));
}

// Build the products array with region breakdown + masked display values
async function aggregateProducts() {
  const availability = await getAllAvailability();

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

  const products = Array.from(map.values()).map((p, idx) => ({
    id: idx + 1,
    sku: p.sku,
    name: p.name,
    description: "Agriculture Tire",
    price: 0,
    currency: "ZAR",
    available: p.available,
    onHand: p.onHand,
    onOrder: p.onOrder,
    warehouseBreakdown: p.warehouseBreakdown,
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
    imageUrl: `https://via.placeholder.com/400x300/1E3A8A/FFFFFF?text=${encodeURIComponent(
      p.sku
    )}`,
    images: [],
  }));

  return products;
}

// ---------- API ROUTES ----------

// Health
app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

// Test connectivity
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
    await coreGet("/Locations", { page: 1, limit: 500 }); // sanity check
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

// Availability (paged)
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

// ---------- Static assets ----------
app.use(
  "/attached_assets",
  express.static(path.resolve(__dirname, "../attached_assets"))
);

const publicPath =
  process.env.NODE_ENV === "production"
    ? path.resolve(__dirname, "./public")
    : path.resolve(__dirname, "../dist/public");

const reactIndexPath =
  process.env.NODE_ENV === "production"
    ? path.resolve(__dirname, "./public/index.html")
    : path.resolve(__dirname, "../dist/public/index.html");

app.use("/assets", express.static(path.join(publicPath, "assets")));
log(`📁 Serving assets from: ${path.join(publicPath, "assets")}`);

// ---------- App routes (serve React) ----------
const serveApp = (_req: Request, res: Response) => {
  res.sendFile(reactIndexPath, (err) => {
    if (err) {
      log(`❌ Error serving app: ${err.message}`);
      res.status(500).send("App unavailable");
    }
  });
};

// Land on the **home page** again
app.get("/", serveApp);

// Common client routes (login, app, admin, etc.)
app.get(["/login", "/app", "/admin", "/cart", "/profile", "/catalog"], serveApp);

// Catch-all for client-side routing: send React index for non-API, non-asset routes
app.get("*", (req, res, next) => {
  if (
    req.path.startsWith("/api/") ||
    req.path.startsWith("/assets/") ||
    req.path.startsWith("/attached_assets/")
  ) {
    return next(); // let API/static handlers deal with it (or 404 if none)
  }
  return serveApp(req, res);
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
