import { Nav } from "@/components/klaro/Nav";
import { Hero } from "@/components/klaro/Hero";
import { TrustStrip } from "@/components/klaro/sections/TrustStrip";
import { HowItWorks } from "@/components/klaro/sections/HowItWorks";
import { PlatformOS } from "@/components/klaro/sections/PlatformOS";
import { TruthTable } from "@/components/klaro/sections/TruthTable";
import { StennProof } from "@/components/klaro/sections/StennProof";
import { PartnerCashout } from "@/components/klaro/sections/PartnerCashout";
import { Corridors } from "@/components/klaro/sections/Corridors";
import { ThreeAudiences } from "@/components/klaro/sections/ThreeAudiences";
import { ErpIntegrations } from "@/components/klaro/sections/ErpIntegrations";
import { Developers } from "@/components/klaro/sections/Developers";
import { Security } from "@/components/klaro/sections/Security";
import { MetricsBand } from "@/components/klaro/sections/MetricsBand";
import { Pricing } from "@/components/klaro/sections/Pricing";
import { FinalCta } from "@/components/klaro/sections/FinalCta";
import { Footer } from "@/components/klaro/Footer";

/**
 * Klaro landing — `www.myklaro.app`
 * Section order matches `designer/landing/index.html` 1:1:
 * 1 Nav (component)
 * 2 Hero
 * 3 Trust strip
 * 4 How it works
 * 5 Platform OS
 * 6 Truth table
 * 7 Klaro Proof
 * 8 Partner Cashout
 * 9 Corridors
 * 10 Three audiences
 * 11 ERP integrations
 * 12 Developers
 * 13 Security
 * 14 Metrics band
 * 15 Pricing
 * 16 Final CTA
 * 17 Footer
 * Source of truth: Klaro_Final_Testnet_Complete_Full_Flow_Design_v2.md
 * Build plan map: docs/LANDING_GAP_REPORT.md
 */
export default function HomePage() {
  return (
    <main>
      <Nav />
      <Hero />
      <TrustStrip />
      <HowItWorks />
      <PlatformOS />
      <TruthTable />
      <StennProof />
      <PartnerCashout />
      <Corridors />
      <ThreeAudiences />
      <ErpIntegrations />
      <Developers />
      <Security />
      <MetricsBand />
      <Pricing />
      <FinalCta />
      <Footer />
    </main>
  );
}
