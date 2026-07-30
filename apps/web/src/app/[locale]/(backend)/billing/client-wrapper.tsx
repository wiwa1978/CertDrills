"use client";

import { ReactNode, createContext, useContext } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";
import { toast } from "sonner";
import { createCheckoutSession, createCustomerPortalSession } from "@/lib/api/me";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type CheckoutOutcome = "success" | "cancel" | null;

interface BillingClientWrapperProps {
  children: ReactNode;
  checkoutOutcome: CheckoutOutcome;
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

export function BillingClientWrapper({ children, checkoutOutcome }: BillingClientWrapperProps) {
  const billingT = useTranslations("billing");
  const { data: session } = authClient.useSession();

  const checkoutMutation = useMutation({
    mutationFn: createCheckoutSession,
  });
  const portalMutation = useMutation({
    mutationFn: createCustomerPortalSession,
  });

  const handlePurchase = async (packageKey: string) => {
    if (!session?.user) {
      toast.error("Please login to purchase credits");
      return;
    }

    try {
      const checkoutSession = await checkoutMutation.mutateAsync(packageKey);
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

  const handleManageBilling = async () => {
    if (!session?.user) {
      toast.error(billingT("portal.loginRequired"));
      return;
    }

    try {
      const portalSession = await portalMutation.mutateAsync();
      if (portalSession.data.portalUrl) {
        window.location.href = portalSession.data.portalUrl;
        return;
      }

      toast.error(billingT("portal.noUrl"));
    } catch (error) {
      console.error("Customer portal error:", error);
      toast.error(billingT("portal.failed"));
    }
  };

  return (
    <BillingContext.Provider value={{ handlePurchase }}>
      <div className="space-y-6">
        {checkoutOutcome === "success" ? (
          <Alert>
            <AlertTitle>{billingT("checkout.successTitle")}</AlertTitle>
            <AlertDescription>{billingT("checkout.successDescription")}</AlertDescription>
          </Alert>
        ) : null}
        {checkoutOutcome === "cancel" ? (
          <Alert variant="destructive">
            <AlertTitle>{billingT("checkout.cancelTitle")}</AlertTitle>
            <AlertDescription>{billingT("checkout.cancelDescription")}</AlertDescription>
          </Alert>
        ) : null}
        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={handleManageBilling} disabled={portalMutation.isPending}>
            {portalMutation.isPending ? billingT("portal.loading") : billingT("portal.button")}
          </Button>
        </div>
        {children}
      </div>
    </BillingContext.Provider>
  );
}
