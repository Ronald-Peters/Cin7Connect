import { Header } from "@/components/header";
import { ApprovedCatalog } from "@/components/approved-catalog";

export default function CatalogPage() {
  return (
    <div className="min-h-screen bg-[#f8fafc]" data-testid="catalog-page">
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <ApprovedCatalog />
      </main>
    </div>
  );
}