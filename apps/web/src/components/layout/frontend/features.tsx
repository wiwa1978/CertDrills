import { useTranslations } from "next-intl";

import { Container } from "@/components/ui/container";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { features } from "@/config/frontend-features";

export function Features() {
  const t = useTranslations("features");

  return (
    <section id="features" className="py-16 md:py-24">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {t("title")}
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            {t("description")}
          </p>
        </div>

        <div className="mx-auto mt-12 grid max-w-6xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <Card
              key={feature.key}
              className="group relative overflow-hidden transition-all hover:shadow-lg"
            >
              <CardHeader>
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <feature.icon className="h-6 w-6" />
                </div>
                <CardTitle className="text-xl">{t(`items.${feature.key}.title`)}</CardTitle>
                <CardDescription className="text-base">
                  {t(`items.${feature.key}.description`)}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </Container>
    </section>
  );
}
