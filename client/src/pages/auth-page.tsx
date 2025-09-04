import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Building2, Shield, Users } from "lucide-react";

export default function AuthPage() {
  const [, setLocation] = useLocation();
  const { user, loginMutation, registerMutation } = useAuth();
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [registerForm, setRegisterForm] = useState({ email: "", password: "", confirmPassword: "" });

  // Redirect if already logged in
  if (user) {
    setLocation("/");
    return null;
  }

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate(loginForm);
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (registerForm.password !== registerForm.confirmPassword) {
      return;
    }
    registerMutation.mutate({
      email: registerForm.email,
      password: registerForm.password,
    });
  };

  return (
    <div className="min-h-screen flex" data-testid="auth-page">
      {/* Left side - Authentication Forms */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center space-x-4 mb-4">
              <img 
                src="/reivilo-logo.jpg" 
                alt="Reivilo Logo" 
                className="h-16 w-auto object-contain"
                data-testid="img-logo"
                onError={(e) => {
                  const img = e.target as HTMLImageElement;
                  img.style.display = 'none';
                }}
              />
            </div>
            <h1 className="text-3xl font-bold text-primary mb-2" data-testid="text-app-title">
              Reivilo B2B Portal
            </h1>
            <p className="text-muted-foreground" data-testid="text-app-subtitle">
              Family Business Values
            </p>
          </div>

          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login" data-testid="tab-login">Login</TabsTrigger>
              <TabsTrigger value="register" data-testid="tab-register">Register</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <Card>
                <CardHeader>
                  <CardTitle data-testid="text-login-title">Sign In</CardTitle>
                  <CardDescription data-testid="text-login-description">
                    Enter your credentials to access your account
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                      <Label htmlFor="login-email">Email Address</Label>
                      <Input
                        id="login-email"
                        type="email"
                        placeholder="Enter your email"
                        value={loginForm.email}
                        onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                        required
                        data-testid="input-login-email"
                      />
                    </div>
                    <div>
                      <Label htmlFor="login-password">Password</Label>
                      <Input
                        id="login-password"
                        type="password"
                        placeholder="Enter your password"
                        value={loginForm.password}
                        onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                        required
                        data-testid="input-login-password"
                      />
                    </div>
                    <Button 
                      type="submit" 
                      className="w-full" 
                      disabled={loginMutation.isPending}
                      data-testid="button-login-submit"
                    >
                      {loginMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Signing In...
                        </>
                      ) : (
                        "Sign In"
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="register">
              <Card>
                <CardHeader>
                  <CardTitle data-testid="text-register-title">Contact Administrator</CardTitle>
                  <CardDescription data-testid="text-register-description">
                    Registration is restricted to authorized personnel only
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8 space-y-4">
                    <Shield className="h-12 w-12 text-muted-foreground mx-auto" />
                    <div>
                      <h3 className="font-semibold text-foreground mb-2">
                        Admin-Controlled Access
                      </h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Client accounts are created exclusively by Reivilo administrators. 
                        Please contact your sales representative for access.
                      </p>
                      <div className="text-xs text-muted-foreground space-y-1">
                        <p>📧 sales2@reiviloindustrial.co.za</p>
                        <p>📧 ronald@reiviloindustrial.co.za</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <div className="mt-6 pt-6 border-t border-border text-center">
            <p className="text-sm text-muted-foreground" data-testid="text-help-message">
              Need access? Contact your administrator
            </p>
          </div>
        </div>
      </div>

      {/* Right side - Hero Section */}
      <div className="flex-1 bg-gradient-to-br from-reivilo-purple/10 to-reivilo-light/20 flex items-center justify-center p-8">
        <div className="max-w-md text-center">
          <div className="mb-8">
            <div className="inline-flex items-center justify-center w-24 h-24 bg-reivilo-purple/15 rounded-full mb-6 border-2 border-reivilo-purple/20">
              <img 
                src="/reivilo-logo.jpg" 
                alt="Reivilo Logo" 
                className="h-16 w-auto opacity-80 object-contain"
                onError={(e) => {
                  const img = e.target as HTMLImageElement;
                  img.style.display = 'none';
                }}
              />
            </div>
            <h2 className="text-3xl font-bold text-foreground mb-4" data-testid="text-hero-title">
              Excellence in Service
            </h2>
            <p className="text-lg text-muted-foreground mb-8" data-testid="text-hero-description">
              Family business values with cutting-edge technology. Real-time inventory, customer-specific pricing, and seamless quote generation.
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center space-x-3 text-left">
              <div className="flex-shrink-0">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground" data-testid="text-feature-security">
                  Secure Authentication
                </p>
                <p className="text-xs text-muted-foreground">
                  Protected access with role-based permissions
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-3 text-left">
              <div className="flex-shrink-0">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground" data-testid="text-feature-customers">
                  Customer-Specific Pricing
                </p>
                <p className="text-xs text-muted-foreground">
                  Tiered pricing based on your business relationship
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-3 text-left">
              <div className="flex-shrink-0">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground" data-testid="text-feature-inventory">
                  Multi-Warehouse Inventory
                </p>
                <p className="text-xs text-muted-foreground">
                  Real-time stock levels across all locations
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
