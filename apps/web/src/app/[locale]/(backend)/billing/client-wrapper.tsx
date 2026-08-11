"use client";

import { ReactNode, createContext, useContext, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";
import { toast } from "sonner";
import { createCheckoutSession, createCustomerPortalSession, type CheckoutAddressInput } from "@/lib/api/me";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { creditPackages, type CreditPackage } from "@/config/billing";

type CheckoutOutcome = "success" | "cancel" | null;

interface BillingClientWrapperProps {
  children: ReactNode;
  addresses: BillingAddressOption[];
  checkoutOutcome: CheckoutOutcome;
}

type BillingAddressOption = CheckoutAddressInput & {
  id: string;
  label: string;
};

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

export function BillingClientWrapper({ children, addresses, checkoutOutcome }: BillingClientWrapperProps) {
  const billingT = useTranslations("billing");
  const checkoutT = useTranslations("billing.credits.checkout");
  const { data: session } = authClient.useSession();
  const [selectedPackage, setSelectedPackage] = useState<CreditPackage | null>(null);
  const [selectedAddressId, setSelectedAddressId] = useState(addresses[0]?.id ?? "");
  const [voucherCode, setVoucherCode] = useState("");

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

    const packageConfig = creditPackages.find((pkg) => pkg.key === packageKey) ?? null;
    if (!packageConfig) {
      toast.error(checkoutT("packageNotFound"));
      return;
    }

    setSelectedPackage(packageConfig);
    setSelectedAddressId(addresses[0]?.id ?? "");
    setVoucherCode("");
  };

  const proceedToPayment = async () => {
    if (!selectedPackage) {
      return;
    }

    try {
      const selectedAddress = addresses.find((address) => address.id === selectedAddressId);
      const checkoutSession = await checkoutMutation.mutateAsync({
        packageKey: selectedPackage.key,
        discountCode: voucherCode.trim().toUpperCase() || undefined,
        address: selectedAddress ? toCheckoutAddress(selectedAddress) : undefined,
      });
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
      <CreditCheckoutDialog
        addresses={addresses}
        isCreatingCheckout={checkoutMutation.isPending}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedPackage(null);
          }
        }}
        onProceed={() => void proceedToPayment()}
        onSelectedAddressChange={setSelectedAddressId}
        onVoucherCodeChange={(value) => setVoucherCode(value.toUpperCase())}
        packageConfig={selectedPackage}
        selectedAddressId={selectedAddressId}
        voucherCode={voucherCode}
      />
    </BillingContext.Provider>
  );
}

type CreditCheckoutDialogProps = {
  addresses: BillingAddressOption[];
  isCreatingCheckout: boolean;
  onOpenChange: (open: boolean) => void;
  onProceed: () => void;
  onSelectedAddressChange: (addressId: string) => void;
  onVoucherCodeChange: (value: string) => void;
  packageConfig: CreditPackage | null;
  selectedAddressId: string;
  voucherCode: string;
};

function CreditCheckoutDialog({
  addresses,
  isCreatingCheckout,
  onOpenChange,
  onProceed,
  onSelectedAddressChange,
  onVoucherCodeChange,
  packageConfig,
  selectedAddressId,
  voucherCode,
}: CreditCheckoutDialogProps) {
  const t = useTranslations("billing.credits.checkout");
  const isOpen = Boolean(packageConfig);
  const baseCredits = packageConfig?.credits ?? 0;
  const bonusCredits = packageConfig && "bonus" in packageConfig ? packageConfig.bonus : 0;
  const totalCredits = baseCredits + bonusCredits;
  const price = packageConfig ? packageConfig.price / 100 : 0;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto p-0 sm:max-w-2xl">
        {packageConfig ? (
          <div className="grid gap-0 sm:grid-cols-[1fr_1.2fr]">
            <div className="bg-muted/60 p-6">
              <DialogHeader>
                <DialogTitle>{t("title", { package: packageConfig.key })}</DialogTitle>
                <DialogDescription>{t("description")}</DialogDescription>
              </DialogHeader>
              <div className="mt-6 rounded-xl border bg-background p-4 shadow-sm">
                <p className="text-sm font-medium capitalize">{packageConfig.key}</p>
                <p className="mt-2 text-3xl font-bold">€{price}</p>
                <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                  <li>{t("baseCredits", { count: baseCredits })}</li>
                  {bonusCredits > 0 ? <li>{t("bonusCredits", { count: bonusCredits })}</li> : null}
                  <li>{t("totalCredits", { count: totalCredits })}</li>
                  <li>{t("creditsNeverExpire")}</li>
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
                <Label htmlFor="credit-checkout-voucher">{t("voucherLabel")}</Label>
                <Input
                  id="credit-checkout-voucher"
                  value={voucherCode}
                  onChange={(event) => onVoucherCodeChange(event.target.value)}
                  placeholder={t("voucherPlaceholder")}
                />
                <p className="text-xs text-muted-foreground">{t("voucherDescription")}</p>
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
                {addresses.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("addAddressInSettings")}</p>
                ) : null}
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
