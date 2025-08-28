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
  barcode: string;
  brand: string;
  imageUrl: string;
}

interface ProductAvailability {
  productId: number;
  warehouseId: number;
  warehouse: {
    id: number;
    cin7LocationName: string;
  };
  available: string;
  onHand: string;
  onOrder: string;
}

interface ProductsResponse {
  items: Product[];
  availability: ProductAvailability[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function ProductTable() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedWarehouses, setSelectedWarehouses] = useState<{ [key: number]: number }>({});
  const [quantities, setQuantities] = useState<{ [key: number]: number }>({});

  const { data: products, isLoading: productsLoading } = useQuery<ProductsResponse>({
    queryKey: ["/api/products", { q: search, page, pageSize: 10 }],
    enabled: true,
  });

  const { data: warehouses } = useQuery({
    queryKey: ["/api/warehouses"],
  });

  const addToCartMutation = useMutation({
    mutationFn: async (item: { sku: string; quantity: number; warehouse: string; productId: number }) => {
      const currentCart = await queryClient.fetchQuery({
        queryKey: ["/api/cart"],
      }) as any;

      const existingItems = currentCart?.items || [];
      const newItem = {
        sku: item.sku,
        quantity: item.quantity,
        warehouse: item.warehouse,
      };

      const updatedItems = [...existingItems, newItem];

      const res = await apiRequest("POST", "/api/cart", {
        items: updatedItems,
        location: item.warehouse,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
    },
  });

  const getStockIndicator = (productId: number) => {
    if (!products?.availability) return "stock-none";
    
    const productAvailability = products.availability.filter(a => a.productId === productId);
    const totalAvailable = productAvailability.reduce((sum, stock) => sum + parseFloat(stock.available), 0);
    
    if (totalAvailable > 50) return "stock-high";
    if (totalAvailable > 0) return "stock-medium";
    return "stock-none";
  };

  const getTotalStock = (productId: number) => {
    if (!products?.availability) return 0;
    
    const productAvailability = products.availability.filter(a => a.productId === productId);
    return productAvailability.reduce((sum, stock) => sum + parseFloat(stock.available), 0);
  };

  const getProductAvailability = (productId: number) => {
    if (!products?.availability) return [];
    return products.availability.filter(a => a.productId === productId);
  };

  const handleAddToCart = (product: Product) => {
    const warehouseId = selectedWarehouses[product.id];
    const quantity = quantities[product.id] || 1;
    
    if (!warehouseId) return;
    
    const warehouse = (warehouses as any)?.find((w: any) => w.id === warehouseId);
    if (!warehouse) return;

    addToCartMutation.mutate({
      sku: product.sku,
      quantity,
      warehouse: warehouse.name,
      productId: product.id,
    });
  };

  const canAddToCart = (productId: number) => {
    return selectedWarehouses[productId] && getTotalStock(productId) > 0;
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
                ) : !products?.items?.length ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">
                      No products found
                    </td>
                  </tr>
                ) : (
                  products.items.map((product) => {
                    const stockIndicator = getStockIndicator(product.id);
                    const totalStock = getTotalStock(product.id);
                    const availability = getProductAvailability(product.id);

                    return (
                      <tr key={product.id} className="hover:bg-muted/20 transition-colors" data-testid={`row-product-${product.id}`}>
                        <td className="px-6 py-4">
                          <div className="flex items-center">
                            {product.imageUrl ? (
                              <img 
                                src={product.imageUrl} 
                                alt={product.name} 
                                className="h-12 w-12 rounded-md object-cover" 
                                data-testid={`img-product-${product.id}`}
                              />
                            ) : (
                              <div 
                                className="h-12 w-12 rounded-md bg-muted flex items-center justify-center"
                                data-testid={`placeholder-product-${product.id}`}
                              >
                                <span className="text-xs text-muted-foreground">No Image</span>
                              </div>
                            )}
                            <div className="ml-4">
                              <div className="text-sm font-medium text-foreground" data-testid={`text-product-name-${product.id}`}>
                                {product.name || product.sku}
                              </div>
                              <div className="text-sm text-muted-foreground" data-testid={`text-product-brand-${product.id}`}>
                                {product.brand || "No Brand"}
                              </div>
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
