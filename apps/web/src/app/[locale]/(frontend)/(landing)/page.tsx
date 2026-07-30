import { Hero } from "@/components/layout/frontend/hero";
import { Features } from "@/components/layout/frontend/features";
import { Pricing } from "@/components/layout/frontend/pricing";
import { About } from "@/components/layout/frontend/about";
import { CTA } from "@/components/layout/frontend/cta";

export default function Home() {
  return (
    <>
      <Hero />
      <Features />
      {/* <Pricing /> */}
      <About />
      <CTA />
    </>
  );
}
