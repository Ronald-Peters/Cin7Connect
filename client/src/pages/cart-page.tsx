import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Minus, Plus, Trash2, ArrowLeft, FileText, Info } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

interface CartItem {
  sku: string;
  quantity: number;
  warehouse: string;
  price?: number;
}

interface Cart {
  items: CartItem[];
  location?: string;
}

export default function CartPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: cart, isLoading } = useQuery<Cart>({
    queryKey: ["/api/cart"],
  });

  const updateCartMutation = useMutation({
    mutationFn: async (updatedCart: Cart) => {
      const res = await apiRequest("POST", "/api/cart", updatedCart);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
    },
  });

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/cart/checkout");
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Quote Created Successfully",
        description: `Quote ${data.erp_sale_id} has been submitted for approval.`,
      });
      setLocation("/profile");
    },
    onError: (error: Error) => {
      toast({
        title: "Checkout Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateQuantity = (index: number, newQuantity: number) => {
    if (!cart) return;
    
    const updatedItems = [...cart.items];
    if (newQuantity <= 0) {
      updatedItems.splice(index, 1);
    } else {
      updatedItems[index] = { ...updatedItems[index], quantity: newQuantity };
    }
    
    updateCartMutation.mutate({
      ...cart,
      items: updatedItems,
    });
  };

  const removeItem = (index: number) => {
    if (!cart) return;
    
    const updatedItems = cart.items.filter((_, i) => i !== index);
    updateCartMutation.mutate({
      ...cart,
      items: updatedItems,
    });
  };

  const handleCheckout = () => {
    checkoutMutation.mutate();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="text-center py-8">Loading cart...</div>
        </main>
      </div>
    );
  }

  const cartItems = cart?.items || [];
  const isEmpty = cartItems.length === 0;

  // Mock pricing calculation (in production, this would come from the server)
  const subtotal = cartItems.reduce((sum, item) => sum + (item.price || 89.99) * item.quantity, 0);
  const tax = subtotal * 0.085;
  const shipping = subtotal > 500 ? 0 : 15.00;
  const total = subtotal + tax + shipping;

  return (
    <div className="min-h-screen bg-background" data-testid="cart-page">
      <Header />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-foreground mb-2" data-testid="text-page-title">
            Shopping Cart
          </h2>
          <p className="text-muted-foreground" data-testid="text-page-description">
            Review your items before creating a quote
          </p>
        </div>

        {isEmpty ? (
          <Card>
            <CardContent className="py-12 text-center">
              <div className="text-muted-foreground mb-4">
                <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                <p className="text-lg font-medium" data-testid="text-empty-cart">Your cart is empty</p>
                <p className="text-sm mt-2">Add some products to get started</p>
              </div>
              <Button onClick={() => setLocation("/")} data-testid="button-shop-now">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Continue Shopping
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Cart Items */}
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle data-testid="text-cart-items-title">Cart Items</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-border">
                    {cartItems.map((item, index) => (
                      <div key={`${item.sku}-${item.warehouse}-${index}`} className="p-6" data-testid={`cart-item-${index}`}>
                        <div className="flex items-center space-x-4">
                          <div className="h-16 w-16 rounded-md bg-muted flex items-center justify-center">
                            <span className="text-xs text-muted-foreground">No Image</span>
                          </div>
                          <div className="flex-1">
                            <h4 className="text-base font-medium text-foreground" data-testid={`text-item-sku-${index}`}>
                              {item.sku}
                            </h4>
                            <p className="text-sm text-muted-foreground" data-testid={`text-item-warehouse-${index}`}>
                              Warehouse: {item.warehouse}
                            </p>
                          </div>
                          <div className="flex items-center space-x-4">
                            <div className="flex items-center space-x-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => updateQuantity(index, item.quantity - 1)}
                                disabled={updateCartMutation.isPending}
                                data-testid={`button-decrease-${index}`}
                              >
                                <Minus className="h-3 w-3" />
                              </Button>
                              <span className="w-12 text-center" data-testid={`text-quantity-${index}`}>
                                {item.quantity}
                              </span>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => updateQuantity(index, item.quantity + 1)}
                                disabled={updateCartMutation.isPending}
                                data-testid={`button-increase-${index}`}
                              >
                                <Plus className="h-3 w-3" />
                              </Button>
                            </div>
                            <div className="text-right">
                              <p className="text-base font-semibold text-foreground" data-testid={`text-line-total-${index}`}>
                                ${((item.price || 89.99) * item.quantity).toFixed(2)}
                              </p>
                              <p className="text-sm text-muted-foreground" data-testid={`text-unit-price-${index}`}>
                                ${(item.price || 89.99).toFixed(2)} each
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeItem(index)}
                              disabled={updateCartMutation.isPending}
                              data-testid={`button-remove-${index}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Order Summary */}
            <div className="lg:col-span-1">
              <Card className="sticky top-6">
                <CardHeader>
                  <CardTitle data-testid="text-order-summary-title">Order Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="text-foreground" data-testid="text-subtotal">
                      ${subtotal.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Tax (8.5%)</span>
                    <span className="text-foreground" data-testid="text-tax">
                      ${tax.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Shipping</span>
                    <span className="text-foreground" data-testid="text-shipping">
                      ${shipping.toFixed(2)}
                    </span>
                  </div>
                  <hr className="border-border" />
                  <div className="flex justify-between text-lg font-semibold">
                    <span className="text-foreground">Total</span>
                    <span className="text-foreground" data-testid="text-total">
                      ${total.toFixed(2)}
                    </span>
                  </div>
                  
                  <div className="space-y-3 pt-4">
                    <Button
                      className="w-full"
                      onClick={handleCheckout}
                      disabled={checkoutMutation.isPending}
                      data-testid="button-create-quote"
                    >
                      {checkoutMutation.isPending ? (
                        "Creating Quote..."
                      ) : (
                        <>
                          <FileText className="h-4 w-4 mr-2" />
                          Create Quote
                        </>
                      )}
                    </Button>
                    <Button
                      variant="secondary"
                      className="w-full"
                      onClick={() => setLocation("/")}
                      data-testid="button-continue-shopping"
                    >
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Continue Shopping
                    </Button>
                  </div>
                  
                  <div className="mt-6 p-4 bg-muted rounded-lg">
                    <div className="flex items-start space-x-2">
                      <Info className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                      <div className="text-sm text-muted-foreground">
                        <p className="font-medium text-foreground mb-1" data-testid="text-quote-info-title">
                          Quote Process
                        </p>
                        <p data-testid="text-quote-info-description">
                          This will create a quote in Cin7 for approval. You'll receive confirmation once processed.
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
