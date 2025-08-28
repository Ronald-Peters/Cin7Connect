import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, MapPin, Clock, Shield } from "lucide-react";

export default function HomePage() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1e3a8a] to-[#3b82f6]" data-testid="home-page">
      {/* Hero Section */}
      <div className="relative">
        <div className="absolute inset-0 bg-black/20"></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="text-center text-white">
            <img 
              src="/reivilo-logo.jpg" 
              alt="Reivilo Logo" 
              className="h-20 w-auto mx-auto mb-6"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
            <h1 className="text-5xl font-bold mb-4">45 Years of Excellence</h1>
            <p className="text-xl mb-8 opacity-90">
              Family Business Values • Cutting-Edge Technology • South African Excellence
            </p>
            
            <div className="flex flex-wrap justify-center gap-4 mb-8">
              <div className="flex items-center bg-white/10 backdrop-blur-sm rounded-lg px-4 py-2">
                <Package className="h-5 w-5 mr-2" />
                <span>Multi-Warehouse</span>
              </div>
              <div className="flex items-center bg-white/10 backdrop-blur-sm rounded-lg px-4 py-2">
                <MapPin className="h-5 w-5 mr-2" />
                <span>3 Locations</span>
              </div>
              <div className="flex items-center bg-white/10 backdrop-blur-sm rounded-lg px-4 py-2">
                <Clock className="h-5 w-5 mr-2" />
                <span>Real-Time Sync</span>
              </div>
              <div className="flex items-center bg-white/10 backdrop-blur-sm rounded-lg px-4 py-2">
                <Shield className="h-5 w-5 mr-2" />
                <span>Enterprise Grade</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                size="lg"
                className="bg-white text-[#1e3a8a] hover:bg-gray-100 px-8 py-4 text-lg font-semibold"
                onClick={() => setLocation("/catalog")}
                data-testid="button-catalog"
              >
                Browse Catalog
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-white text-white hover:bg-white hover:text-[#1e3a8a] px-8 py-4 text-lg font-semibold"
                onClick={() => setLocation("/profile")}
                data-testid="button-profile"
              >
                My Account
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="bg-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-[#1e3a8a] mb-4">Comprehensive B2B Solutions</h2>
            <p className="text-xl text-gray-600">
              Built on 45 years of family business values, enhanced with modern technology
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <Card className="border-[#e2e8f0] hover:shadow-lg transition-shadow">
              <CardHeader className="text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-[#1e3a8a] to-[#3b82f6] rounded-full flex items-center justify-center mx-auto mb-4">
                  <Package className="h-8 w-8 text-white" />
                </div>
                <CardTitle className="text-[#1e40af]">Multi-Warehouse Inventory</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-center">
                  Real-time stock visibility across all Reivilo warehouse locations. Track available stock quantities with precision.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="border-[#e2e8f0] hover:shadow-lg transition-shadow">
              <CardHeader className="text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-[#1e3a8a] to-[#3b82f6] rounded-full flex items-center justify-center mx-auto mb-4">
                  <MapPin className="h-8 w-8 text-white" />
                </div>
                <CardTitle className="text-[#1e40af]">3 Strategic Locations</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-center">
                  Johannesburg, Cape Town, and Bloemfontein warehouses ensuring rapid delivery across South Africa.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="border-[#e2e8f0] hover:shadow-lg transition-shadow">
              <CardHeader className="text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-[#1e3a8a] to-[#3b82f6] rounded-full flex items-center justify-center mx-auto mb-4">
                  <Clock className="h-8 w-8 text-white" />
                </div>
                <CardTitle className="text-[#1e40af]">Real-Time Sync</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-center">
                  Live integration with Cin7 Core for accurate pricing, inventory levels, and instant order processing.
                </CardDescription>
              </CardContent>
            </Card>
          </div>

          <div className="text-center mt-16">
            <h3 className="text-2xl font-bold text-[#1e3a8a] mb-4">Ready to Get Started?</h3>
            <p className="text-gray-600 mb-8">
              Access our complete product catalog with real-time pricing and availability
            </p>
            <Button
              size="lg"
              className="bg-[#1e3a8a] hover:bg-[#1e40af] px-12 py-4 text-lg font-semibold"
              onClick={() => setLocation("/catalog")}
              data-testid="button-get-started"
            >
              Get Started
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
