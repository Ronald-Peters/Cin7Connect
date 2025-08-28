import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

interface Customer {
  id: number;
  erpCustomerId: string;
  companyName: string;
  terms: string;
  priceTier: string;
  defaultAddress: string;
  billingAddress: string;
  shippingAddress: string;
  contacts: Array<{
    name: string;
    email: string;
    phone: string;
    role: string;
  }>;
}

export default function ProfilePage() {
  const { data: customer, isLoading, error } = useQuery<Customer>({
    queryKey: ["/api/customers/me"],
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </main>
      </div>
    );
  }

  if (error || !customer) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground" data-testid="text-no-profile">
                No customer profile found. Please contact your administrator.
              </p>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  // Mock recent orders data
  const recentOrders = [
    {
      id: 1,
      quoteNumber: "Q-2024-001",
      date: "2024-01-15",
      total: 1247.85,
      status: "Pending Approval",
      cin7Id: "SO-789456",
    },
    {
      id: 2,
      quoteNumber: "Q-2024-002", 
      date: "2024-01-12",
      total: 583.99,
      status: "Approved",
      cin7Id: "SO-789123",
    },
  ];

  return (
    <div className="min-h-screen bg-background" data-testid="profile-page">
      <Header />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-foreground mb-2" data-testid="text-page-title">
            Account Profile
          </h2>
          <p className="text-muted-foreground" data-testid="text-page-description">
            Manage your account information and preferences
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Company Information */}
          <Card>
            <CardHeader>
              <CardTitle data-testid="text-company-info-title">Company Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Company Name</label>
                <div className="px-3 py-2 bg-muted rounded-md text-foreground" data-testid="text-company-name">
                  {customer.companyName || "No company name"}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Price Tier</label>
                <div className="px-3 py-2 bg-muted rounded-md text-foreground" data-testid="text-price-tier">
                  {customer.priceTier || "Standard"}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Payment Terms</label>
                <div className="px-3 py-2 bg-muted rounded-md text-foreground" data-testid="text-payment-terms">
                  {customer.terms || "Net 30 Days"}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">ERP Customer ID</label>
                <div className="px-3 py-2 bg-muted rounded-md text-foreground" data-testid="text-erp-id">
                  {customer.erpCustomerId || "Not linked"}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Contact Information */}
          <Card>
            <CardHeader>
              <CardTitle data-testid="text-contact-info-title">Contact Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {customer.contacts && customer.contacts.length > 0 ? (
                customer.contacts.map((contact, index) => (
                  <div key={index} className="border border-border rounded-lg p-4" data-testid={`contact-${index}`}>
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-medium text-foreground" data-testid={`text-contact-name-${index}`}>
                        {contact.name}
                      </p>
                      <Badge variant="secondary" data-testid={`text-contact-role-${index}`}>
                        {contact.role}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground" data-testid={`text-contact-email-${index}`}>
                      {contact.email}
                    </p>
                    <p className="text-sm text-muted-foreground" data-testid={`text-contact-phone-${index}`}>
                      {contact.phone}
                    </p>
                  </div>
                ))
              ) : (
                <div className="text-center py-4">
                  <p className="text-muted-foreground" data-testid="text-no-contacts">
                    No contact information available
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Address Information */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle data-testid="text-address-info-title">Address Information</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Default Address</label>
                <div className="px-3 py-2 bg-muted rounded-md text-foreground min-h-20" data-testid="text-default-address">
                  {customer.defaultAddress || "No address on file"}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Billing Address</label>
                <div className="px-3 py-2 bg-muted rounded-md text-foreground min-h-20" data-testid="text-billing-address">
                  {customer.billingAddress || "Same as default"}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Shipping Address</label>
                <div className="px-3 py-2 bg-muted rounded-md text-foreground min-h-20" data-testid="text-shipping-address">
                  {customer.shippingAddress || "Same as default"}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Recent Orders */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle data-testid="text-orders-title">Recent Orders & Quotes</CardTitle>
              <CardDescription data-testid="text-orders-description">
                Your recent quote submissions and their status
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted/30">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Quote #
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Total
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Cin7 ID
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-card divide-y divide-border">
                    {recentOrders.length > 0 ? (
                      recentOrders.map((order) => (
                        <tr key={order.id} className="hover:bg-muted/20 transition-colors" data-testid={`order-row-${order.id}`}>
                          <td className="px-6 py-4 text-sm font-medium text-foreground" data-testid={`text-quote-number-${order.id}`}>
                            {order.quoteNumber}
                          </td>
                          <td className="px-6 py-4 text-sm text-muted-foreground" data-testid={`text-order-date-${order.id}`}>
                            {order.date}
                          </td>
                          <td className="px-6 py-4 text-sm text-foreground" data-testid={`text-order-total-${order.id}`}>
                            ${order.total.toFixed(2)}
                          </td>
                          <td className="px-6 py-4">
                            <Badge 
                              variant={order.status === "Approved" ? "default" : "secondary"}
                              data-testid={`text-order-status-${order.id}`}
                            >
                              {order.status}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 text-sm text-muted-foreground" data-testid={`text-cin7-id-${order.id}`}>
                            {order.cin7Id}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground" data-testid="text-no-orders">
                          No recent orders found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
