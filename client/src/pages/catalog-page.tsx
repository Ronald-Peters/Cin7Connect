import { Header } from "@/components/header";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, Package, MapPin, Coins } from "lucide-react";
import { useState } from "react";

export default function CatalogPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 12;

  const { data: products, isLoading } = useQuery({
    queryKey: ["/api/products", { q: searchQuery, page, pageSize }],
  });

  const { data: warehouses } = useQuery({
    queryKey: ["/api/warehouses"],
  });

  const productsData = products as any;
  const warehouseData = warehouses as any;
  
  const totalProducts = parseInt(productsData?.total || '0');
  const warehouseCount = warehouseData?.length || 3;

  return (
    <div className="min-h-screen bg-background" data-testid="catalog-page">
      <Header />
      
      {/* Page Header */}
      <div className="bg-white border-b-3 border-[#1e3a8a] shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="text-center mb-6">
            <h1 className="text-4xl font-bold text-[#1e3a8a] mb-2">Product Catalog</h1>
            <p className="text-lg text-muted-foreground">Multi-warehouse inventory with real-time Cin7 sync</p>
          </div>
          
          {/* Search Bar */}
          <div className="max-w-2xl mx-auto">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                type="text"
                placeholder="Search products by name, SKU, or brand..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-12 text-base"
                data-testid="input-search"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="bg-white border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
            <div className="flex flex-col items-center space-y-1">
              <div className="flex items-center space-x-2">
                <Package className="h-5 w-5 text-[#1e3a8a]" />
                <span className="text-2xl font-bold text-[#1e3a8a]">{totalProducts}</span>
              </div>
              <span className="text-sm text-muted-foreground">Products Available</span>
            </div>
            <div className="flex flex-col items-center space-y-1">
              <div className="flex items-center space-x-2">
                <MapPin className="h-5 w-5 text-[#1e3a8a]" />
                <span className="text-2xl font-bold text-[#1e3a8a]">{warehouseCount}</span>
              </div>
              <span className="text-sm text-muted-foreground">Reivilo Locations</span>
            </div>
            <div className="flex flex-col items-center space-y-1">
              <div className="flex items-center space-x-2">
                <Coins className="h-5 w-5 text-[#1e3a8a]" />
                <span className="text-2xl font-bold text-[#1e3a8a]">ZAR</span>
              </div>
              <span className="text-sm text-muted-foreground">South African Rand</span>
            </div>
          </div>
        </div>
      </div>

      {/* Products Grid */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader>
                  <div className="h-4 bg-muted rounded w-3/4"></div>
                  <div className="h-3 bg-muted rounded w-1/2"></div>
                </CardHeader>
                <CardContent>
                  <div className="h-20 bg-muted rounded mb-4"></div>
                  <div className="h-4 bg-muted rounded w-full mb-2"></div>
                  <div className="h-4 bg-muted rounded w-2/3"></div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : !productsData?.items?.length ? (
          <div className="text-center py-12">
            <Package className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">No products found</h3>
            <p className="text-muted-foreground mb-6">
              {searchQuery 
                ? `No products match "${searchQuery}". Try adjusting your search.`
                : "Products are currently being synced from Cin7. Please check back in a few moments."
              }
            </p>
            {searchQuery && (
              <Button onClick={() => setSearchQuery("")} variant="outline">
                Clear Search
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {productsData.items.map((product: any) => (
                <Card key={product.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-center space-x-3">
                      <div className="w-12 h-12 bg-gradient-to-br from-[#1e3a8a] to-[#3b82f6] rounded-lg flex items-center justify-center text-white font-bold text-lg">
                        {product.sku?.substring(0, 2) || 'P'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-sm font-semibold text-[#1e40af] truncate">
                          {product.name}
                        </CardTitle>
                        <p className="text-xs text-muted-foreground font-mono">
                          {product.sku}
                        </p>
                      </div>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="pt-0">
                    <div className="space-y-3">
                      {/* Stock Status */}
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Stock Status:</span>
                        <span className="text-sm text-green-600 font-semibold">In Stock</span>
                      </div>
                      
                      {/* Warehouse Stock */}
                      <div className="space-y-1">
                        <span className="text-xs font-medium text-muted-foreground">Warehouses:</span>
                        <div className="grid grid-cols-3 gap-1 text-xs">
                          <div className="text-center p-1 bg-muted rounded">
                            <div className="font-semibold">JHB</div>
                            <div className="text-green-600">25</div>
                          </div>
                          <div className="text-center p-1 bg-muted rounded">
                            <div className="font-semibold">CPT</div>
                            <div className="text-green-600">18</div>
                          </div>
                          <div className="text-center p-1 bg-muted rounded">
                            <div className="font-semibold">BFN</div>
                            <div className="text-green-600">12</div>
                          </div>
                        </div>
                      </div>
                      
                      {/* Price */}
                      <div className="flex items-center justify-between">
                        <span className="text-lg font-bold text-[#1e3a8a]">
                          R {product.price?.toLocaleString() || '0'}
                        </span>
                        <span className="text-xs text-muted-foreground">ZAR</span>
                      </div>
                      
                      {/* Actions */}
                      <div className="flex space-x-2">
                        <Select defaultValue="JHB">
                          <SelectTrigger className="h-8 text-xs flex-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="JHB">JHB</SelectItem>
                            <SelectItem value="CPT">CPT</SelectItem>
                            <SelectItem value="BFN">BFN</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button size="sm" className="bg-[#1e3a8a] hover:bg-[#1e40af]">
                          <Plus className="h-3 w-3 mr-1" />
                          Add
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            
            {/* Pagination */}
            {productsData && productsData.totalPages > 1 && (
              <div className="mt-8 flex items-center justify-center space-x-4">
                <Button
                  variant="outline"
                  onClick={() => setPage(page - 1)}
                  disabled={page <= 1}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page} of {productsData.totalPages}
                </span>
                <Button
                  variant="outline"
                  onClick={() => setPage(page + 1)}
                  disabled={page >= productsData.totalPages}
                >
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}