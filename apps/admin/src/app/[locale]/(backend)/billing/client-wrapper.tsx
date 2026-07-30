"use client";

import { ReactNode, createContext, useContext, useEffect } from "react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { toast } from "sonner";
import { createCheckoutSession } from "@/lib/api/me";

interface BillingClientWrapperProps {
  children: ReactNode;
}

interface BillingContextType {
  handlePurchase: (packageKey: string) => Promise<void>;
}

const BillingContext = createContext<BillingContextType | undefined>(undefined);

export function useBilling() {
  const context = useContext(BillingContext);
  if (!context) {
    throw new Error("useBilling must be used within BillingClientWrapper");
  }
  return context;
}

export function BillingClientWrapper({ children }: BillingClientWrapperProps) {
  const t = useTranslations("creditPricing");
  const { data: session } = authClient.useSession();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const checkoutSucceeded = searchParams.get("success") === "true";
    const checkoutCanceled = searchParams.get("cancel") === "true";

    if (!checkoutSucceeded && !checkoutCanceled) {
      return;
    }

    if (checkoutSucceeded) {
      toast.success("Payment received. Credits will appear once payment processing completes.");
    } else {
      toast.info("Checkout canceled. No credits were purchased.");
    }

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("success");
    nextParams.delete("cancel");
    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  const handlePurchase = async (packageKey: string) => {
    if (!session?.user) {
      toast.error("Please login to purchase credits");
      return;
    }

    try {
      const checkoutSession = await createCheckoutSession(packageKey);
      if (checkoutSession.data.checkoutUrl) {
        window.location.href = checkoutSession.data.checkoutUrl;
      } else {
        toast.error("No checkout URL returned");
        console.error("No checkout URL returned:", { checkoutSession });
      }
    } catch (error) {
      console.error("Purchase error:", error);
      toast.error("Purchase failed");
    }
  };

  return (
    <BillingContext.Provider value={{ handlePurchase }}>
      <div className="space-y-6">
        {children}
      </div>
    </BillingContext.Provider>
  );
}
