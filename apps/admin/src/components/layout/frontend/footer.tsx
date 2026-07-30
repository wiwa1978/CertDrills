import { useTranslations } from "next-intl";

import { Container } from "@/components/ui/container";
import { LogoWithText } from "@/components/icons/logo";
import { Link } from "@/i18n/navigation";
import { footerLinks, socialLinks } from "@/config/frontend-footer";

export function Footer() {
  const t = useTranslations("footer");

  return (
    <footer className="border-t bg-muted/30">
      <Container>
        <div className="py-12 md:py-16">
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-6">
            {/* Brand column */}
            <div className="lg:col-span-2">
              <LogoWithText />
              <p className="mt-4 max-w-xs text-sm text-muted-foreground">
                {t("description")}
              </p>
              <div className="mt-6 flex gap-4">
                {socialLinks.map((social) => (
                  <Link
                    key={social.key}
                    href={social.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <social.icon className="h-5 w-5" />
                    <span className="sr-only">{t(`social.${social.key}`)}</span>
                  </Link>
                ))}
              </div>
            </div>

            {/* Link columns */}
            {footerLinks.map((group) => (
              <div key={group.key}>
                <h3 className="text-sm font-semibold">{t(`groups.${group.key}.title`)}</h3>
                <ul className="mt-4 space-y-3">
                  {group.links.map((link) => (
                    <li key={link.key}>
                      <Link
                        href={link.href}
                        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {t(`groups.${group.key}.${link.key}`)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t py-6">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} {t("copyright")}
            </p>
            <p className="text-sm text-muted-foreground">
              {t("madeWith")}
            </p>
          </div>
        </div>
      </Container>
    </footer>
  );
}
