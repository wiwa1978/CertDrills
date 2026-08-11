import { Github, Twitter, Linkedin, type LucideIcon } from "lucide-react";

export interface FooterLink {
  key: string; // Translation key
  href: string;
}

export interface FooterLinkGroup {
  key: string; // Translation key for group (product, company, resources, legal)
  links: FooterLink[];
}

export interface SocialLink {
  key: string; // Translation key
  href: string;
  icon: LucideIcon;
}

// Footer link structure with translation keys
// Text content is loaded from messages/{locale}.json -> footer.groups.{key}
export const footerLinks: FooterLinkGroup[] = [
  {
    key: "product",
    links: [
      { key: "features", href: "#features" },
      { key: "pricing", href: "#pricing" },
      { key: "integrations", href: "#integrations" },
      { key: "changelog", href: "#changelog" },
    ],
  },
  {
    key: "company",
    links: [
      { key: "about", href: "#about" },
      { key: "blog", href: "#blog" },
      { key: "careers", href: "#careers" },
      { key: "contact", href: "#contact" },
    ],
  },
  {
    key: "resources",
    links: [
      { key: "documentation", href: "#docs" },
      { key: "helpCenter", href: "#help" },
      { key: "community", href: "#community" },
      { key: "templates", href: "#templates" },
    ],
  },
  {
    key: "legal",
    links: [
      { key: "privacy", href: "#privacy" },
      { key: "terms", href: "#terms" },
      { key: "cookiePolicy", href: "#cookies" },
    ],
  },
];

// Social links with translation keys
export const socialLinks: SocialLink[] = [
  { key: "github", href: "https://github.com", icon: Github },
  { key: "twitter", href: "https://twitter.com", icon: Twitter },
  { key: "linkedin", href: "https://linkedin.com", icon: Linkedin },
];

