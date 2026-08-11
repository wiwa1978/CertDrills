"use client";

import { ReactNode, createContext, useContext, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { createCustomerPortalSession, createSubscriptionCheckoutSession, type CheckoutAddressInput } from "@/lib/api/me";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { subscriptionPlans, type SubscriptionPlan } from "@/config/billing";

interface SubscriptionBillingClientWrapperProps {
  children: ReactNode;
  addresses: BillingAddressOption[];
  checkoutOutcome: "success" | "cancel" | null;
}

type BillingAddressOption = CheckoutAddressInput & {
  id: string;
  label: string;
};

interface SubscriptionBillingContextType {
  handleSelectPlan: (planKey: string) => Promise<void>;
}

const SubscriptionBillingContext = createContext<SubscriptionBillingContextType | undefined>(undefined);

export function useSubscriptionBilling() {
  const context = useContext(SubscriptionBillingContext);
  if (!context) {
    throw new Error("useSubscriptionBilling must be used within SubscriptionBillingClientWrapper");
  }
  return context;
}

export function SubscriptionBillingClientWrapper({ children, addresses, checkoutOutcome }: SubscriptionBillingClientWrapperProps) {
  const t = useTranslations("billing.subscription.checkout");
  const subscriptionT = useTranslations("billing.subscription");
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
  const [discountCode, setDiscountCode] = useState("");
  const [selectedAddressId, setSelectedAddressId] = useState(addresses[0]?.id ?? "");
  const checkoutMutation = useMutation({
    mutationFn: createSubscriptionCheckoutSession,
  });
  const portalMutation = useMutation({
    mutationFn: createCustomerPortalSession,
  });

  const handleSelectPlan = async (planKey: string) => {
    const plan = subscriptionPlans.find((entry) => entry.key === planKey) ?? null;
    if (!plan) {
      toast.error(subscriptionT("planNotFound"));
      return;
    }

    setSelectedPlan(plan);
    setDiscountCode("");
    setSelectedAddressId(addresses[0]?.id ?? "");
  };

  const proceedToPayment = async () => {
    if (!selectedPlan) {
      return;
    }

    try {
      const selectedAddress = addresses.find((address) => address.id === selectedAddressId);
      const checkoutSession = await checkoutMutation.mutateAsync({
        planKey: selectedPlan.key,
        discountCode: discountCode.trim().toUpperCase() || undefined,
        address: selectedAddress ? toCheckoutAddress(selectedAddress) : undefined,
      });
      if (checkoutSession.data.checkoutUrl) {
        window.location.href = checkoutSession.data.checkoutUrl;
        return;
      }

      toast.error("No checkout URL returned");
    } catch (error) {
      console.error("Subscription checkout error:", error);
      toast.error("Subscription checkout failed");
    }
  };

  const handleManageBilling = async () => {
    try {
      const portalSession = await portalMutation.mutateAsync();
      if (portalSession.data.portalUrl) {
        window.location.href = portalSession.data.portalUrl;
        return;
      }

      toast.error(t("portal.noUrl"));
    } catch (error) {
      console.error("Customer portal error:", error);
      toast.error(t("portal.failed"));
    }
  };

  return (
    <SubscriptionBillingContext.Provider value={{ handleSelectPlan }}>
      <div className="space-y-6">
        {checkoutOutcome === "success" ? (
          <div className="rounded-lg border bg-card p-4 text-card-foreground shadow-sm">
            {t("successDescription")}
          </div>
        ) : null}
        {checkoutOutcome === "cancel" ? (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive shadow-sm">
            {t("cancelDescription")}
          </div>
        ) : null}
        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={handleManageBilling} disabled={portalMutation.isPending}>
            {portalMutation.isPending ? t("portal.loading") : t("portal.button")}
          </Button>
        </div>
        {children}
      </div>
      <SubscriptionCheckoutDialog
        addresses={addresses}
        discountCode={discountCode}
        isCreatingCheckout={checkoutMutation.isPending}
        onDiscountCodeChange={(value) => setDiscountCode(value.toUpperCase())}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedPlan(null);
          }
        }}
        onProceed={() => void proceedToPayment()}
        onSelectedAddressChange={setSelectedAddressId}
        plan={selectedPlan}
        selectedAddressId={selectedAddressId}
      />
    </SubscriptionBillingContext.Provider>
  );
}

type SubscriptionCheckoutDialogProps = {
  addresses: BillingAddressOption[];
  discountCode: string;
  isCreatingCheckout: boolean;
  onDiscountCodeChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onProceed: () => void;
  onSelectedAddressChange: (addressId: string) => void;
  plan: SubscriptionPlan | null;
  selectedAddressId: string;
};

function SubscriptionCheckoutDialog({
  addresses,
  discountCode,
  isCreatingCheckout,
  onDiscountCodeChange,
  onOpenChange,
  onProceed,
  onSelectedAddressChange,
  plan,
  selectedAddressId,
}: SubscriptionCheckoutDialogProps) {
  const t = useTranslations("billing.subscription.checkout");
  const isOpen = Boolean(plan);
  const price = plan ? plan.price / 100 : 0;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto p-0 sm:max-w-2xl">
        {plan ? (
          <div className="grid gap-0 sm:grid-cols-[1fr_1.2fr]">
            <div className="bg-muted/60 p-6">
              <DialogHeader>
                <DialogTitle>{t("title", { plan: plan.key })}</DialogTitle>
                <DialogDescription>{t("description")}</DialogDescription>
              </DialogHeader>
              <div className="mt-6 rounded-xl border bg-background p-4 shadow-sm">
                <p className="text-sm font-medium capitalize">{plan.key}</p>
                <p className="mt-2 text-3xl font-bold">
                  €{price}
                  <span className="text-sm font-normal text-muted-foreground">/{plan.interval}</span>
                </p>
                <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                  {plan.features.map((feature) => <li key={feature}>{feature}</li>)}
                </ul>
              </div>
            </div>
            <div className="space-y-5 p-6">
              <div className="rounded-xl border p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{t("subtotal")}</span>
                  <span className="font-medium">€{price}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="subscription-checkout-discount">{t("discountLabel")}</Label>
                <Input
                  id="subscription-checkout-discount"
                  value={discountCode}
                  onChange={(event) => onDiscountCodeChange(event.target.value)}
                  placeholder={t("discountPlaceholder")}
                />
                <p className="text-xs text-muted-foreground">{t("discountDescription")}</p>
              </div>

              <div className="space-y-2 rounded-xl border p-4">
                <Label>{t("billingAddress")}</Label>
                <Select value={selectedAddressId} onValueChange={onSelectedAddressChange} disabled={isCreatingCheckout || addresses.length === 0}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t("addressPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {addresses.map((address) => (
                      <SelectItem key={address.id} value={address.id}>
                        {address.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {addresses.length === 0 ? <p className="text-sm text-muted-foreground">{t("addAddressInSettings")}</p> : null}
              </div>

              <DialogFooter>
                <Button className="w-full" onClick={onProceed} disabled={isCreatingCheckout || !selectedAddressId}>
                  {isCreatingCheckout ? t("redirecting") : t("proceed")}
                </Button>
              </DialogFooter>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function toCheckoutAddress(address: BillingAddressOption): CheckoutAddressInput {
  return {
    street: address.street,
    number: address.number,
    zipcode: address.zipcode,
    town: address.town,
    countryId: address.countryId,
  };
}
