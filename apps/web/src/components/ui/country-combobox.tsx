"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface Country {
  id: string;
  name: string;
  code: string;
}

interface CountryComboboxProps {
  countries: Country[];
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Convert ISO 3166-1 alpha-2 country code to flag emoji
 */
function getFlagEmoji(countryCode: string): string {
  const codePoints = countryCode
    .toUpperCase()
    .split("")
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

export function CountryCombobox({
  countries,
  value,
  onValueChange,
  placeholder = "Select country...",
  searchPlaceholder = "Search country...",
  emptyText = "No country found.",
  disabled = false,
  className,
}: CountryComboboxProps) {
  const [open, setOpen] = React.useState(false);

  const selectedCountry = countries.find((country) => country.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal",
            !value && "text-muted-foreground",
            className
          )}
        >
          {selectedCountry ? (
            <span className="flex items-center gap-2">
              <span className="text-base">
                {getFlagEmoji(selectedCountry.code)}
              </span>
              {selectedCountry.name}
            </span>
          ) : (
            placeholder
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
      >
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {countries.map((country) => (
                <CommandItem
                  key={country.id}
                  value={`${country.name} ${country.code}`}
                  onSelect={() => {
                    onValueChange(country.id === value ? "" : country.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === country.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="mr-2 text-base">
                    {getFlagEmoji(country.code)}
                  </span>
                  {country.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
