import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { WarehouseStockDisplay } from "./warehouse-stock-display";
import { Search, Plus, Ban } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface Product {
  id: number;
  sku: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  available: number;
  onHand: number;
  onOrder: number;
  imageUrl: string;
  images: string[];
  warehouseBreakdown: {
    jhb: { available: number; onHand: number; onOrder: number };
    cpt: { available: number; onHand: number; onOrder: number };
    bfn: { available: number; onHand: number; onOrder: number };
  };
}

interface Warehouse {
  id: number;
  name: string;
  location: string;
  description: string;
  internalLocations: string[];
}

interface ProductsResponse {
  products: Product[];
  total: number;
  filteredWarehouses: string[];
}

export function ProductTable() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedWarehouses, setSelectedWarehouses] = useState<{ [key: number]: string }>({});
  const [quantities, setQuantities] = useState<{ [key: number]: number }>({});

  const { data: products, isLoading: productsLoading } = useQuery<ProductsResponse>({
    queryKey: ["/api/products"],
    enabled: true,
  });

  const { data: warehouses } = useQuery<Warehouse[]>({
    queryKey: ["/api/warehouses"],
  });

  const addToCartMutation = useMutation({
    mutationFn: async (item: { sku: string; quantity: number; warehouse: string; productId: number }) => {
      const res = await apiRequest("POST", "/api/cart", {
        sku: item.sku,
        quantity: item.quantity,
        warehouse: item.warehouse,
        productId: item.productId,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
    },
  });

  const getStockIndicator = (product: Product) => {
    const totalAvailable = product.available;
    
    if (totalAvailable > 50) return "stock-high";
    if (totalAvailable > 0) return "stock-medium";
    return "stock-none";
  };

  const getTotalStock = (product: Product) => {
    return product.available;
  };

  const getWarehouseStock = (product: Product) => {
    const breakdown = product.warehouseBreakdown;
    return [
      { warehouse: "JHB Warehouse", available: breakdown.jhb.available, onHand: breakdown.jhb.onHand },
      { warehouse: "CPT Warehouse", available: breakdown.cpt.available, onHand: breakdown.cpt.onHand },
      { warehouse: "BFN Warehouse", available: breakdown.bfn.available, onHand: breakdown.bfn.onHand },
    ].filter(w => w.available > 0 || w.onHand > 0);
  };

  const handleAddToCart = (product: Product) => {
    const warehouseName = selectedWarehouses[product.id];
    const quantity = quantities[product.id] || 1;
    
    if (!warehouseName) return;

    addToCartMutation.mutate({
      sku: product.sku,
      quantity,
      warehouse: warehouseName,
      productId: product.id,
    });
  };

  const canAddToCart = (product: Product) => {
    return selectedWarehouses[product.id] && getTotalStock(product) > 0;
  };

  return (
    <div className="space-y-6" data-testid="product-table">
      {/* Search and Filters */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0 lg:space-x-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  type="text"
                  placeholder="Search products by name, SKU, or brand..."
                  className="pl-10"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  data-testid="input-search"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Product Table */}
      <Card>
        <CardHeader>
          <CardTitle data-testid="text-table-title">Product Catalog</CardTitle>
          <CardDescription data-testid="text-table-description">
            Multi-warehouse inventory with real-time Cin7 sync
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/30">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Product
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    SKU / Barcode
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Stock Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Warehouses
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-card divide-y divide-border">
                {productsLoading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">
                      Loading products...
                    </td>
                  </tr>
                ) : !products?.products?.length ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">
                      No products found
                    </td>
                  </tr>
                ) : (
                  products.products.map((product) => {
                    const stockIndicator = getStockIndicator(product);
                    const totalStock = getTotalStock(product);
                    const warehouseStock = getWarehouseStock(product);

                    return (
                      <tr key={product.id} className="hover:bg-muted/20 transition-colors" data-testid={`row-product-${product.id}`}>
                        <td className="px-6 py-4">
                          <div className="flex items-center">
                            {product.imageUrl || (product.images && product.images.length > 0) ? (
                              <img 
                                src={product.imageUrl || product.images[0]} 
                                alt={product.name} 
                                className="h-12 w-12 rounded-md object-cover border" 
                                data-testid={`img-product-${product.id}`}
                                onError={(e) => {
                                  // If main image fails, try other images or fallback to placeholder
                                  const img = e.target as HTMLImageElement;
                                  if (product.images && product.images.length > 1) {
                                    const currentSrc = img.src;
                                    const currentIndex = product.images.indexOf(currentSrc);
                                    if (currentIndex < product.images.length - 1) {
                                      img.src = product.images[currentIndex + 1];
                                      return;
                                    }
                                  }
                                  // All images failed, show placeholder
                                  img.style.display = 'none';
                                  const placeholder = img.nextElementSibling as HTMLElement;
                                  if (placeholder) {
                                    placeholder.style.display = 'flex';
                                  }
                                }}
                              />
                            ) : null}
                            <div 
                              className="h-12 w-12 rounded-md bg-gradient-to-br from-royal-blue/10 to-royal-blue/20 flex items-center justify-center border"
                              style={{ display: product.imageUrl || (product.images && product.images.length > 0) ? 'none' : 'flex' }}
                              data-testid={`placeholder-product-${product.id}`}
                            >
                              <span className="text-xs text-royal-blue font-medium">{product.sku.slice(0, 3)}</span>
                            </div>
                            <div className="ml-4 flex-1">
                              <div className="text-sm font-medium text-foreground" data-testid={`text-product-name-${product.id}`}>
                                {product.name || product.sku}
                              </div>
                              <div className="text-sm text-muted-foreground" data-testid={`text-product-brand-${product.id}`}>
                                {product.brand || "No Brand"}
                              </div>
                              {product.images && product.images.length > 1 && (
                                <div className="text-xs text-royal-blue mt-1" data-testid={`text-image-count-${product.id}`}>
                                  {product.images.length} images available
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-foreground" data-testid={`text-product-sku-${product.id}`}>
                            {product.sku}
                          </div>
                          <div className="text-xs text-muted-foreground" data-testid={`text-product-barcode-${product.id}`}>
                            {product.barcode || "No Barcode"}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center">
                            <span className={`stock-indicator ${stockIndicator}`}></span>
                            <span 
                              className={`text-sm font-medium ${
                                totalStock > 50 ? "text-success" : 
                                totalStock > 0 ? "text-warning" : 
                                "text-destructive"
                              }`}
                              data-testid={`text-stock-status-${product.id}`}
                            >
                              {totalStock > 0 ? `In Stock (${totalStock})` : "Out of Stock"}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <WarehouseStockDisplay availability={availability} />
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center space-x-2">
                            <Select
                              value={selectedWarehouses[product.id]?.toString() || ""}
                              onValueChange={(value) => setSelectedWarehouses({
                                ...selectedWarehouses,
                                [product.id]: parseInt(value)
                              })}
                              data-testid={`select-warehouse-${product.id}`}
                            >
                              <SelectTrigger className="w-24 h-8 text-xs">
                                <SelectValue placeholder="Warehouse" />
                              </SelectTrigger>
                              <SelectContent>
                                {(warehouses as any)?.map((warehouse: any) => (
                                  <SelectItem key={warehouse.id} value={warehouse.id.toString()}>
                                    {warehouse.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Input
                              type="number"
                              min="1"
                              max={Math.max(1, totalStock)}
                              value={quantities[product.id] || 1}
                              onChange={(e) => setQuantities({
                                ...quantities,
                                [product.id]: parseInt(e.target.value) || 1
                              })}
                              className="w-16 h-8 text-xs"
                              data-testid={`input-quantity-${product.id}`}
                            />
                            {canAddToCart(product.id) ? (
                              <Button
                                size="sm"
                                onClick={() => handleAddToCart(product)}
                                disabled={addToCartMutation.isPending}
                                data-testid={`button-add-${product.id}`}
                              >
                                <Plus className="h-3 w-3 mr-1" />
                                Add
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="secondary"
                                disabled
                                data-testid={`button-unavailable-${product.id}`}
                              >
                                <Ban className="h-3 w-3 mr-1" />
                                Unavailable
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          
          {/* Pagination */}
          {products && products.totalPages > 1 && (
            <div className="px-6 py-4 border-t border-border bg-muted/30">
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground" data-testid="text-pagination-info">
                  Showing {((products.page - 1) * products.pageSize) + 1} to {Math.min(products.page * products.pageSize, products.total)} of {products.total} products
                </div>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(page - 1)}
                    disabled={page <= 1}
                    data-testid="button-previous-page"
                  >
                    Previous
                  </Button>
                  <span className="px-3 py-1 bg-primary text-primary-foreground rounded text-sm" data-testid="text-current-page">
                    {products.page}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(page + 1)}
                    disabled={page >= products.totalPages}
                    data-testid="button-next-page"
                  >
                    Next
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
