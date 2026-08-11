import { ArrowRight, Play } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Link } from "@/i18n/navigation";

export function Hero() {
  const t = useTranslations("hero");


  return (
    <section className="relative overflow-hidden pt-24 pb-16 md:pt-32 md:pb-24">
      {/* Background gradient */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2">
          <div className="h-[600px] w-[600px] rounded-full bg-gradient-to-br from-primary/20 via-primary/5 to-transparent blur-3xl" />
        </div>
        <div className="absolute right-0 top-1/2 -translate-y-1/2">
          <div className="h-[400px] w-[400px] rounded-full bg-gradient-to-bl from-primary/10 via-transparent to-transparent blur-3xl" />
        </div>
      </div>

      <Container>
        <div className="mx-auto max-w-4xl text-center">
          {/* Badge/Announcement */}
          <Link
            href="#"
            className="group mb-8 inline-flex items-center gap-2 rounded-full border border-border/50 bg-muted/50 px-4 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
          >
            <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
              {t("badge")}
            </span>
            <span className="text-muted-foreground">
              {t("badgeText")}
            </span>
            <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Link>

          {/* Headline */}
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
            {t("titleBuild")}{" "}
            <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              {t("titleFaster")}
            </span>
            {t("titleShip")}{" "}
            <span className="bg-gradient-to-r from-primary/60 to-primary bg-clip-text text-transparent">
              {t("titleSmarter")}
            </span>
          </h1>

          {/* Subheadline */}
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground md:text-xl">
            {t("description")}
          </p>

          {/* CTA Buttons */}
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button size="lg" className="gap-2" asChild>
              <Link href="/signup">
                {t("cta")}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="gap-2" asChild>
              <Link href="#demo">
                <Play className="h-4 w-4" />
                {t("watchDemo")}
              </Link>
            </Button>
          </div>

          {/* Social proof */}
          <p className="mt-12 text-sm text-muted-foreground">
            {t("socialProof", { count: "10,000" })}
          </p>
        </div>
      </Container>
    </section>
  );
}
