import express, { type Request, Response, NextFunction } from "express";
import path from "path";
import { fileURLToPath } from "url";
import fetch from "node-fetch";
import session from "express-session";

// If you still use passport in ./auth you can leave it imported,
// but this file now provides working /api/login + session itself.
// import { setupAuth } from "./auth"; // optional
import { storage } from "./storage";

// ---------- Paths / helpers ----------
const __dirname = path.dirname(fileURLToPath(import.meta.url));
function log(message: string) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

// ---------- App ----------
const app = express();
app.set("trust proxy", 1);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Simple session (cookie-based)
// Ensure secure session secret
if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET environment variable is required for production");
}

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: false, // set true when behind HTTPS proxy that sets `trust proxy`
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  })
);

// ---------- Auth (minimal, works today) ----------
type User = { id: string; email: string; role: "admin" | "user"; name?: string };

function authenticate(email?: string, password?: string): User | null {
  if (!email || !password) return null;

  // Require admin credentials via environment variables only
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
  
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD environment variables are required");
  }

  if (email.toLowerCase() === ADMIN_EMAIL.toLowerCase() && password === ADMIN_PASSWORD) {
    return { id: "admin-1", email: ADMIN_EMAIL.toLowerCase(), role: "admin", name: "Admin" };
  }
  return null;
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  const user = (req.session as any)?.user as User | undefined;
  if (user) return next();
  return res.status(401).json({ message: "Authentication required" });
}

app.post("/api/login", (req, res) => {
  const { email, password } = req.body || {};
  const user = authenticate(email, password);
  if (!user) return res.status(401).json({ message: "Invalid credentials" });

  (req.session as any).user = user;
  res.json({ ok: true, user });
});

app.post("/api/logout", (req, res) => {
  req.session?.destroy(() => {});
  res.json({ ok: true });
});

app.get("/api/auth/me", (req, res) => {
  const user = (req.session as any)?.user as User | undefined;
  if (!user) return res.status(401).json({ message: "Not authenticated" });
  res.json(user);
});

// ---------- Core (Cin7) ----------
const CORE_BASE_URL =
  process.env.CORE_BASE_URL || "https://inventory.dearsystems.com/ExternalApi";

const CORE_HEADERS = () => ({
  "Content-Type": "application/json",
  "api-auth-accountid": process.env.CIN7_ACCOUNT_ID || "",
  "api-auth-applicationkey": process.env.CIN7_APP_KEY || "",
});

async function coreGet(
  apiPath: string,
  {
    page,
    limit,
    qs = {},
  }: { page?: number; limit?: number; qs?: Record<string, any> } = {}
) {
  const url = new URL(`${CORE_BASE_URL}${apiPath}`);
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

async function corePost(apiPath: string, body: any) {
  const url = `${CORE_BASE_URL}${apiPath}`;
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

// ---------- Health / connectivity ----------
app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.get("/healthz", (_req, res) => res.send("OK"));

app.get("/api/test-connection", async (_req, res) => {
  try {
    const result = await coreGet("/Locations", { page: 1, limit: 1 });
    res.json({ success: true, connected: true, result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ---------- Inventory helpers ----------
const ALLOWED_LOCATIONS = ["B-CPT", "B-VDB", "S-BFN", "S-CPT", "S-POM"] as const;

function toRegion(name: string) {
  if (["B-VDB", "S-POM"].includes(name)) return "JHB";
  if (["B-CPT", "S-CPT"].includes(name)) return "CPT";
  if (name === "S-BFN") return "BFN";
  return "OTHER";
}

function capQty(qty: number) {
  if (qty >= 20) return "20+";
  return String(qty);
}

// ---------- Warehouses (grouped for front-end) ----------
app.get("/api/warehouses", async (_req, res) => {
  try {
    // We only need to return the grouped/visible warehouses for the UI
    const grouped = [
      { id: 1, name: "JHB Warehouse", internalLocations: ["B-VDB", "S-POM"] },
      { id: 2, name: "CPT Warehouse", internalLocations: ["B-CPT", "S-CPT"] },
      { id: 3, name: "BFN Warehouse", internalLocations: ["S-BFN"] },
    ];
    res.json(grouped);
  } catch (e: any) {
    res.status(500).json({ message: "Failed to fetch warehouses" });
  }
});

// ---------- Products (availability grouped JHB/CPT/BFN + “20+” cap) ----------
app.get("/api/products", async (req, res) => {
  try {
    const limit = Number(req.query.limit || 1000);

    // 1) Pull ALL availability (paginate 1000/page)
    let all: any[] = [];
    let page = 1;
    for (;;) {
      const pageData = (await coreGet("/ProductAvailability", {
        page,
        limit: 1000,
      })) as any;
      const rows = pageData.ProductAvailability || [];
      all = all.concat(rows);
      if (rows.length < 1000) break;
      page += 1;
    }

    // 2) Filter allowed warehouses
    const filtered = all.filter((r) => ALLOWED_LOCATIONS.includes(r.Location));

    // 3) Group per SKU with 3-region breakdown
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

    for (const row of filtered) {
      const sku = row.SKU as string;
      if (!map.has(sku)) {
        map.set(sku, {
          sku,
          name: row.Name || row.ProductName || sku,
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
      const item = map.get(sku)!;
      item.available += row.Available || 0;
      item.onHand += row.OnHand || 0;
      item.onOrder += row.OnOrder || 0;

      const region = toRegion(row.Location);
      if (region === "JHB") {
        item.warehouseBreakdown.jhb.available += row.Available || 0;
        item.warehouseBreakdown.jhb.onHand += row.OnHand || 0;
        item.warehouseBreakdown.jhb.onOrder += row.OnOrder || 0;
      } else if (region === "CPT") {
        item.warehouseBreakdown.cpt.available += row.Available || 0;
        item.warehouseBreakdown.cpt.onHand += row.OnHand || 0;
        item.warehouseBreakdown.cpt.onOrder += row.OnOrder || 0;
      } else if (region === "BFN") {
        item.warehouseBreakdown.bfn.available += row.Available || 0;
        item.warehouseBreakdown.bfn.onHand += row.OnHand || 0;
        item.warehouseBreakdown.bfn.onOrder += row.OnOrder || 0;
      }
    }

    // 4) Build response (cap to “20+” per warehouse)
    const products = Array.from(map.values()).slice(0, limit).map((p, idx) => ({
      id: idx + 1,
      sku: p.sku,
      name: p.name,
      description: "Agriculture Tire",
      price: 0,
      currency: "ZAR",
      available: p.available,
      onHand: p.onHand,
      onOrder: p.onOrder,
      warehouseBreakdown: {
        jhb: { available: capQty(p.warehouseBreakdown.jhb.available), onHand: p.warehouseBreakdown.jhb.onHand, onOrder: p.warehouseBreakdown.jhb.onOrder },
        cpt: { available: capQty(p.warehouseBreakdown.cpt.available), onHand: p.warehouseBreakdown.cpt.onHand, onOrder: p.warehouseBreakdown.cpt.onOrder },
        bfn: { available: capQty(p.warehouseBreakdown.bfn.available), onHand: p.warehouseBreakdown.bfn.onHand, onOrder: p.warehouseBreakdown.bfn.onOrder },
      },
    }));

    res.json({ products, total: products.length, filteredWarehouses: ["JHB", "CPT", "BFN"] });
  } catch (e: any) {
    log(`Error fetching products: ${e.message}`);
    res.status(500).json({ message: "Failed to fetch products" });
  }
});

// ---------- Raw availability (debug-heavy) ----------
app.get("/api/availability", async (req, res) => {
  try {
    const sku = req.query.sku as string | undefined;
    let all: any[] = [];
    let page = 1;
    for (;;) {
      const pageData = (await coreGet("/ProductAvailability", {
        page,
        limit: sku ? 50 : 1000,
      })) as any;
      const rows = pageData.ProductAvailability || [];
      all = all.concat(rows);
      if (rows.length < 1000 || sku) break;
      page += 1;
    }

    const filtered = all
      .filter((r) => ALLOWED_LOCATIONS.includes(r.Location))
      .filter((r) => (sku ? r.SKU === sku : true))
      .map((r) => ({
        productSku: r.SKU,
        productName: r.Name,
        warehouseName:
          toRegion(r.Location) === "JHB"
            ? "JHB Warehouse"
            : toRegion(r.Location) === "CPT"
            ? "CPT Warehouse"
            : toRegion(r.Location) === "BFN"
            ? "BFN Warehouse"
            : r.Location,
        internalLocation: r.Location,
        available: r.Available || 0,
        onHand: r.OnHand || 0,
        onOrder: r.OnOrder || 0,
      }));

    res.json(filtered);
  } catch (e: any) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ---------- Quote (checkout -> NOTAUTHORISED) ----------
app.post("/api/checkout", requireAuth, async (req, res) => {
  try {
    const { orderReference, customerDetails } = req.body || {};
    if (!orderReference || String(orderReference).trim() === "") {
      return res.status(400).json({ error: "Order reference is mandatory" });
    }

    // Minimal cart example (you can wire this to your real cart)
    const cartItems: Array<{ sku: string; quantity: number; price: number; warehouse?: string }> =
      req.body.items || [];

    if (!cartItems.length) {
      return res.status(400).json({ error: "Cart is empty" });
    }

    const payload = {
      CustomerName: customerDetails?.companyName || "B2B Portal Customer",
      Status: "UNAUTHORISED",
      OrderNumber: orderReference,
      OrderDate: new Date().toISOString().split("T")[0],
      Lines: cartItems.map((it: any, idx: number) => ({
        SKU: it.sku,
        Quantity: Number(it.quantity || 1),
        Price: Number(it.price || 0),
        LineOrder: idx + 1,
        Location: it.warehouse?.includes("JHB")
          ? "B-VDB"
          : it.warehouse?.includes("CPT")
          ? "B-CPT"
          : "S-BFN",
      })),
    };

    const result = await corePost("/Sale", payload);
    res.json({
      success: true,
      message: "Created NOTAUTHORISED quote in Cin7",
      cin7QuoteId: (result as any)?.ID,
      orderReference,
    });
  } catch (e: any) {
    res.status(500).json({ success: false, error: String(e.message || e) });
  }
});

// ---------- Static assets ----------
app.use("/attached_assets", express.static(path.resolve(__dirname, "../attached_assets")));

// Fixed path resolution for Cloud Run deployment
const publicPath =
  process.env.NODE_ENV === "production"
    ? path.resolve(__dirname, "./public")  // Correct: server/public directory
    : path.resolve(__dirname, "../dist/public");

log(`🔍 Looking for static files at: ${publicPath}`);
log(`🔍 Current working directory: ${process.cwd()}`);
log(`🔍 __dirname: ${__dirname}`);

// Serve all static files from the public directory
app.use(express.static(publicPath));
app.use("/assets", express.static(path.join(publicPath, "assets")));
log(`📁 Serving assets from: ${path.join(publicPath, "assets")}`);

// ---------- Catalog (protected) ----------
app.get("/catalog", requireAuth, async (_req, res) => {
  // Serve your existing server-rendered catalog page or a simple redirect into the SPA.
  // If you keep your previous HTML generator, you can paste it here.
  res.redirect("/"); // Let SPA handle `/catalog` if you prefer
});

// ---------- SPA / landing (HOME) ----------
function sendSpa(req: Request, res: Response) {
  const indexHtml =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "./public/index.html")  // Correct: server/public/index.html
      : path.resolve(__dirname, "../dist/public/index.html");
  
  log(`🔍 Attempting to serve SPA from: ${indexHtml}`);
  
  // Check if file exists first
  import('fs').then(fs => {
    if (!fs.existsSync(indexHtml)) {
      log(`❌ SPA file not found at: ${indexHtml}`);
      log(`📂 Available files in directory:`);
      try {
        const dir = path.dirname(indexHtml);
        const files = fs.readdirSync(dir);
        files.forEach(file => log(`  - ${file}`));
      } catch (e: any) {
        log(`❌ Cannot read directory: ${e.message || e}`);
      }
      return res.status(500).send("App failed to load - index.html not found");
    }
    
    res.sendFile(indexHtml, (err) => {
      if (err) {
        log(`❌ Error serving SPA: ${err.message}`);
        log(`📂 File exists but failed to serve from: ${indexHtml}`);
        res.status(500).send("App failed to load - serve error");
      } else {
        log(`✅ Successfully served SPA from: ${indexHtml}`);
      }
    });
  }).catch((e: any) => {
    log(`❌ Import error: ${e.message || e}`);
    res.status(500).send("App failed to load - import error");
  });
}

// Home should be the landing page
app.get("/", sendSpa);
// And let these routes also load the SPA so the React router can handle them
app.get(["/auth", "/login", "/admin", "/app", "/catalog/*", "/profile", "/cart"], sendSpa);

// ---------- Error handler ----------
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  log(`Error middleware: ${message}`);
  res.status(status).json({ message });
});

// ---------- Start ----------
const PORT = Number(process.env.PORT || 8080);
const HOST = "0.0.0.0";

// Add startup logging
log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
log(`📂 Working directory: ${process.cwd()}`);
log(`📂 __dirname: ${__dirname}`);

// Start server with error handling
try {
  app.listen(PORT, HOST, () => {
    log(`🚀 Reivilo B2B Portal listening on http://${HOST}:${PORT}`);
    log(`✅ Server started successfully in ${process.env.NODE_ENV || 'development'} mode`);
  });
} catch (error: any) {
  log(`❌ Failed to start server: ${error.message || error}`);
  process.exit(1);
}
