"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { Camera, Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useSession, updateUser } from "@/lib/auth-client";
import { useLocale } from "next-intl";
import { profileSchema, type ProfileFormValues, type Country } from "@/schemas";
import { useRouter } from "@/i18n/navigation";
import { getCountries } from "@/lib/api/me";
import { webQueryKeys } from "@/lib/query/keys";

// Helper function to get flag emoji from country code
function getFlagEmoji(countryCode: string): string {
  const codePoints = countryCode
    .toUpperCase()
    .split("")
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

export function ProfileCard() {
  const t = useTranslations("settings.profile");
  const locale = useLocale();
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [countryOpen, setCountryOpen] = React.useState(false);

  const countriesQuery = useQuery({
    queryKey: webQueryKeys.countries(locale),
    queryFn: () => getCountries(locale as "en" | "fr" | "nl") as Promise<Country[]>,
  });

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: "",
      image: "",
      phone: "",
      street: "",
      number: "",
      zipcode: "",
      town: "",
      countryId: "",
    },
  });

  // Update form values when session loads
  React.useEffect(() => {
    if (session?.user) {
      form.reset({
        name: session.user.name || "",
        image: session.user.image || "",
        phone: session.user.phone || "",
        street: session.user.street || "",
        number: session.user.number || "",
        zipcode: session.user.zipcode || "",
        town: session.user.town || "",
        countryId: session.user.countryId || "",
      });
    }
  }, [session, form]);

  const { isSubmitting } = form.formState;

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error(t("invalidFileType"));
      return;
    }

    // Validate file size (max 500KB before compression)
    if (file.size > 500 * 1024) {
      toast.error(t("fileTooLarge"));
      return;
    }

    // Compress and resize the image
    const img = new Image();
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    img.onload = () => {
      // Max dimensions for avatar
      const maxSize = 256;
      let { width, height } = img;

      // Calculate new dimensions maintaining aspect ratio
      if (width > height) {
        if (width > maxSize) {
          height = (height * maxSize) / width;
          width = maxSize;
        }
      } else {
        if (height > maxSize) {
          width = (width * maxSize) / height;
          height = maxSize;
        }
      }

      canvas.width = width;
      canvas.height = height;
      ctx?.drawImage(img, 0, 0, width, height);

      // Convert to compressed JPEG
      const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.8);
      form.setValue("image", compressedDataUrl, { shouldDirty: true });
    };

    img.src = URL.createObjectURL(file);
  };

  async function onSubmit(values: ProfileFormValues) {
    const { error } = await updateUser({
      name: values.name,
      image: values.image || undefined,
      phone: values.phone || undefined,
      street: values.street || undefined,
      number: values.number || undefined,
      zipcode: values.zipcode || undefined,
      town: values.town || undefined,
      countryId: values.countryId || undefined,
    });

    if (error) {
      form.setError("root", {
        message: error.message || t("error"),
      });
    } else {
      toast.success(t("success"));

      // Refresh to update notifications immediately
      router.refresh();
    }
  }

  if (isPending) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const initials = session?.user?.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const countries = countriesQuery.data ?? [];
  const countriesLoading = countriesQuery.isLoading;

  const selectedCountry = countries.find(
    (c) => c.id === form.watch("countryId")
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-6">
            {form.formState.errors.root && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {form.formState.errors.root.message}
              </div>
            )}

            {/* Two column layout on large screens */}
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Personal Information Section */}
              <div className="rounded-lg border bg-card p-6 space-y-6">
                <h3 className="text-sm font-semibold">{t("personalInfo")}</h3>

                {/* Avatar Upload */}
                <div className="space-y-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={handleAvatarClick}
                    className="group relative cursor-pointer"
                  >
                    <Avatar className="h-20 w-20">
                      <AvatarImage
                        src={
                          form.watch("image") ||
                          session?.user?.image ||
                          undefined
                        }
                        alt={form.watch("name") || session?.user?.name || "User"}
                      />
                      <AvatarFallback className="text-xl">
                        {initials || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                      <Camera className="h-6 w-6 text-white" />
                    </div>
                  </button>
                  <p className="text-xs text-muted-foreground">
                    {t("avatarHint")}
                  </p>
                </div>

                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("name")}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={t("namePlaceholder")}
                          disabled={isSubmitting}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Email (read-only) */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t("email")}</label>
                  <Input
                    value={session?.user?.email || ""}
                    disabled
                    className="bg-muted"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("emailHint")}
                  </p>
                </div>
              </div>

              {/* Address Section */}
              <div className="rounded-lg border bg-card p-6 space-y-6">
                <h3 className="text-sm font-semibold">{t("addressInfo")}</h3>

                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("phone")}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={t("phonePlaceholder")}
                          disabled={isSubmitting}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid gap-4 sm:grid-cols-3">
                  <FormField
                    control={form.control}
                    name="street"
                    render={({ field }) => (
                      <FormItem className="sm:col-span-2">
                        <FormLabel>{t("street")}</FormLabel>
                        <FormControl>
                          <Input
                            placeholder={t("streetPlaceholder")}
                            disabled={isSubmitting}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="number"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("number")}</FormLabel>
                        <FormControl>
                          <Input
                            placeholder={t("numberPlaceholder")}
                            disabled={isSubmitting}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="zipcode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("zipcode")}</FormLabel>
                        <FormControl>
                          <Input
                            placeholder={t("zipcodePlaceholder")}
                            disabled={isSubmitting}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="town"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("town")}</FormLabel>
                        <FormControl>
                          <Input
                            placeholder={t("townPlaceholder")}
                            disabled={isSubmitting}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="countryId"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>{t("country")}</FormLabel>
                      <Popover open={countryOpen} onOpenChange={setCountryOpen}>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              role="combobox"
                              aria-expanded={countryOpen}
                              className={cn(
                                "w-full justify-between",
                                !field.value && "text-muted-foreground"
                              )}
                              disabled={isSubmitting || countriesLoading}
                            >
                              {countriesLoading ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : selectedCountry ? (
                                <span>
                                  {getFlagEmoji(selectedCountry.code)}{" "}
                                  {selectedCountry.name}
                                </span>
                              ) : (
                                t("countryPlaceholder")
                              )}
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-full p-0" align="start">
                          <Command>
                            <CommandInput
                              placeholder={t("countrySearchPlaceholder")}
                            />
                            <CommandList>
                              <CommandEmpty>
                                {t("countryNotFound")}
                              </CommandEmpty>
                              <CommandGroup>
                                {countries.map((country) => (
                                  <CommandItem
                                    key={country.id}
                                    value={`${country.name} ${country.code}`}
                                    onSelect={() => {
                                      form.setValue("countryId", country.id, {
                                        shouldDirty: true,
                                        shouldValidate: true,
                                      });
                                      setCountryOpen(false);
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        field.value === country.id
                                          ? "opacity-100"
                                          : "opacity-0"
                                      )}
                                    />
                                    {getFlagEmoji(country.code)} {country.name}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
          </CardContent>
          <CardFooter className="mt-6">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("saving")}
                </>
              ) : (
                t("save")
              )}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
