import { Header } from "@/components/header";
import { ProductTable } from "@/components/product-table";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background" data-testid="home-page">
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <ProductTable />
      </main>
    </div>
  );
}
