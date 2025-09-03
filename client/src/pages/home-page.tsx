import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Header } from "@/components/header";
import reiviloLogo from "@/assets/reivilo-logo.jpg";

export default function HomePage() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-white" data-testid="home-page">
      <Header />
      
      {/* Hero Section */}
      <section className="bg-white">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <div className="flex flex-col lg:flex-row items-center gap-12">
            {/* Left Content */}
            <div className="flex-1 lg:pr-8">
              <div className="mb-8">
                <img 
                  src={reiviloLogo} 
                  alt="Reivilo Industrial" 
                  className="h-24 w-auto mb-6"
                />
                <h1 className="text-4xl lg:text-5xl font-bold text-gray-900 mb-6 leading-tight">
                  Reivilo Industrial
                </h1>
                <h2 className="text-xl lg:text-2xl text-[#1e3a8a] font-semibold mb-4">
                  45 Years of Industrial Excellence
                </h2>
                <p className="text-lg text-gray-700 leading-relaxed mb-8">
                  Since 1979, Reivilo Industrial has been South Africa's trusted partner for quality industrial supplies. 
                  Our commitment to excellence and customer service has built lasting relationships with businesses 
                  across Johannesburg, Cape Town, and Bloemfontein.
                </p>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-4">
                <Button
                  size="lg"
                  className="bg-[#1e3a8a] hover:bg-[#1e40af] text-white px-8 py-3 text-base font-medium"
                  onClick={() => setLocation("/catalog")}
                  data-testid="button-catalog"
                >
                  View Product Catalog
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="border-[#1e3a8a] text-[#1e3a8a] hover:bg-[#1e3a8a] hover:text-white px-8 py-3 text-base font-medium"
                  onClick={() => setLocation("/profile")}
                  data-testid="button-profile"
                >
                  Customer Portal
                </Button>
              </div>
            </div>

            {/* Right Content - Company Stats */}
            <div className="flex-1 lg:pl-8">
              <div className="bg-gray-50 rounded-lg p-8">
                <h3 className="text-xl font-semibold text-gray-900 mb-6">Company Overview</h3>
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Established</span>
                    <span className="font-semibold text-gray-900">1979</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Locations</span>
                    <span className="font-semibold text-gray-900">3 Warehouses</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Service Areas</span>
                    <span className="font-semibold text-gray-900">Nationwide</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Business Type</span>
                    <span className="font-semibold text-gray-900">B2B Industrial</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Services Section */}
      <section className="bg-gray-50 py-16">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Our Services</h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Comprehensive industrial supply solutions with real-time inventory management 
              and efficient distribution across South Africa.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white rounded-lg p-8 shadow-sm">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Industrial Supplies</h3>
              <p className="text-gray-600">
                Comprehensive range of industrial products with real-time stock visibility 
                across all our warehouse locations.
              </p>
            </div>

            <div className="bg-white rounded-lg p-8 shadow-sm">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Multi-Location Service</h3>
              <p className="text-gray-600">
                Strategic warehouse locations in Johannesburg, Cape Town, and Bloemfontein 
                for rapid nationwide distribution.
              </p>
            </div>

            <div className="bg-white rounded-lg p-8 shadow-sm">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Customer Portal</h3>
              <p className="text-gray-600">
                Dedicated B2B portal with customer-specific pricing, order tracking, 
                and seamless procurement processes.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section className="bg-white py-16">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 mb-6">
                Ready to Partner with Us?
              </h2>
              <p className="text-lg text-gray-600 mb-8">
                Join hundreds of businesses who trust Reivilo Industrial for their supply needs. 
                Contact us today to discuss how we can support your operations.
              </p>
              <div className="space-y-3">
                <div className="flex items-center text-gray-600">
                  <span className="w-24 font-medium">Phone:</span>
                  <span>+27 (0)11 XXX-XXXX</span>
                </div>
                <div className="flex items-center text-gray-600">
                  <span className="w-24 font-medium">Email:</span>
                  <span>info@reiviloindustrial.co.za</span>
                </div>
                <div className="flex items-start text-gray-600">
                  <span className="w-24 font-medium">Address:</span>
                  <span>Head Office, Johannesburg<br />South Africa</span>
                </div>
              </div>
            </div>
            
            <div className="text-center lg:text-right">
              <Button
                size="lg"
                className="bg-[#1e3a8a] hover:bg-[#1e40af] text-white px-12 py-4 text-lg font-medium"
                onClick={() => setLocation("/catalog")}
                data-testid="button-get-started"
              >
                Get Started
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-8">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center">
            <p className="text-gray-400">
              © 2024 Reivilo Industrial. 45 Years of Excellence in Industrial Supply.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}