import { Header } from "@/components/header";
import { LandingPage } from "@/components/landing-page";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background" data-testid="home-page">
      <Header />
      <LandingPage />
    </div>
  );
}
