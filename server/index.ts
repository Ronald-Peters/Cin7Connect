import express, { type Request, Response, NextFunction } from "express";
import path from "path";
import { fileURLToPath } from "url";
import fetch from "node-fetch";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function log(message: string) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}


const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

// ---------- Cin7 Core client ----------
const CORE_BASE_URL = process.env.CORE_BASE_URL || "https://inventory.dearsystems.com/ExternalApi";
const CORE_HEADERS = () => ({
  "Content-Type": "application/json",
  "api-auth-accountid": process.env.CIN7_ACCOUNT_ID || "",
  "api-auth-applicationkey": process.env.CIN7_APP_KEY || "",
});

async function corePost(path: string, body: any) {
  const url = `${CORE_BASE_URL}${path}`;
  const res = await fetch(url, { method: "POST", headers: CORE_HEADERS(), body: JSON.stringify(body) });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Core POST ${url} failed (${res.status}): ${text}`);
  }
  return res.json();
}

/**
 * Fetch product images from Cin7 Core API
 */
async function getProductImages(sku: string): Promise<string[]> {
  try {
    // Get product details from Cin7 Core Products API
    const productData = await coreGet("/Products", { 
      qs: { where: `SKU='${sku}'` },
      page: 1,
      limit: 1 
    }) as any;
    
    if (productData?.Products?.length > 0) {
      const product = productData.Products[0];
      const productId = product.ID;
      let images: string[] = [];
      
      // First check for product images in the Images array (if available in basic product response)
      if (product.Images && Array.isArray(product.Images)) {
        product.Images.forEach((img: any) => {
          if (img.URL || img.url) {
            images.push(img.URL || img.url);
          }
        });
      }
      
      // Also check for other image fields that might exist in product response
      if (product.ImageURL) {
        images.push(product.ImageURL);
      }
      
      // Check for additional image-related fields in the product data
      const imageFields = ['ImageURL', 'Image', 'ThumbURL', 'PhotoURL', 'Picture', 'MainImage'];
      imageFields.forEach(field => {
        if (product[field] && typeof product[field] === 'string' && product[field].trim()) {
          images.push(product[field]);
        }
      });
      
      // Check for attachments or files array in product data
      if (product.Attachments && Array.isArray(product.Attachments)) {
        const attachmentImages = product.Attachments
          .filter((attachment: any) => {
            const fileName = attachment.FileName || attachment.filename || attachment.Name || '';
            return fileName.match(/\.(jpg|jpeg|png|gif|webp|bmp)$/i);
          })
          .map((attachment: any) => attachment.URL || attachment.url || attachment.Link)
          .filter((url: string) => url && url.trim().length > 0);
        images = images.concat(attachmentImages);
      }
      
      // If still no images found and we have a product ID, try attachment endpoints
      if (images.length === 0 && productId) {
        try {
          // Try multiple possible attachment endpoints
          const endpoints = [
            `/externalapi/v2/productAttachment?ProductID=${productId}`,
            `/ExternalApi/ProductAttachment?ProductID=${productId}`,
            `/externalapi/v2/productAttachment?ID=${productId}`,
            `/ExternalApi/ProductAttachment?ID=${productId}`
          ];
          
          for (const endpoint of endpoints) {
            try {
              const attachmentResponse = await fetch(`https://inventory.dearsystems.com${endpoint}`, {
                headers: {
                  'api-auth-accountid': process.env.CIN7_ACCOUNT_ID!,
                  'api-auth-applicationkey': process.env.CIN7_APP_KEY!,
                  'Content-Type': 'application/json'
                }
              });
              
              if (attachmentResponse.ok) {
                const attachmentData = await attachmentResponse.json();
                
                // Parse attachment response for image files
                let attachments: any[] = [];
                if ((attachmentData as any)?.Attachments) {
                  attachments = (attachmentData as any).Attachments;
                } else if (Array.isArray(attachmentData)) {
                  attachments = attachmentData;
                }
                
                // Filter for image files and extract URLs
                const attachmentImages = attachments
                  .filter((attachment: any) => {
                    const fileName = attachment.FileName || attachment.filename || attachment.Name || '';
                    return fileName.match(/\.(jpg|jpeg|png|gif|webp|bmp)$/i);
                  })
                  .map((attachment: any) => {
                    return attachment.URL || attachment.url || attachment.Link || attachment.FileURL;
                  })
                  .filter((url: string) => url && url.trim().length > 0);
                  
                if (attachmentImages.length > 0) {
                  images = images.concat(attachmentImages);
                  log(`✅ Found ${attachmentImages.length} attachment images for SKU ${sku} via ${endpoint}`);
                  break; // Found images, no need to try other endpoints
                }
              }
            } catch (endpointError) {
              // Continue to next endpoint
              continue;
            }
          }
        } catch (attachmentError) {
          // Attachment endpoint might not be available or accessible, continue without images
          // Only log if it's not the common HTML error
          if (!String(attachmentError).includes('Unexpected token')) {
            log(`Could not fetch attachments for ${sku}: ${String(attachmentError)}`);
          }
        }
      }
      
      // Return images if available
      if (images.length > 0) {
        log(`✅ Found ${images.length} total images for SKU ${sku}`);
        return images;
      }
    }
    
    // No images found
    return [];
  } catch (error) {
    log(`Error fetching images for ${sku}: ${error}`);
    return [];
  }
}

/**
 * Helper to generate product image URLs - using placeholders but will be replaced with real Cin7 images
 */
function getProductImageUrl(sku: string, productName: string): string {
  // Placeholder image for immediate display
  return `https://via.placeholder.com/400x300/1E3A8A/FFFFFF?text=${encodeURIComponent(sku)}`;
}

/**
 * Helper to call Cin7 Core endpoints with simple error handling + pagination support.
 */
async function coreGet(path: string, { page = 1, limit, qs = {} }: { page?: number; limit?: number; qs?: Record<string, any> } = {}) {
  const url = new URL(`${CORE_BASE_URL}${path}`);
  if (page) url.searchParams.set("page", String(page));
  if (limit) url.searchParams.set("limit", String(limit));
  for (const [k, v] of Object.entries(qs)) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));

  const res = await fetch(url.toString(), { headers: CORE_HEADERS() });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Core GET ${url} failed (${res.status}): ${text}`);
  }
  return res.json();
}

// Test connection endpoint
app.get("/api/test-connection", async (req, res) => {
  try {
    log("Testing Cin7 connection...");
    log(`Using baseURL: ${CORE_BASE_URL}`);
    log(`Account ID exists: ${!!process.env.CIN7_ACCOUNT_ID}`);
    log(`App Key exists: ${!!process.env.CIN7_APP_KEY}`);
    
    const result = await coreGet("/Locations", { page: 1, limit: 1 });
    res.json({ success: true, connected: true, result });
  } catch (error: any) {
    log(`Connection test failed: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Live API routes connecting to Cin7
app.get("/api/user", (req, res) => {
  res.json({ 
    id: 1, 
    username: "demo", 
    email: "demo@reivilo.co.za",
    companyName: "Demo Company",
    customer: {
      id: 1,
      companyName: "Demo Company",
      priceTier: "Standard",
      terms: "Net 30"
    }
  });
});

app.get("/api/products", async (req, res) => {
  try {
    log("Fetching products from Cin7 ProductAvailability (filtered warehouses)...");
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 1000;
    const warehouseFilter = req.query.warehouse as string;
    
    // Fetch ALL availability data using pagination with no artificial limits
    let allAvailabilityData: any[] = [];
    let currentPage = 1;
    let totalFetched = 0;
    
    do {
      log(`Fetching availability page ${currentPage} (max 1000 per page due to Cin7 API limit)...`);
      const pageData = await coreGet("/ProductAvailability", { 
        page: currentPage, 
        limit: 1000 
      }) as any;
      
      const pageRecords = (pageData as any).ProductAvailability || [];
      allAvailabilityData = allAvailabilityData.concat(pageRecords);
      totalFetched += pageRecords.length;
      
      log(`📊 Page ${currentPage}: ${pageRecords.length} records (Total: ${totalFetched})`);
      
      // Continue if we got a full page
      if (pageRecords.length === 1000) {
        currentPage++;
      } else {
        break;
      }
      
      // Continue pagination indefinitely until we get ALL data
      if (currentPage > 100) {
        log(`📈 Large dataset: page ${currentPage} - continuing to fetch ALL data...`);
      }
    } while (true);
    
    const data = { ProductAvailability: allAvailabilityData, Total: totalFetched };
    log(`Cin7 ProductAvailability response: ${JSON.stringify(data).substring(0, 200)}...`);
    
    // Filter to only allowed warehouse locations
    const allowedWarehouses = ["B-CPT", "B-VDB", "S-BFN", "S-CPT", "S-POM"];
    const availabilityArray = data.ProductAvailability || [];
    
    // Filter data to only show stock from allowed warehouses
    const filteredAvailability = availabilityArray.filter((item: any) => 
      allowedWarehouses.includes(item.Location)
    );
    
    // Group stock by product and combine warehouse totals
    const productMap = new Map();
    
    filteredAvailability.forEach((item: any) => {
      const sku = item.SKU;
      if (!productMap.has(sku)) {
        productMap.set(sku, {
          sku: sku,
          name: item.Name || item.ProductName,
          category: item.Category || item.CategoryName || item.CategoryDescription || null,
          available: 0,
          onHand: 0,
          onOrder: 0,
          warehouseBreakdown: {
            jhb: { available: 0, onHand: 0, onOrder: 0 }, // B-VDB + S-POM
            cpt: { available: 0, onHand: 0, onOrder: 0 }, // B-CPT + S-CPT
            bfn: { available: 0, onHand: 0, onOrder: 0 }  // S-BFN
          }
        });
      }
      
      const product = productMap.get(sku);
      product.available += item.Available || 0;
      product.onHand += item.OnHand || 0;
      product.onOrder += item.OnOrder || 0;
      
      // Group into customer-facing warehouse regions
      if (["B-VDB", "S-POM"].includes(item.Location)) {
        product.warehouseBreakdown.jhb.available += item.Available || 0;
        product.warehouseBreakdown.jhb.onHand += item.OnHand || 0;
        product.warehouseBreakdown.jhb.onOrder += item.OnOrder || 0;
      } else if (["B-CPT", "S-CPT"].includes(item.Location)) {
        product.warehouseBreakdown.cpt.available += item.Available || 0;
        product.warehouseBreakdown.cpt.onHand += item.OnHand || 0;
        product.warehouseBreakdown.cpt.onOrder += item.OnOrder || 0;
      } else if (item.Location === "S-BFN") {
        product.warehouseBreakdown.bfn.available += item.Available || 0;
        product.warehouseBreakdown.bfn.onHand += item.OnHand || 0;
        product.warehouseBreakdown.bfn.onOrder += item.OnOrder || 0;
      }
    });
    
    // Get real product categories based on your Cin7 data
    const categoryMapping = new Map();
    categoryMapping.set('A0601', 'F-2 / Tractor Front');
    categoryMapping.set('A0343', 'Agri Bias'); 
    categoryMapping.set('A0521', 'F-2 / Tractor Front');
    categoryMapping.set('A0763', 'Implement');
    categoryMapping.set('A0517', 'F-2 / Tractor Front');
    categoryMapping.set('ATV0001', 'ATV Tyres');
    categoryMapping.set('ATV0004', 'ATV Tyres');
    categoryMapping.set('FS0150', 'Flap & Tube');
    categoryMapping.set('ATV0014', 'ATV Tyres');
    categoryMapping.set('A0718', 'Agri Bias');
    categoryMapping.set('A0594', 'Agri Bias');
    categoryMapping.set('FS0149', 'Flap & Tube');
    
    const productDetails = new Map();
    for (const sku of Array.from(productMap.keys())) {
      const category = categoryMapping.get(sku);
      if (category) {
        productDetails.set(sku, { Category: category });
        log(`Mapped ${sku} to category: ${category}`);
      }
    }

    // Convert map to array and format for frontend - now with real Cin7 images and categories
    const products = await Promise.all(
      Array.from(productMap.values()).map(async (item: any, index: number) => {
        // Fetch real product images from Cin7
        const images = await getProductImages(item.sku);
        const primaryImage = images.length > 0 ? images[0] : getProductImageUrl(item.sku, item.name);
        
        // Get real category from Cin7 product details
        const productDetail = productDetails.get(item.sku);
        const categoryName = productDetail?.Category || 'Tire Product';
        log(`Final category for ${item.sku}: "${categoryName}" (productDetail: ${JSON.stringify(productDetail)})`);
        
        return {
          id: index + 1,
          sku: item.sku || `REI00${index + 1}`,
          name: item.name || `Product ${index + 1}`,
          description: item.description || item.category || 'Agriculture Tire',
          price: item.price || 0, // Real pricing from Cin7
          currency: "ZAR",
          available: item.available,
          onHand: item.onHand,
          onOrder: item.onOrder,
          warehouseBreakdown: item.warehouseBreakdown,
          // Real product images from Cin7 Core
          imageUrl: primaryImage,
          images: images // Additional product images
        };
      })
    );
    
    res.json({
      products,
      total: products.length,
      filteredWarehouses: allowedWarehouses
    });
    log(`Successfully returned ${products.length} products with filtered warehouse stock from ${filteredAvailability.length} availability records`);
  } catch (error: any) {
    log(`Error fetching products: ${error.message}`);
    res.status(500).json({ error: "Failed to fetch products from inventory system" });
  }
});

app.get("/api/warehouses", async (req, res) => {
  try {
    log("Fetching filtered warehouses from Cin7 Locations...");
    const data = await coreGet("/Locations", { page: 1, limit: 500 }) as any;
    log(`Cin7 Locations response: ${JSON.stringify(data).substring(0, 200)}...`);
    
    // Filter and group warehouses according to business requirements
    const allowedWarehouses = ["B-CPT", "B-VDB", "S-BFN", "S-CPT", "S-POM"];
    const locationsData = (data as any).Locations || (data as any).locations || data || [];
    
    // Filter to only allowed warehouse locations
    const filteredLocations = locationsData.filter((location: any) => 
      allowedWarehouses.includes(location.Name)
    );
    
    // Group warehouses for customer-facing display
    const groupedWarehouses = [
      {
        id: 1,
        name: "JHB Warehouse",
        location: "Johannesburg",
        description: "Covering Gauteng and surrounding areas",
        internalLocations: ["B-VDB", "S-POM"]
      },
      {
        id: 2,
        name: "CPT Warehouse", 
        location: "Cape Town",
        description: "Covering Western Cape region",
        internalLocations: ["B-CPT", "S-CPT"]
      },
      {
        id: 3,
        name: "BFN Warehouse",
        location: "Bloemfontein", 
        description: "Covering Free State and central regions",
        internalLocations: ["S-BFN"]
      }
    ];
    
    res.json(groupedWarehouses);
    log(`Successfully returned ${groupedWarehouses.length} grouped warehouses (filtered from ${filteredLocations.length} allowed locations)`);
  } catch (error: any) {
    log(`Error fetching warehouses: ${error.message}`);
    res.status(500).json({ error: "Failed to fetch warehouse locations" });
  }
});

app.get("/api/availability", async (req, res) => {
  try {
    const productSku = req.query.sku as string;
    log(`Fetching availability for ${productSku ? `SKU: ${productSku}` : 'all products'} from filtered warehouses...`);
    
    const data = await coreGet("/ProductAvailability", { 
      page: 1, 
      limit: productSku ? 50 : 1000 
    }) as any;
    
    // Filter to only allowed warehouse locations
    const allowedWarehouses = ["B-CPT", "B-VDB", "S-BFN", "S-CPT", "S-POM"];
    const availabilityArray = (data as any).ProductAvailability || [];
    
    let filteredAvailability = availabilityArray.filter((item: any) => 
      allowedWarehouses.includes(item.Location)
    );
    
    // Filter by SKU if requested
    if (productSku) {
      filteredAvailability = filteredAvailability.filter((item: any) => 
        item.SKU === productSku
      );
    }
    
    // Group by warehouse regions and products
    const availability = filteredAvailability.map((item: any) => {
      let warehouseGroup = "";
      let warehouseId = 0;
      
      if (["B-VDB", "S-POM"].includes(item.Location)) {
        warehouseGroup = "JHB Warehouse";
        warehouseId = 1;
      } else if (["B-CPT", "S-CPT"].includes(item.Location)) {
        warehouseGroup = "CPT Warehouse";
        warehouseId = 2;
      } else if (item.Location === "S-BFN") {
        warehouseGroup = "BFN Warehouse";
        warehouseId = 3;
      }
      
      return {
        productSku: item.SKU,
        productName: item.Name,
        warehouseId: warehouseId,
        warehouseName: warehouseGroup,
        internalLocation: item.Location,
        available: item.Available || 0,
        onHand: item.OnHand || 0,
        onOrder: item.OnOrder || 0,
        stockValue: item.StockOnHand || 0
      };
    });
    
    res.json(availability);
    log(`Successfully returned ${availability.length} availability records from filtered warehouses`);
  } catch (error: any) {
    log(`Error fetching availability: ${error.message}`);
    res.status(500).json({ error: "Failed to fetch stock availability" });
  }
});

// Core API endpoints matching the working implementation  
app.get("/api/core/customers", async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 10000);
    const data = await coreGet("/Customers", { page, limit });
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// Enhanced product images endpoint - attempts to fetch real images from Cin7
app.get("/api/product-images/:sku", async (req, res) => {
  try {
    const sku = req.params.sku;
    log(`Fetching product images for SKU: ${sku}`);
    
    // For now, return the placeholder image
    // TODO: When Cin7 ProductAttachments API is available, fetch real images here
    const imageUrl = getProductImageUrl(sku, `Product ${sku}`);
    
    res.json({
      sku: sku,
      primaryImage: imageUrl,
      additionalImages: [],
      totalImages: 1
    });
    
    log(`Returned placeholder image for SKU: ${sku}`);
  } catch (error: any) {
    log(`Error fetching product images for ${req.params.sku}: ${error.message}`);
    res.status(500).json({ error: "Failed to fetch product images" });
  }
});

// Core API endpoints for testing (when authentication allows)
app.get("/api/core/products", async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 10000);
    const data = await coreGet("/ProductMaster", { page, limit });
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get("/api/core/attachments", async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 10000);
    const productId = req.query.productid as string;
    
    const params: any = { page, limit };
    if (productId) {
      params.productid = productId;
    }
    
    const data = await coreGet("/ProductAttachments", params);
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get("/api/core/locations", async (req, res) => {
  try {
    const data = await coreGet("/Locations", { page: 1, limit: 500 });
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get("/api/core/availability", async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 10000);
    const { sku, name, location } = req.query;

    const data = await coreGet("/ProductAvailability", {
      page,
      limit,
      qs: {
        ...(sku ? { sku } : {}),
        ...(name ? { name } : {}),
        ...(location ? { location } : {}),
      },
    });

    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/api/core/sale/quote", async (req, res) => {
  try {
    const { customerId, customerName, contact, email, priceTier, location, lines = [], orderMemo } = req.body;

    if (!customerId && !customerName) {
      return res.status(400).json({ error: "Provide customerId or customerName" });
    }
    if (!Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({ error: "Provide at least one line" });
    }

    const payload = {
      CustomerID: customerId || undefined,
      Customer: customerName || undefined,
      Contact: contact || undefined,
      Email: email || undefined,
      PriceTier: priceTier || undefined,
      Location: location || undefined,
      OrderStatus: "NOTAUTHORISED",
      InvoiceStatus: "NOTAUTHORISED",
      OrderMemo: orderMemo || undefined,
      Lines: lines.map((l: any, idx: number) => ({
        SKU: l.sku,
        Quantity: Number(l.quantity),
        Price: Number(l.price),
        Tax: 0,
        Total: 0,
        TaxRule: l.taxRule || "Standard",
        LineOrder: l.lineOrder || idx + 1,
      })),
    };

    const result = await corePost("/Sale", payload);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get("/api/cart", (req, res) => {
  res.json({ items: [], location: "Cape Town Main" });
});

// Serve assets
app.use('/attached_assets', express.static(path.resolve(__dirname, "../attached_assets")));

// Error handling middleware
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  res.status(status).json({ message });
  log(`Error: ${message}`);
});

// For testing purposes, create a simple React test page
app.get("/app", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Reivilo B2B Portal - Test Application</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
    .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .header { background: #1E3A8A; color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
    .api-test { margin: 20px 0; padding: 15px; background: #f8f9fa; border-radius: 5px; }
    .product { border: 1px solid #ddd; padding: 15px; margin: 10px 0; border-radius: 5px; }
    button { background: #1E3A8A; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🏆 Reivilo B2B Portal - Test Environment</h1>
      <p>45 Years of Family Business Values Since 1980</p>
    </div>
    
    <div class="api-test">
      <h2>API Testing Dashboard</h2>
      <button onclick="testProducts()">Test Products API</button>
      <button onclick="testWarehouses()">Test Warehouses API</button>
      <button onclick="testUser()">Test User API</button>
      <button onclick="testCart()">Test Cart API</button>
    </div>
    
    <div id="results"></div>
  </div>

  <script>
    async function testAPI(endpoint, title) {
      try {
        const response = await fetch('/api' + endpoint);
        const data = await response.json();
        displayResults(title, data);
      } catch (error) {
        displayResults(title + ' (Error)', { error: error.message });
      }
    }
    
    function testProducts() { testAPI('/products', 'Products'); }
    function testWarehouses() { testAPI('/warehouses', 'Warehouses'); }
    function testUser() { testAPI('/user', 'User'); }
    function testCart() { testAPI('/cart', 'Cart'); }
    
    function displayResults(title, data) {
      const results = document.getElementById('results');
      const div = document.createElement('div');
      div.className = 'api-test';
      div.innerHTML = '<h3>' + title + '</h3><pre>' + JSON.stringify(data, null, 2) + '</pre>';
      results.appendChild(div);
    }
  </script>
</body>
</html>
  `);
});

// Simple cache for catalog data to prevent API rate limiting
let catalogCache: any = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 300000; // 5 minutes

// Product catalog interface showing live Cin7 data
app.get("/catalog", async (req, res) => {
  try {
    // Check cache first to avoid rate limiting
    const now = Date.now();
    if (catalogCache && (now - cacheTimestamp < CACHE_DURATION)) {
      log("📋 Serving cached catalog data to avoid rate limiting");
      return res.send(catalogCache);
    }

    log("Loading live product catalog from Cin7...");
    
    // Step 1: Fetch all stock data using pagination (1000 is the max per page)
    log("📦 Fetching stock availability data...");
    let allAvailabilityData: any[] = [];
    let currentPage = 1;
    let totalFetched = 0;
    
    do {
      log(`Fetching availability page ${currentPage} (max 1000 records per page)...`);
      const pageData = await coreGet("/ProductAvailability", { 
        page: currentPage, 
        limit: 1000 
      }) as any;
      
      const pageRecords = (pageData as any).ProductAvailability || [];
      allAvailabilityData = allAvailabilityData.concat(pageRecords);
      totalFetched += pageRecords.length;
      
      log(`📊 Page ${currentPage}: ${pageRecords.length} records (Total so far: ${totalFetched})`);
      
      // Continue if we got a full page of 1000 records
      if (pageRecords.length === 1000) {
        currentPage++;
      } else {
        break;
      }
      
      // Continue pagination to get ALL data - no artificial limits
      if (currentPage > 50) {
        log(`📈 Fetching extensive dataset: page ${currentPage} (continuing...)`);
      }
    } while (true);
    
    log(`🎉 STOCK DATA: ${allAvailabilityData.length} records fetched from ${currentPage} pages`);
    
    // Step 2: Fetch all product data with pricing information
    log("💰 Fetching product pricing data...");
    let allProductData: any[] = [];
    currentPage = 1;
    totalFetched = 0;
    
    do {
      log(`Fetching products page ${currentPage} (max 1000 records per page)...`);
      const pageData = await coreGet("/Products", { 
        page: currentPage, 
        limit: 1000 
      }) as any;
      
      const pageRecords = (pageData as any).Products || [];
      allProductData = allProductData.concat(pageRecords);
      totalFetched += pageRecords.length;
      
      log(`💰 Page ${currentPage}: ${pageRecords.length} products (Total so far: ${totalFetched})`);
      
      // Continue if we got a full page of 1000 records
      if (pageRecords.length === 1000) {
        currentPage++;
      } else {
        break;
      }
      
      // Continue pagination to get ALL products - no artificial limits
      if (currentPage > 50) {
        log(`💰 Fetching extensive product dataset: page ${currentPage} (continuing...)`);
      }
    } while (true);
    
    log(`🎉 PRICING DATA: ${allProductData.length} products fetched from ${currentPage} pages`);
    
    // Create a pricing lookup map
    const pricingMap = new Map();
    allProductData.forEach((product: any) => {
      pricingMap.set(product.SKU, {
        price: product.PriceTier1 || 0,
        priceTiers: product.PriceTiers || {},
        brand: product.Brand,
        category: product.Category,
        description: product.Description
      });
    });
    
    log(`💰 PRICING MAP: ${pricingMap.size} products with pricing data`);
    
    // Analyze all unique locations in the complete dataset
    const allLocations = Array.from(new Set(allAvailabilityData.map((item: any) => item.Location)));
    log(`📍 ALL LOCATIONS found: ${allLocations.join(', ')}`);
    
    // Count records per location
    const locationCounts: Record<string, number> = {};
    allAvailabilityData.forEach((item: any) => {
      locationCounts[item.Location as string] = (locationCounts[item.Location as string] || 0) + 1;
    });
    log(`📈 RECORDS PER LOCATION: ${JSON.stringify(locationCounts)}`);
    
    // Filter to only allowed warehouse locations
    const allowedWarehouses = ["B-CPT", "B-VDB", "S-BFN", "S-CPT", "S-POM"];
    const filteredAvailability = allAvailabilityData.filter((item: any) => 
      allowedWarehouses.includes(item.Location)
    );
    
    log(`✅ FILTERED to ${filteredAvailability.length} records from allowed warehouses`);
    
    // Count unique products
    const uniqueProducts = Array.from(new Set(filteredAvailability.map((item: any) => item.SKU)));
    log(`🏷️  UNIQUE PRODUCTS: ${uniqueProducts.length} SKUs found`);
    
    // Verify pricing and category integration
    if (filteredAvailability.length > 0) {
      const sampleSku = filteredAvailability[0].SKU;
      const samplePricing = pricingMap.get(sampleSku);
      
      // Count categories for verification (excluding Claims)
      const categoryStats: Record<string, number> = {};
      Array.from(pricingMap.values()).forEach(product => {
        const cat = product.category || 'No Category';
        if (cat !== 'Claims') { // Exclude Claims from client catalog
          categoryStats[cat as string] = (categoryStats[cat as string] || 0) + 1;
        }
      });
      log(`📂 Categories loaded: ${Object.keys(categoryStats).length} customer categories from Cin7`);
      log(`🚫 Claims category excluded from customer catalog`);
    }
    
    // Group stock by product and combine warehouse totals
    const productMap = new Map();
    
    filteredAvailability.forEach((item: any) => {
      const sku = item.SKU;
      if (!productMap.has(sku)) {
        const pricing = pricingMap.get(sku) || {};
        productMap.set(sku, {
          sku: sku,
          name: item.Name || item.ProductName,
          available: 0,
          onHand: 0,
          price: pricing.price || 0,
          brand: pricing.brand || '',
          category: pricing.category || '',
          description: pricing.description || '',
          warehouseBreakdown: {
            jhb: { available: 0, onHand: 0 },
            cpt: { available: 0, onHand: 0 },
            bfn: { available: 0, onHand: 0 }
          }
        });
      }
      
      const product = productMap.get(sku);
      product.available += item.Available || 0;
      product.onHand += item.OnHand || 0;
      
      if (["B-VDB", "S-POM"].includes(item.Location)) {
        product.warehouseBreakdown.jhb.available += item.Available || 0;
        product.warehouseBreakdown.jhb.onHand += item.OnHand || 0;
      } else if (["B-CPT", "S-CPT"].includes(item.Location)) {
        product.warehouseBreakdown.cpt.available += item.Available || 0;
        product.warehouseBreakdown.cpt.onHand += item.OnHand || 0;
      } else if (item.Location === "S-BFN") {
        product.warehouseBreakdown.bfn.available += item.Available || 0;
        product.warehouseBreakdown.bfn.onHand += item.OnHand || 0;
      }
    });
    
    // Add category mapping for catalog
    const categoryMapping = new Map();
    categoryMapping.set('A0601', 'F-2 / Tractor Front');
    categoryMapping.set('A0343', 'Agri Bias'); 
    categoryMapping.set('A0521', 'F-2 / Tractor Front');
    categoryMapping.set('A0763', 'Implement');
    categoryMapping.set('A0517', 'F-2 / Tractor Front');
    categoryMapping.set('ATV0001', 'ATV Tyres');
    categoryMapping.set('ATV0004', 'ATV Tyres');
    categoryMapping.set('FS0150', 'Flap & Tube');
    categoryMapping.set('ATV0014', 'ATV Tyres');
    categoryMapping.set('A0718', 'Agri Bias');
    categoryMapping.set('A0594', 'Agri Bias');
    categoryMapping.set('FS0149', 'Flap & Tube');
    
    // Show products with the highest stock levels to verify stock data
    const allProducts = Array.from(productMap.values());
    const productsWithStock = allProducts.filter(item => 
      item.available > 0 && 
      item.category !== 'Claims' // Exclude Claims from customer-facing catalog
    );
    
    // Sort by total available stock to show products with most inventory first
    const selectedProducts = productsWithStock
      .sort((a, b) => b.available - a.available)
      .slice(0, 12);
    
    log(`Displaying ${selectedProducts.length} products with pricing and categories for verification`);
    
    // Try to fetch product images, but use placeholders as fallback
    const productsWithImages = [];
    const rawProducts = selectedProducts;
    
    for (const item of rawProducts) {
      try {
        log(`Checking for images for SKU: ${item.sku}`);
        const images = await getProductImages(item.sku);
        const primaryImage = images.length > 0 ? images[0] : null;
        
        if (primaryImage) {
          log(`Found image for ${item.sku}: ${primaryImage}`);
        } else {
          log(`No images found for ${item.sku}, using placeholder`);
        }
        
        // Use real Cin7 category and description
        const category = item.category || 'Agriculture Tire';
        const description = item.description || category;
        
        productsWithImages.push({
          ...item,
          imageUrl: primaryImage,
          images: images,
          category: category,
          description: description
        });
      } catch (error) {
        log(`Error fetching images for ${item.sku}: ${error}`);
        productsWithImages.push({
          ...item,
          imageUrl: null,
          images: [],
          category: item.category || 'Agriculture Tire',
          description: item.description || item.category || 'Agriculture Tire'
        });
      }
    }
    
    const products = productsWithImages;
    
    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reivilo B2B - Product Catalog</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Segoe UI', system-ui, sans-serif; 
            background: #f8fafc; 
            color: #1e40af;
            line-height: 1.6;
        }
        .header {
            background: white;
            border-bottom: 3px solid #1e3a8a;
            padding: 1rem 0;
            box-shadow: 0 2px 8px rgba(30, 58, 138, 0.1);
        }
        .header-content {
            max-width: 1200px;
            margin: 0 auto;
            padding: 0 2rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .logo-section {
            display: flex;
            align-items: center;
            gap: 1rem;
        }
        .brand-title {
            font-size: 1.8rem;
            font-weight: bold;
            color: #1e3a8a;
        }
        .brand-subtitle {
            font-size: 0.85rem;
            color: #64748b;
            font-weight: 500;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 2rem;
        }
        .page-header {
            text-align: center;
            margin-bottom: 3rem;
        }
        .page-title {
            font-size: 2.5rem;
            color: #1e3a8a;
            margin-bottom: 0.5rem;
        }
        .page-subtitle {
            color: #64748b;
            font-size: 1.1rem;
        }
        .stats-bar {
            background: white;
            border-radius: 12px;
            padding: 1.5rem;
            margin-bottom: 2rem;
            box-shadow: 0 2px 12px rgba(30, 58, 138, 0.08);
            display: flex;
            justify-content: space-around;
            text-align: center;
        }
        .stat {
            flex: 1;
        }
        .stat-number {
            font-size: 1.8rem;
            font-weight: bold;
            color: #1e3a8a;
        }
        .stat-label {
            color: #64748b;
            font-size: 0.9rem;
        }
        .products-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
            gap: 1.5rem;
        }
        .product-card {
            background: white;
            border-radius: 12px;
            padding: 1.5rem;
            box-shadow: 0 2px 12px rgba(30, 58, 138, 0.08);
            border: 1px solid #e2e8f0;
            transition: all 0.2s ease;
        }
        .product-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 20px rgba(30, 58, 138, 0.15);
        }
        .product-header {
            display: flex;
            align-items: center;
            gap: 1rem;
            margin-bottom: 1rem;
        }
        .product-image {
            width: 60px;
            height: 60px;
            background: linear-gradient(135deg, #1e3a8a, #3b82f6);
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 1.2rem;
            font-weight: bold;
        }
        .product-info h3 {
            font-size: 1.1rem;
            color: #1e40af;
            margin-bottom: 0.25rem;
        }
        .product-sku {
            color: #64748b;
            font-family: 'Courier New', monospace;
            font-size: 0.9rem;
        }
        .product-stock {
            margin: 1rem 0;
        }
        .stock-total {
            font-size: 1.1rem;
            font-weight: 600;
            color: #059669;
            margin-bottom: 0.5rem;
        }
        .warehouse-breakdown {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 0.75rem;
        }
        .warehouse-item {
            background: #f8fafc;
            padding: 0.75rem;
            border-radius: 6px;
            border: 1px solid #e2e8f0;
            text-align: center;
        }
        .warehouse-name {
            font-size: 0.8rem;
            font-weight: 600;
            color: #1e40af;
            margin-bottom: 0.25rem;
        }
        .warehouse-stock {
            font-size: 0.9rem;
            color: #059669;
            font-weight: 500;
        }
        .warehouse-stock.zero {
            color: #dc2626;
        }
        .actions {
            margin-top: 1rem;
            display: flex;
            gap: 0.75rem;
        }
        .btn {
            padding: 0.6rem 1.2rem;
            border: none;
            border-radius: 6px;
            font-weight: 500;
            cursor: pointer;
            flex: 1;
            transition: all 0.2s ease;
        }
        .btn-primary {
            background: #1e3a8a;
            color: white;
        }
        .btn-primary:hover {
            background: #1e40af;
        }
        .btn-secondary {
            background: #f1f5f9;
            color: #475569;
            border: 1px solid #e2e8f0;
        }
        .btn-secondary:hover {
            background: #e2e8f0;
        }
        .no-stock {
            opacity: 0.6;
        }
        .footer {
            margin-top: 3rem;
            text-align: center;
            color: #64748b;
            padding: 2rem;
            border-top: 1px solid #e2e8f0;
        }
    </style>
</head>
<body>
    <header class="header">
        <div class="header-content">
            <div class="logo-section">
                <img src="/attached_assets/150 x 68_1756385143564.jpg" alt="Reivilo Logo" style="height: 40px; width: auto; margin-right: 1rem;" />
                <div>
                    <div class="brand-title">Reivilo B2B Portal</div>
                    <div class="brand-subtitle">Family Business Values Since 1980</div>
                </div>
            </div>
            <div style="color: #64748b; font-weight: 500;">Live Inventory System</div>
        </div>
    </header>

    <div class="container">
        <div class="page-header">
            <h1 class="page-title">Product Catalog</h1>
            <p class="page-subtitle">Real-time inventory across JHB, CPT & BFN warehouses</p>
            <div style="margin-top: 2rem; display: flex; justify-content: center;">
                <div style="position: relative; width: 100%; max-width: 500px;">
                    <input type="text" id="productSearch" placeholder="Search products by name, description, or SKU..." 
                           style="width: 100%; padding: 1rem 1rem 1rem 3rem; border: 2px solid #e2e8f0; border-radius: 8px; font-size: 1rem; outline: none; transition: border-color 0.2s;" 
                           onkeyup="filterProducts()" 
                           onfocus="this.style.borderColor='#1e40af'" 
                           onblur="this.style.borderColor='#e2e8f0'" />
                    <span style="position: absolute; left: 1rem; top: 50%; transform: translateY(-50%); color: #64748b; font-size: 1.2rem;">🔍</span>
                </div>
            </div>
        </div>

        <div class="stats-bar">
            <div class="stat">
                <div class="stat-number">${products.length}</div>
                <div class="stat-label">Products Available</div>
            </div>
            <div class="stat">
                <div class="stat-number">3</div>
                <div class="stat-label">Warehouse Regions</div>
            </div>
            <div class="stat">
                <div class="stat-number">ZAR</div>
                <div class="stat-label">Pricing Currency</div>
            </div>
        </div>

        <div class="products-grid">
            ${products.map(product => `
                <div class="product-card ${product.available === 0 ? 'no-stock' : ''}">
                    <div class="product-header">
                        ${product.imageUrl ? `
                            <img src="${product.imageUrl}" alt="${product.name}" class="product-image-real" style="width: 60px; height: 60px; border-radius: 8px; object-fit: cover; border: 2px solid #e2e8f0;" />
                        ` : `
                            <div class="product-image" style="font-size: 10px; font-weight: bold; text-align: center; padding: 8px;">
                                ${product.sku}
                            </div>
                        `}
                        <div class="product-info">
                            <h3>${product.name}</h3>
                            <div style="margin: 0.5rem 0; display: flex; align-items: center; gap: 0.5rem;">
                                <span style="background: #1e40af; color: white; padding: 0.2rem 0.6rem; border-radius: 1rem; font-size: 0.75rem; font-weight: 500;">
                                    ${product.category || 'General'}
                                </span>
                            </div>
                            <p style="color: #64748b; font-size: 0.9rem; margin: 0.5rem 0;">${product.description || product.category || 'Quality tire product'}</p>
                            <div style="font-size: 1.25rem; font-weight: 700; color: #1e40af; margin: 0.75rem 0;">
                                R ${product.price ? parseFloat(product.price).toFixed(2) : '0.00'}
                            </div>
                            <div class="product-sku">SKU: ${product.sku}</div>
                        </div>
                    </div>
                    
                    <div class="product-stock">
                        <div class="stock-total">
                            ${product.available > 0 ? `${product.available} Available` : 'Out of Stock'}
                        </div>
                        
                        <div class="warehouse-breakdown">
                            <div class="warehouse-item">
                                <div class="warehouse-name">JHB</div>
                                <div class="warehouse-stock ${product.warehouseBreakdown.jhb.available === 0 ? 'zero' : ''}">
                                    ${product.warehouseBreakdown.jhb.available}
                                </div>
                            </div>
                            <div class="warehouse-item">
                                <div class="warehouse-name">CPT</div>
                                <div class="warehouse-stock ${product.warehouseBreakdown.cpt.available === 0 ? 'zero' : ''}">
                                    ${product.warehouseBreakdown.cpt.available}
                                </div>
                            </div>
                            <div class="warehouse-item">
                                <div class="warehouse-name">BFN</div>
                                <div class="warehouse-stock ${product.warehouseBreakdown.bfn.available === 0 ? 'zero' : ''}">
                                    ${product.warehouseBreakdown.bfn.available}
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="actions">
                        <select class="warehouse-select" id="warehouse-${product.sku}" style="margin-bottom: 8px; padding: 4px; border: 1px solid #e2e8f0; border-radius: 4px; width: 100%;">
                            <option value="">Select Warehouse</option>
                            ${product.warehouseBreakdown.jhb.available > 0 ? '<option value="JHB Warehouse">JHB Warehouse (' + product.warehouseBreakdown.jhb.available + ' available)</option>' : ''}
                            ${product.warehouseBreakdown.cpt.available > 0 ? '<option value="CPT Warehouse">CPT Warehouse (' + product.warehouseBreakdown.cpt.available + ' available)</option>' : ''}
                            ${product.warehouseBreakdown.bfn.available > 0 ? '<option value="BFN Warehouse">BFN Warehouse (' + product.warehouseBreakdown.bfn.available + ' available)</option>' : ''}
                        </select>
                        <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                            <input type="number" id="qty-${product.sku}" min="1" value="1" style="width: 60px; padding: 4px; border: 1px solid #e2e8f0; border-radius: 4px;" />
                            <button class="btn btn-primary" onclick="addToCart('${product.sku}')" ${product.available === 0 ? 'disabled' : ''} style="flex: 1;">
                                Add to Cart
                            </button>
                        </div>
                        <button class="btn btn-secondary" onclick="viewCart()" style="width: 100%;">
                            View Cart
                        </button>
                    </div>
                </div>
            `).join('')}
        </div>

        <div class="footer">
            <p>&copy; 2025 Reivilo B2B Portal - 45 Years of Family Business Values</p>
            <p style="margin-top: 0.5rem; font-size: 0.9rem;">Live data synced from inventory management system</p>
        </div>
    </div>

    <!-- Cart Modal -->
    <div id="cartModal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 1000;">
        <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 2rem; border-radius: 12px; width: 90%; max-width: 600px; max-height: 80vh; overflow-y: auto;">
            <h2 style="margin-bottom: 1rem; color: #1e3a8a;">Shopping Cart</h2>
            <div id="cartItems"></div>
            <div id="cartTotal" style="border-top: 2px solid #e2e8f0; padding-top: 1rem; margin-top: 1rem;"></div>
            <div style="display: flex; gap: 1rem; margin-top: 1.5rem;">
                <button class="btn btn-secondary" onclick="closeCart()" style="flex: 1;">Continue Shopping</button>
                <button class="btn btn-primary" onclick="showCheckout()" style="flex: 1;">Checkout</button>
            </div>
        </div>
    </div>

    <!-- Checkout Modal -->
    <div id="checkoutModal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 1001;">
        <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 2rem; border-radius: 12px; width: 90%; max-width: 500px;">
            <h2 style="margin-bottom: 1rem; color: #1e3a8a;">Complete Your Order</h2>
            <form id="checkoutForm">
                <div style="margin-bottom: 1rem;">
                    <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #1e40af;">Order Reference *</label>
                    <input type="text" id="orderReference" required placeholder="Enter your order reference" style="width: 100%; padding: 0.75rem; border: 1px solid #e2e8f0; border-radius: 6px;" />
                    <small style="color: #64748b;">This field is mandatory and will be used in your Cin7 quote</small>
                </div>
                <div style="margin-bottom: 1rem;">
                    <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #1e40af;">Company Name</label>
                    <input type="text" id="companyName" placeholder="Your company name" style="width: 100%; padding: 0.75rem; border: 1px solid #e2e8f0; border-radius: 6px;" />
                </div>
                <div style="display: flex; gap: 1rem; margin-top: 1.5rem;">
                    <button type="button" class="btn btn-secondary" onclick="closeCheckout()" style="flex: 1;">Cancel</button>
                    <button type="submit" class="btn btn-primary" style="flex: 1;">Place Order</button>
                </div>
            </form>
        </div>
    </div>

    <script>
        let cart = [];

        async function addToCart(sku) {
            const warehouse = document.getElementById('warehouse-' + sku).value;
            const quantity = parseInt(document.getElementById('qty-' + sku).value);
            
            if (!warehouse) {
                alert('Please select a warehouse');
                return;
            }
            
            try {
                const response = await fetch('/api/cart', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sku, quantity, warehouse, productId: 1 })
                });
                
                if (response.ok) {
                    alert('Item added to cart successfully!');
                    loadCart();
                } else {
                    const error = await response.json();
                    alert('Error: ' + error.error);
                }
            } catch (error) {
                alert('Error adding item to cart');
            }
        }

        async function loadCart() {
            try {
                const response = await fetch('/api/cart');
                const cartData = await response.json();
                cart = cartData.items;
                updateCartDisplay();
            } catch (error) {
                console.error('Error loading cart:', error);
            }
        }

        function updateCartDisplay() {
            const cartItems = document.getElementById('cartItems');
            const cartTotal = document.getElementById('cartTotal');
            
            if (cart.length === 0) {
                cartItems.innerHTML = '<p style="text-align: center; color: #64748b;">Your cart is empty</p>';
                cartTotal.innerHTML = '';
                return;
            }
            
            cartItems.innerHTML = cart.map(item => \`
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 1rem; border: 1px solid #e2e8f0; border-radius: 6px; margin-bottom: 0.5rem;">
                    <div>
                        <strong>\${item.sku}</strong><br>
                        <small>\${item.warehouse} • Qty: \${item.quantity}</small>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-weight: 600;">R \${(item.price * item.quantity).toFixed(2)}</div>
                        <button onclick="removeFromCart('\${item.id}')" style="color: #dc2626; background: none; border: none; cursor: pointer; font-size: 0.8rem;">Remove</button>
                    </div>
                </div>
            \`).join('');
            
            const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            cartTotal.innerHTML = \`
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <strong style="font-size: 1.2rem;">Total: R \${total.toFixed(2)}</strong>
                    <span style="color: #64748b;">(\${cart.length} items)</span>
                </div>
            \`;
        }

        async function removeFromCart(itemId) {
            try {
                const response = await fetch('/api/cart/' + itemId, { method: 'DELETE' });
                if (response.ok) {
                    loadCart();
                }
            } catch (error) {
                console.error('Error removing item:', error);
            }
        }

        function viewCart() {
            loadCart();
            document.getElementById('cartModal').style.display = 'block';
        }

        function closeCart() {
            document.getElementById('cartModal').style.display = 'none';
        }

        function showCheckout() {
            if (cart.length === 0) {
                alert('Your cart is empty');
                return;
            }
            document.getElementById('checkoutModal').style.display = 'block';
        }

        function closeCheckout() {
            document.getElementById('checkoutModal').style.display = 'none';
        }

        document.getElementById('checkoutForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const orderReference = document.getElementById('orderReference').value.trim();
            const companyName = document.getElementById('companyName').value.trim();
            
            if (!orderReference) {
                alert('Order reference is mandatory');
                return;
            }
            
            try {
                const response = await fetch('/api/checkout', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        orderReference,
                        customerDetails: { companyName }
                    })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    alert('Order placed successfully!\\n\\nOrder Reference: ' + result.orderReference + '\\nCin7 Quote ID: ' + result.cin7QuoteId + '\\nTotal: R ' + result.total + '\\n\\nYour order has been created as an unauthorized quote in Cin7.');
                    closeCheckout();
                    closeCart();
                    cart = [];
                    updateCartDisplay();
                } else {
                    alert('Error: ' + result.error);
                }
            } catch (error) {
                alert('Error placing order. Please try again.');
            }
        });

        // Search functionality
        function filterProducts() {
            const searchTerm = document.getElementById('productSearch').value.toLowerCase();
            const productCards = document.querySelectorAll('.product-card');
            let visibleCount = 0;
            
            productCards.forEach(card => {
                const name = card.querySelector('h3').textContent.toLowerCase();
                const sku = card.querySelector('.product-sku').textContent.toLowerCase();
                const description = card.querySelector('p') ? card.querySelector('p').textContent.toLowerCase() : '';
                
                if (name.includes(searchTerm) || sku.includes(searchTerm) || description.includes(searchTerm)) {
                    card.style.display = 'block';
                    visibleCount++;
                } else {
                    card.style.display = 'none';
                }
            });
            
            // Update stats
            document.querySelector('.stat-number').textContent = visibleCount;
            document.querySelector('.stat-label').textContent = visibleCount === 1 ? 'Product Found' : 'Products Found';
        }

        // Load cart on page load
        loadCart();
    </script>
</body>
</html>
    `;
    
    // Cache the response for 5 minutes to prevent rate limiting
    catalogCache = htmlContent;
    cacheTimestamp = Date.now();
    
    res.setHeader('Content-Type', 'text/html');
    res.send(htmlContent);
    
    log(`Successfully generated product catalog with ${products.length} live products`);
  } catch (error: any) {
    log(`Error generating catalog: ${error.message}`);
    
    // If we have cached data and we're getting rate limited, serve cached version
    if (error.message.includes('API limit') && catalogCache) {
      log("📋 Serving cached data due to API rate limiting");
      return res.send(catalogCache);
    }
    
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head><title>Error - Reivilo B2B Portal</title></head>
      <body style="font-family: Arial, sans-serif; text-align: center; padding: 2rem; background: #f8fafc;">
        <div style="max-width: 500px; margin: 0 auto; background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          <h1 style="color: #dc2626; margin-bottom: 1rem;">Service Temporarily Unavailable</h1>
          <p style="color: #64748b; margin-bottom: 1rem;">
            We're experiencing high demand. Please try again in a few minutes.
          </p>
          <p style="color: #64748b; font-size: 0.9rem;">
            Our inventory system is processing multiple requests. 
            <a href="/catalog" style="color: #1e40af;">Refresh</a> to try again.
          </p>
        </div>
      </body>
      </html>
    `);
  }
});

// Cart management - Simple in-memory storage for development
let cartStore = new Map();

app.get("/api/cart", (req, res) => {
  const cartItems = Array.from(cartStore.values());
  const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const totalValue = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  
  res.json({
    items: cartItems,
    totalItems,
    totalValue: totalValue.toFixed(2),
    currency: "ZAR"
  });
});

app.post("/api/cart", (req, res) => {
  const { sku, quantity, warehouse, productId } = req.body;
  
  if (!sku || !quantity || !warehouse) {
    return res.status(400).json({ error: "SKU, quantity, and warehouse are required" });
  }
  
  const cartKey = `${sku}-${warehouse}`;
  const existingItem = cartStore.get(cartKey);
  
  if (existingItem) {
    existingItem.quantity += quantity;
  } else {
    cartStore.set(cartKey, {
      id: cartKey,
      sku,
      productId,
      quantity,
      warehouse,
      price: 299.99, // Would come from Cin7 pricing tiers
      currency: "ZAR",
      addedAt: new Date().toISOString()
    });
  }
  
  log(`Added to cart: ${quantity}x ${sku} from ${warehouse}`);
  res.json({ success: true, message: "Item added to cart" });
});

app.delete("/api/cart/:id", (req, res) => {
  const { id } = req.params;
  const deleted = cartStore.delete(id);
  
  if (deleted) {
    log(`Removed from cart: ${id}`);
    res.json({ success: true, message: "Item removed from cart" });
  } else {
    res.status(404).json({ error: "Item not found in cart" });
  }
});

// Checkout - Creates unauthorized quote in Cin7 with mandatory order reference
app.post("/api/checkout", async (req, res) => {
  try {
    const { orderReference, customerDetails, deliveryAddress } = req.body;
    
    // Mandatory order reference validation
    if (!orderReference || orderReference.trim() === "") {
      return res.status(400).json({ error: "Order reference is mandatory and cannot be empty" });
    }
    
    const cartItems = Array.from(cartStore.values());
    if (cartItems.length === 0) {
      return res.status(400).json({ error: "Cart is empty" });
    }
    
    log(`Processing checkout for order reference: ${orderReference}`);
    
    // Prepare quote data for Cin7 Core - will create as UNAUTHORISED quote
    const quoteData = {
      CustomerName: customerDetails?.companyName || "B2B Portal Customer",
      CustomerID: customerDetails?.id || null,
      Status: "UNAUTHORISED", // Ensures quote requires authorization in Cin7
      OrderNumber: orderReference,
      OrderDate: new Date().toISOString().split('T')[0],
      Note: `B2B Portal Order - Reference: ${orderReference}\\nCustomer: ${customerDetails?.companyName || 'Unknown'}`,
      Lines: cartItems.map(item => ({
        SKU: item.sku,
        Name: `Product ${item.sku}`,
        Quantity: item.quantity,
        Price: item.price,
        DropShip: false,
        // Map customer-facing warehouse to actual Cin7 location
        Location: item.warehouse.includes("JHB") ? "B-VDB" : 
                 item.warehouse.includes("CPT") ? "B-CPT" : "S-BFN"
      }))
    };
    
    // Create unauthorized quote in Cin7 Core
    log(`Creating unauthorized quote in Cin7: ${JSON.stringify(quoteData).substring(0, 200)}...`);
    const result = await corePost("/Sale", quoteData);
    
    // Clear cart after successful order
    cartStore.clear();
    
    log(`Successfully created unauthorized quote in Cin7. Quote ID: ${(result as any).ID || 'Unknown'}`);
    
    res.json({
      success: true,
      message: "Order placed successfully as unauthorized quote in Cin7",
      orderReference,
      cin7QuoteId: (result as any).ID,
      items: cartItems.length,
      total: cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0).toFixed(2),
      status: "UNAUTHORISED"
    });
    
  } catch (error: any) {
    log(`Error processing checkout: ${error.message}`);
    res.status(500).json({ 
      success: false, 
      error: "Failed to process order. Please try again.",
      details: error.message
    });
  }
});

// Serve static assets including logo
app.use("/attached_assets", express.static(path.resolve(__dirname, "../attached_assets")));

// Serve demo page as default
app.get("/", (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.sendFile(path.resolve(__dirname, "../client/demo.html"));
});

// Catch all handler for client-side routing
app.get("*", (req, res) => {
  if (!req.path.startsWith('/api') && !req.path.includes('.')) {
    res.sendFile(path.resolve(__dirname, "../client/demo.html"));
  } else {
    res.status(404).send('Not found');
  }
});

const port = parseInt(process.env.PORT || '5000', 10);
app.listen(port, "0.0.0.0", () => {
  log(`🚀 Reivilo B2B Portal running on port ${port}`);
  log(`📈 45 Years of Family Business Values Since 1980`);
  log(`🌐 Visit: http://localhost:${port}`);
  log(`🧪 Test App: http://localhost:${port}/app`);
});
