import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Users, Building2, Package, ShoppingCart, FileText, ArrowRight } from "lucide-react";
import { useLocation } from "wouter";

export function LandingPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-royal-blue/10 to-royal-blue/5 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-32 h-32 bg-royal-blue/15 rounded-full mb-8 border-2 border-royal-blue/20">
              <img 
                src="@assets/IMG-20240703-WA0009_1756368997024.jpg" 
                alt="Reivilo 45 Years" 
                className="h-20 w-auto opacity-80"
                data-testid="img-hero-logo"
              />
            </div>
            <h1 className="text-5xl font-bold text-foreground mb-4" data-testid="text-hero-title">
              45 Years of Excellence
            </h1>
            <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto" data-testid="text-hero-description">
              Family business values with cutting-edge technology. Real-time inventory, customer-specific pricing, and seamless quote generation since 1980.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                size="lg" 
                onClick={() => setLocation("/auth")}
                className="text-lg px-8 py-4"
                data-testid="button-get-started"
              >
                Get Started
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button 
                variant="outline" 
                size="lg"
                onClick={() => setLocation("/catalog")}
                className="text-lg px-8 py-4"
                data-testid="button-view-catalog"
              >
                <Package className="mr-2 h-5 w-5" />
                View Catalog
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-foreground mb-4" data-testid="text-features-title">
              Why Choose Reivilo?
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto" data-testid="text-features-description">
              Four and a half decades of trusted partnership with the tire industry, now enhanced with modern technology.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <Card className="text-center" data-testid="card-feature-security">
              <CardHeader>
                <div className="inline-flex items-center justify-center w-16 h-16 bg-royal-blue/15 rounded-full mb-4 mx-auto">
                  <Shield className="h-8 w-8 text-royal-blue" />
                </div>
                <CardTitle>Secure Authentication</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Protected access with role-based permissions and secure customer data management.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="text-center" data-testid="card-feature-pricing">
              <CardHeader>
                <div className="inline-flex items-center justify-center w-16 h-16 bg-royal-blue/15 rounded-full mb-4 mx-auto">
                  <Users className="h-8 w-8 text-royal-blue" />
                </div>
                <CardTitle>Customer-Specific Pricing</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Tiered pricing based on your business relationship and volume commitments.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="text-center" data-testid="card-feature-inventory">
              <CardHeader>
                <div className="inline-flex items-center justify-center w-16 h-16 bg-royal-blue/15 rounded-full mb-4 mx-auto">
                  <Building2 className="h-8 w-8 text-royal-blue" />
                </div>
                <CardTitle>Multi-Warehouse Inventory</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Real-time stock levels across JHB, CPT, and BFN warehouses with live Cin7 integration.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="text-center" data-testid="card-feature-catalog">
              <CardHeader>
                <div className="inline-flex items-center justify-center w-16 h-16 bg-royal-blue/15 rounded-full mb-4 mx-auto">
                  <Package className="h-8 w-8 text-royal-blue" />
                </div>
                <CardTitle>Comprehensive Catalog</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Browse our complete tire inventory with detailed specifications and availability.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="text-center" data-testid="card-feature-cart">
              <CardHeader>
                <div className="inline-flex items-center justify-center w-16 h-16 bg-royal-blue/15 rounded-full mb-4 mx-auto">
                  <ShoppingCart className="h-8 w-8 text-royal-blue" />
                </div>
                <CardTitle>Smart Cart System</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Add products from multiple warehouses and manage quantities with ease.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="text-center" data-testid="card-feature-quotes">
              <CardHeader>
                <div className="inline-flex items-center justify-center w-16 h-16 bg-royal-blue/15 rounded-full mb-4 mx-auto">
                  <FileText className="h-8 w-8 text-royal-blue" />
                </div>
                <CardTitle>Instant Quotes</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Generate professional quotes that sync directly to our Cin7 system for fast processing.
                </CardDescription>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-br from-royal-blue/5 to-royal-blue/10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-foreground mb-4" data-testid="text-cta-title">
            Ready to Experience the Difference?
          </h2>
          <p className="text-lg text-muted-foreground mb-8" data-testid="text-cta-description">
            Join the family business that's been serving the tire industry with integrity and innovation since 1980.
          </p>
          <Button 
            size="lg" 
            onClick={() => setLocation("/auth")}
            className="text-lg px-8 py-4"
            data-testid="button-cta-start"
          >
            Start Your Journey
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </div>
      </section>
    </div>
  );
}