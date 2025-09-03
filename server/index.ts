import express, { Request, Response, NextFunction } from "express";
import path from "path";
import { fileURLToPath } from "url";
import fetch from "node-fetch";

// ---------- helpers ----------
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const log = (m: string) => console.log(`[${new Date().toISOString()}] ${m}`);

// ---------- Cin7 Core client ----------
const CORE_BASE_URL =
  process.env.CORE_BASE_URL || "https://inventory.dearsystems.com/ExternalApi";

const CORE_HEADERS = () => ({
  "Content-Type": "application/json",
  "api-auth-accountid": process.env.CIN7_ACCOUNT_ID || "",
  "api-auth-applicationkey": process.env.CIN7_APP_KEY || "",
});

async function coreGet(
  p: string,
  opts: { page?: number; limit?: number; qs?: Record<string, any> } = {}
) {
  const { page, limit, qs = {} } = opts;
  const url = new URL(`${CORE_BASE_URL}${p}`);
  if (page) url.searchParams.set("page", String(page));
  if (limit) url.searchParams.set("limit", String(limit));
  Object.entries(qs).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  });

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

// ---------- app ----------
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Quick request logger for /api/*
app.use((req, res, next) => {
  const start = Date.now();
  let captured: any;
  const orig = res.json.bind(res);
  (res as any).json = (body: any) => {
    captured = body;
    return orig(body);
  };
  res.on("finish", () => {
    if (req.path.startsWith("/api")) {
      let line = `${req.method} ${req.path} ${res.statusCode} in ${
        Date.now() - start
      }ms`;
      if (captured) {
        const msg = JSON.stringify(captured);
        line += ` :: ${msg.length > 200 ? msg.slice(0, 200) + "…" : msg}`;
      }
      log(line);
    }
  });
  next();
});

// ---------- basic + diagnostics ----------
app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.get("/api/test-connection", async (_req, res) => {
  try {
    log("Testing Cin7 Core connection...");
    const result = await coreGet("/Locations", { page: 1, limit: 1 });
    res.json({ success: true, connected: true, result });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message || String(e) });
  }
});

// ---------- warehouses ----------
/**
 * Groups internal Core locations into customer-facing regions.
 * JHB: B-VDB, S-POM
 * CPT: B-CPT, S-CPT
 * BFN: S-BFN
 */
const ALLOWED_LOCATIONS = ["B-CPT", "B-VDB", "S-BFN", "S-CPT", "S-POM"];
const REGION_BY_LOCATION: Record<string, "JHB" | "CPT" | "BFN" | undefined> = {
  "B-VDB": "JHB",
  "S-POM": "JHB",
  "B-CPT": "CPT",
  "S-CPT": "CPT",
  "S-BFN": "BFN",
};

app.get("/api/warehouses", async (_req, res) => {
  try {
    const data = (await coreGet("/Locations", { page: 1, limit: 500 })) as any;
    const locations = data?.Locations || data || [];

    // Filter to allowed & present them grouped for the UI
    const present = locations
      .filter((l: any) => ALLOWED_LOCATIONS.includes(l?.Name))
      .map((l: any) => l.Name);

    const grouped = [
      {
        id: 1,
        name: "JHB Warehouse",
        internalLocations: ["B-VDB", "S-POM"].filter((x) => present.includes(x)),
      },
      {
        id: 2,
        name: "CPT Warehouse",
        internalLocations: ["B-CPT", "S-CPT"].filter((x) => present.includes(x)),
      },
      {
        id: 3,
        name: "BFN Warehouse",
        internalLocations: ["S-BFN"].filter((x) => present.includes(x)),
      },
    ];

    res.json(grouped);
  } catch (e: any) {
    log(`Error fetching warehouses: ${e.message}`);
    res.status(500).json({ message: "Failed to fetch warehouses" });
  }
});

// ---------- products (with JHB/CPT/BFN breakdown) ----------
app.get("/api/products", async (req, res) => {
  try {
    // Optional query controls display only; we still fetch all availability
    const limitOut = Math.max(1, Math.min(500, Number(req.query.limit) || 50));
    const search = ((req.query.q as string) || "").trim().toLowerCase();

    // 1) Fetch ALL availability via pagination (Core max 1000/page)
    let all: any[] = [];
    let page = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const resp = (await coreGet("/ProductAvailability", {
        page,
        limit: 1000,
      })) as any;
      const chunk = resp?.ProductAvailability || [];
      all = all.concat(chunk);
      if (chunk.length < 1000) break;
      page++;
    }

    // 2) Filter to allowed internal locations
    const filtered = all.filter((r) => ALLOWED_LOCATIONS.includes(r?.Location));

    // 3) Group by SKU and aggregate totals + region breakdown
    type Agg = {
      sku: string;
      name?: string;
      available: number;
      onHand: number;
      onOrder: number;
      regions: {
        jhb: { available: number; onHand: number; onOrder: number };
        cpt: { available: number; onHand: number; onOrder: number };
        bfn: { available: number; onHand: number; onOrder: number };
      };
    };

    const map = new Map<string, Agg>();

    for (const r of filtered) {
      const sku = r.SKU;
      if (!sku) continue;
      if (!map.has(sku)) {
        map.set(sku, {
          sku,
          name: r.Name || r.ProductName,
          available: 0,
          onHand: 0,
          onOrder: 0,
          regions: {
            jhb: { available: 0, onHand: 0, onOrder: 0 },
            cpt: { available: 0, onHand: 0, onOrder: 0 },
            bfn: { available: 0, onHand: 0, onOrder: 0 },
          },
        });
      }
      const agg = map.get(sku)!;

      const add = (where: "jhb" | "cpt" | "bfn") => {
        agg.available += r.Available || 0;
        agg.onHand += r.OnHand || 0;
        agg.onOrder += r.OnOrder || 0;
        agg.regions[where].available += r.Available || 0;
        agg.regions[where].onHand += r.OnHand || 0;
        agg.regions[where].onOrder += r.OnOrder || 0;
      };

      const region = REGION_BY_LOCATION[r.Location];
      if (region === "JHB") add("jhb");
      else if (region === "CPT") add("cpt");
      else if (region === "BFN") add("bfn");
    }

    // 4) Shape for UI
    let items = Array.from(map.values()).map((p, i) => ({
      id: i + 1,
      sku: p.sku,
      name: p.name || p.sku,
      description: "Agriculture Tire",
      price: 0,
      currency: "ZAR",
      available: p.available,
      onHand: p.onHand,
      onOrder: p.onOrder,
      warehouseBreakdown: {
        jhb: p.regions.jhb,
        cpt: p.regions.cpt,
        bfn: p.regions.bfn,
      },
    }));

    // Optional search
    if (search) {
      items = items.filter(
        (x) =>
          x.sku.toLowerCase().includes(search) ||
          (x.name || "").toLowerCase().includes(search)
      );
    }

    // Limit for output
    const out = items.slice(0, limitOut);

    res.json({
      products: out,
      total: items.length,
      filteredWarehouses: ["JHB", "CPT", "BFN"],
    });
  } catch (e: any) {
    log(`Error fetching products: ${e.message}`);
    res.status(500).json({ message: "Failed to fetch products" });
  }
});

// ---------- availability (per-SKU view, still grouped) ----------
app.get("/api/availability", async (req, res) => {
  try {
    const skuFilter = (req.query.sku as string) || "";
    const data = (await coreGet("/ProductAvailability", {
      page: 1,
      limit: 1000,
    })) as any;
    const arr = data?.ProductAvailability || [];

    const filtered = arr
      .filter((r: any) => ALLOWED_LOCATIONS.includes(r?.Location))
      .filter((r: any) => (skuFilter ? r.SKU === skuFilter : true))
      .map((r: any) => {
        const region = REGION_BY_LOCATION[r.Location];
        const warehouseName =
          region === "JHB"
            ? "JHB Warehouse"
            : region === "CPT"
            ? "CPT Warehouse"
            : region === "BFN"
            ? "BFN Warehouse"
            : "Unknown";
        const warehouseId = warehouseName.startsWith("JHB")
          ? 1
          : warehouseName.startsWith("CPT")
          ? 2
          : 3;
        return {
          productSku: r.SKU,
          productName: r.Name || r.ProductName,
          warehouseId,
          warehouseName,
          internalLocation: r.Location,
          available: r.Available || 0,
          onHand: r.OnHand || 0,
          onOrder: r.OnOrder || 0,
        };
      });

    res.json(filtered);
  } catch (e: any) {
    log(`Error fetching availability: ${e.message}`);
    res.status(500).json({ error: "Failed to fetch stock availability" });
  }
});

// ---------- demo home (prevents "Cannot GET /") ----------
app.get("/", (_req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.send(`<!doctype html>
  <html><head><meta charset="utf-8" />
  <title>Reivilo B2B</title>
  <style>body{font-family:system-ui,Segoe UI,Arial;margin:40px;color:#1e40af}
  a{color:#1e3a8a;text-decoration:none;border:1px solid #cbd5e1;padding:.5rem 1rem;border-radius:.5rem;margin-right:.5rem}
  pre{background:#f8fafc;border:1px solid #e2e8f0;padding:1rem;border-radius:.5rem}
  </style></head>
  <body>
    <h1>Reivilo B2B API</h1>
    <p>Quick links for testing:</p>
    <p>
      <a href="/api/health">/api/health</a>
      <a href="/api/test-connection">/api/test-connection</a>
      <a href="/api/warehouses">/api/warehouses</a>
      <a href="/api/products?limit=12">/api/products</a>
      <a href="/api/availability">/api/availability</a>
    </p>
    <pre>CORE_BASE_URL = ${CORE_BASE_URL}
CIN7_ACCOUNT_ID set: ${Boolean(process.env.CIN7_ACCOUNT_ID)}
CIN7_APP_KEY set   : ${Boolean(process.env.CIN7_APP_KEY)}</pre>
  </body></html>`);
});

// ---------- static assets (for client build if present) ----------
const publicPath =
  process.env.NODE_ENV === "production"
    ? path.resolve(__dirname, "./public")
    : path.resolve(__dirname, "../dist/public");
app.use("/assets", express.static(path.join(publicPath, "assets")));
app.use("/attached_assets", express.static(path.resolve(__dirname, "../attached_assets")));
log(`📁 Serving assets from: ${path.join(publicPath, "assets")}`);

// ---------- error handler (ALWAYS LAST) ----------
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  log(`❌ Error middleware: ${message}`);
  res.status(status).json({ message });
});

// ---------- listen ----------
const PORT = process.env.PORT || 8080;
const HOST = "0.0.0.0";
app.listen(PORT, HOST, () => {
  log(`🚀 API listening on http://${HOST}:${PORT}`);
});
