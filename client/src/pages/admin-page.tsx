import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Building2, Users, UserPlus, RefreshCw, Shield, UserCheck, Trash2 } from "lucide-react";

interface Customer {
  id: number;
  erpCustomerId: string;
  companyName: string;
  terms: string;
  priceTier: string;
  isActive: boolean;
  allowPortalAccess: boolean;
  syncedAt: string;
}

export default function AdminPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [newClientForm, setNewClientForm] = useState({
    email: "",
    password: "",
    customerId: "",
  });
  const [newAdminForm, setNewAdminForm] = useState({
    email: "",
    password: "",
  });

  // Redirect if not admin
  useEffect(() => {
    if (user && user.role !== 'admin') {
      setLocation("/");
    }
  }, [user, setLocation]);

  if (!user || user.role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-96">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Admin Access Required
            </CardTitle>
            <CardDescription>
              Please log in with admin credentials to access this page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setLocation("/login")} className="w-full">
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/customers");
      if (response.ok) {
        const data = await response.json();
        setCustomers(data);
      } else {
        toast({
          title: "Error",
          description: "Failed to fetch customers",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to fetch customers",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const syncCustomers = async () => {
    setSyncLoading(true);
    try {
      const response = await fetch("/api/admin/sync-customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      
      if (response.ok) {
        const data = await response.json();
        toast({
          title: "Sync Complete",
          description: `Synced ${data.syncedCount} customers from Cin7`,
        });
        fetchCustomers();
      } else {
        toast({
          title: "Sync Failed", 
          description: "Failed to sync customers from Cin7",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to sync customers",
        variant: "destructive",
      });
    } finally {
      setSyncLoading(false);
    }
  };

  const toggleCustomerAccess = async (customerId: number, allowAccess: boolean) => {
    try {
      const response = await fetch(`/api/admin/customers/${customerId}/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowPortalAccess: allowAccess }),
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: `Customer access ${allowAccess ? 'enabled' : 'disabled'}`,
        });
        fetchCustomers();
      } else {
        toast({
          title: "Error",
          description: "Failed to update customer",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error", 
        description: "Failed to update customer",
        variant: "destructive",
      });
    }
  };

  const createClientUser = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newClientForm.email || !newClientForm.password || !newClientForm.customerId) {
      toast({
        title: "Error",
        description: "All fields are required",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await fetch("/api/admin/create-client", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newClientForm),
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: "Client user created successfully",
        });
        setNewClientForm({ email: "", password: "", customerId: "" });
      } else {
        const error = await response.json();
        toast({
          title: "Error",
          description: error.message || "Failed to create client user",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create client user",
        variant: "destructive",
      });
    }
  };

  const fetchAdminUsers = async () => {
    setAdminLoading(true);
    try {
      const response = await fetch("/api/admin/users");
      if (response.ok) {
        const data = await response.json();
        setAdminUsers(data);
      } else {
        toast({
          title: "Error",
          description: "Failed to fetch admin users",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to fetch admin users",
        variant: "destructive",
      });
    } finally {
      setAdminLoading(false);
    }
  };

  const createAdminUser = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newAdminForm.email || !newAdminForm.password) {
      toast({
        title: "Error",
        description: "Email and password are required",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await fetch("/api/admin/create-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newAdminForm),
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: "Admin user created successfully",
        });
        setNewAdminForm({ email: "", password: "" });
        fetchAdminUsers();
      } else {
        const error = await response.json();
        toast({
          title: "Error",
          description: error.message || "Failed to create admin user",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create admin user",
        variant: "destructive",
      });
    }
  };

  const deleteAdminUser = async (userId: string, email: string) => {
    if (!confirm(`Are you sure you want to delete admin user: ${email}?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: "Admin user deleted successfully",
        });
        fetchAdminUsers();
      } else {
        const error = await response.json();
        toast({
          title: "Error",
          description: error.message || "Failed to delete admin user",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete admin user",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    fetchCustomers();
    fetchAdminUsers();
  }, []);

  return (
    <div className="min-h-screen bg-background" data-testid="admin-page">
      <div className="container mx-auto p-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-primary mb-2" data-testid="text-admin-title">
            Reivilo Admin Portal
          </h1>
          <p className="text-muted-foreground" data-testid="text-admin-subtitle">
            Manage client access and customer accounts
          </p>
          <div className="mt-4 flex items-center gap-4">
            <Badge variant="secondary">
              Welcome, {user.email}
            </Badge>
            <Badge variant="outline">
              Admin Role
            </Badge>
          </div>
        </div>

        <Tabs defaultValue="customers" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="customers" data-testid="tab-customers">
              <Building2 className="w-4 h-4 mr-2" />
              Customer Management
            </TabsTrigger>
            <TabsTrigger value="users" data-testid="tab-users">
              <Users className="w-4 h-4 mr-2" />
              Create Client Users
            </TabsTrigger>
            <TabsTrigger value="admins" data-testid="tab-admins">
              <Shield className="w-4 h-4 mr-2" />
              Admin Users
            </TabsTrigger>
          </TabsList>

          <TabsContent value="customers">
            <Card>
              <CardHeader>
                <CardTitle data-testid="text-customers-title">Customer Management</CardTitle>
                <CardDescription data-testid="text-customers-description">
                  Sync customers from Cin7 and manage portal access
                </CardDescription>
                <div className="flex gap-2">
                  <Button
                    onClick={syncCustomers}
                    disabled={syncLoading}
                    data-testid="button-sync-customers"
                  >
                    <RefreshCw className={`w-4 h-4 mr-2 ${syncLoading ? 'animate-spin' : ''}`} />
                    {syncLoading ? 'Syncing...' : 'Sync from Cin7'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={fetchCustomers}
                    disabled={loading}
                    data-testid="button-refresh-customers"
                  >
                    Refresh
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-center py-4" data-testid="text-loading">
                    Loading customers...
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Company Name</TableHead>
                        <TableHead>Cin7 ID</TableHead>
                        <TableHead>Price Tier</TableHead>
                        <TableHead>Terms</TableHead>
                        <TableHead>Portal Access</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {customers.map((customer) => (
                        <TableRow key={customer.id} data-testid={`row-customer-${customer.id}`}>
                          <TableCell className="font-medium" data-testid={`text-company-${customer.id}`}>
                            {customer.companyName || 'N/A'}
                          </TableCell>
                          <TableCell data-testid={`text-erp-id-${customer.id}`}>
                            {customer.erpCustomerId}
                          </TableCell>
                          <TableCell data-testid={`text-price-tier-${customer.id}`}>
                            {customer.priceTier || 'N/A'}
                          </TableCell>
                          <TableCell data-testid={`text-terms-${customer.id}`}>
                            {customer.terms || 'N/A'}
                          </TableCell>
                          <TableCell data-testid={`text-access-${customer.id}`}>
                            <Badge variant={customer.allowPortalAccess ? "default" : "secondary"}>
                              {customer.allowPortalAccess ? "Enabled" : "Disabled"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Switch
                              checked={customer.allowPortalAccess}
                              onCheckedChange={(checked) => toggleCustomerAccess(customer.id, checked)}
                              data-testid={`switch-access-${customer.id}`}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="users">
            <Card>
              <CardHeader>
                <CardTitle data-testid="text-create-user-title">Create Client User</CardTitle>
                <CardDescription data-testid="text-create-user-description">
                  Create login credentials for a specific customer
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={createClientUser} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      value={newClientForm.email}
                      onChange={(e) => setNewClientForm({ ...newClientForm, email: e.target.value })}
                      placeholder="client@company.com"
                      data-testid="input-client-email"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      value={newClientForm.password}
                      onChange={(e) => setNewClientForm({ ...newClientForm, password: e.target.value })}
                      placeholder="Secure password"
                      data-testid="input-client-password"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="customerId">Customer ID</Label>
                    <Input
                      id="customerId"
                      type="number"
                      value={newClientForm.customerId}
                      onChange={(e) => setNewClientForm({ ...newClientForm, customerId: e.target.value })}
                      placeholder="Select from customer list above"
                      data-testid="input-customer-id"
                    />
                  </div>
                  
                  <Button type="submit" className="w-full" data-testid="button-create-client">
                    <UserPlus className="w-4 h-4 mr-2" />
                    Create Client User
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="admins">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle data-testid="text-admin-users-title">
                    <UserCheck className="w-5 h-5 mr-2 inline" />
                    Admin User Management
                  </CardTitle>
                  <CardDescription data-testid="text-admin-users-description">
                    Create and manage additional admin users who can access the admin portal
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={createAdminUser} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="admin-email">Email Address</Label>
                        <Input
                          id="admin-email"
                          type="email"
                          value={newAdminForm.email}
                          onChange={(e) => setNewAdminForm({ ...newAdminForm, email: e.target.value })}
                          placeholder="admin@reiviloindustrial.co.za"
                          data-testid="input-admin-email"
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="admin-password">Password</Label>
                        <Input
                          id="admin-password"
                          type="password"
                          value={newAdminForm.password}
                          onChange={(e) => setNewAdminForm({ ...newAdminForm, password: e.target.value })}
                          placeholder="Secure admin password"
                          data-testid="input-admin-password"
                        />
                      </div>
                    </div>
                    
                    <Button type="submit" className="w-full" data-testid="button-create-admin">
                      <UserPlus className="w-4 h-4 mr-2" />
                      Create Admin User
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle data-testid="text-existing-admins-title">Existing Admin Users</CardTitle>
                  <CardDescription data-testid="text-existing-admins-description">
                    Manage current admin users with access to the portal
                  </CardDescription>
                  <Button
                    variant="outline"
                    onClick={fetchAdminUsers}
                    disabled={adminLoading}
                    data-testid="button-refresh-admins"
                  >
                    <RefreshCw className={`w-4 h-4 mr-2 ${adminLoading ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                </CardHeader>
                <CardContent>
                  {adminLoading ? (
                    <div className="text-center py-4" data-testid="text-admin-loading">
                      Loading admin users...
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Email Address</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Created</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {adminUsers.map((admin) => (
                          <TableRow key={admin.id} data-testid={`row-admin-${admin.id}`}>
                            <TableCell className="font-medium" data-testid={`text-admin-email-${admin.id}`}>
                              {admin.email}
                              {admin.email === user?.email && (
                                <Badge variant="secondary" className="ml-2">You</Badge>
                              )}
                            </TableCell>
                            <TableCell data-testid={`text-admin-role-${admin.id}`}>
                              <Badge variant="default">
                                <Shield className="w-3 h-3 mr-1" />
                                Admin
                              </Badge>
                            </TableCell>
                            <TableCell data-testid={`text-admin-created-${admin.id}`}>
                              {admin.createdAt ? new Date(admin.createdAt).toLocaleDateString() : 'N/A'}
                            </TableCell>
                            <TableCell>
                              {admin.email !== user?.email && (
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => deleteAdminUser(admin.id, admin.email)}
                                  data-testid={`button-delete-admin-${admin.id}`}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}