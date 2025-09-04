import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ShoppingCart, Package, FileText, User, LogOut, Shield, Home } from "lucide-react";
import reiviloLogo from "@/assets/reivilo-logo.jpg";

export function Header() {
  const [location, setLocation] = useLocation();
  const { user, logoutMutation } = useAuth();

  const { data: cart } = useQuery({
    queryKey: ["/api/cart"],
    enabled: !!user,
  });

  const cartItemCount = (cart as any)?.items?.length || 0;

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  const navItems = [
    { path: "/", label: "Home", icon: Home },
    { path: "/catalog", label: "Catalog", icon: Package },
    { path: "/cart", label: "Cart", icon: ShoppingCart },
    { path: "/profile", label: "Profile", icon: User },
    ...(user?.role === 'admin' ? [{ path: "/admin", label: "Admin", icon: Shield }] : []),
  ];

  return (
    <header className="bg-card border-b border-border shadow-sm" data-testid="header">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-3">
              <img 
                src={reiviloLogo} 
                alt="Reivilo Logo" 
                className="h-10 w-auto cursor-pointer"
                onClick={() => setLocation("/")}
                data-testid="img-logo"
              />
              <div className="flex flex-col">
                <h1 
                  className="text-lg font-bold text-primary cursor-pointer leading-tight" 
                  onClick={() => setLocation("/")}
                  data-testid="text-logo"
                >
                  Reivilo B2B
                </h1>
              </div>
            </div>
            <nav className="hidden md:flex space-x-6">
              {navItems.map(({ path, label, icon: Icon }) => (
                <Button
                  key={path}
                  variant="ghost"
                  className={`${
                    location === path
                      ? "text-foreground border-b-2 border-primary rounded-none"
                      : "text-muted-foreground hover:text-primary"
                  } transition-colors font-medium`}
                  onClick={() => setLocation(path)}
                  data-testid={`nav-${label.toLowerCase()}`}
                >
                  <Icon className="mr-2 h-4 w-4" />
                  {label}
                </Button>
              ))}
            </nav>
          </div>
          
          <div className="flex items-center space-x-4">
            <Button
              variant="ghost"
              className="relative p-2 text-muted-foreground hover:text-primary transition-colors"
              onClick={() => setLocation("/cart")}
              data-testid="button-cart"
            >
              <ShoppingCart className="h-5 w-5" />
              {cartItemCount > 0 && (
                <span 
                  className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-xs rounded-full h-5 w-5 flex items-center justify-center"
                  data-testid="text-cart-count"
                >
                  {cartItemCount}
                </span>
              )}
            </Button>
            
            <div className="flex items-center space-x-2">
              <span className="text-sm text-muted-foreground" data-testid="text-company-name">
                {user?.customer?.companyName || user?.email || "Guest"}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                disabled={logoutMutation.isPending}
                data-testid="button-logout"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
