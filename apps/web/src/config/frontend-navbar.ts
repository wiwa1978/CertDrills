
// // Text content is loaded from messages/{locale}.json -> nav.{key}
// export const navLinks = [
//   { href: "/#features", key: "features" },
//   { href: "/#pricing", key: "pricing" },
//   { href: "/#about", key: "about" },
// ] as const;

// // Navigation links for the mobile menu (can be different if needed)
// export const mobileNavLinks = navLinks;


// export const authLinks = {
//   login: { href: "/login", key: "login" },
//   signup: { href: "/signup", key: "signUp" },
// } as const;


export interface FrontendNavItem {
  title: string
  url: string
}

export interface FrontendAuthItem {
  title: string
  url: string
}

// Navigation links for the main navbar
export const FrontendNavItems: FrontendNavItem[] = [
  {
    title: "features",
    url: "/#features",
  },
    
  {
    title: "pricing",
    url: "/#pricing",
  },
  {
    title: "about",
    url: "/#about",
  },
]

// Auth-related links
// the title attributes will be translated keys: item.title = nav.login
export const FrontendAuthItems: { [key: string]: FrontendAuthItem } = {
  login: { title: "login", url: "/login" },
  signup: { title: "signUp", url: "/signup" },
}


