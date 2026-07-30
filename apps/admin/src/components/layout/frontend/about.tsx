import { useTranslations } from "next-intl";

import { Container } from "@/components/ui/container";

export function About() {
  const t = useTranslations("about");

  return (
    <section id="about" className="py-16 md:py-24 bg-muted/30">
      <Container>
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {t("title")}
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            {t("subtitle")}
          </p>
        </div>

        <div className="mx-auto mt-12 grid max-w-5xl gap-8 md:grid-cols-2 lg:gap-12">
          {/* Mission */}
          <div className="space-y-4">
            <h3 className="text-xl font-semibold">{t("mission.title")}</h3>
            <p className="text-muted-foreground leading-relaxed">
              {t("mission.paragraph1")}
            </p>
            <p className="text-muted-foreground leading-relaxed">
              {t("mission.paragraph2")}
            </p>
          </div>

          {/* Values */}
          <div className="space-y-4">
            <h3 className="text-xl font-semibold">{t("values.title")}</h3>
            <ul className="space-y-3">
              <li className="flex gap-3">
                <span className="text-primary font-bold">01</span>
                <div>
                  <span className="font-medium">{t("values.simplicityFirst.title")}</span>
                  <p className="text-sm text-muted-foreground">
                    {t("values.simplicityFirst.description")}
                  </p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="text-primary font-bold">02</span>
                <div>
                  <span className="font-medium">{t("values.developerExperience.title")}</span>
                  <p className="text-sm text-muted-foreground">
                    {t("values.developerExperience.description")}
                  </p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="text-primary font-bold">03</span>
                <div>
                  <span className="font-medium">{t("values.customerSuccess.title")}</span>
                  <p className="text-sm text-muted-foreground">
                    {t("values.customerSuccess.description")}
                  </p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="text-primary font-bold">04</span>
                <div>
                  <span className="font-medium">{t("values.continuousImprovement.title")}</span>
                  <p className="text-sm text-muted-foreground">
                    {t("values.continuousImprovement.description")}
                  </p>
                </div>
              </li>
            </ul>
          </div>
        </div>

        {/* Stats */}
        <div className="mx-auto mt-16 grid max-w-4xl grid-cols-2 gap-8 md:grid-cols-4">
          <div className="text-center">
            <div className="text-3xl font-bold text-primary">10K+</div>
            <div className="mt-1 text-sm text-muted-foreground">
              {t("stats.activeUsers")}
            </div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-primary">500+</div>
            <div className="mt-1 text-sm text-muted-foreground">
              {t("stats.companies")}
            </div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-primary">99.9%</div>
            <div className="mt-1 text-sm text-muted-foreground">
              {t("stats.uptimeSla")}
            </div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-primary">24/7</div>
            <div className="mt-1 text-sm text-muted-foreground">
              {t("stats.support")}
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
