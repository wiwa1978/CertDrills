"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Mail, User, X } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";

export interface UserOption {
  id: string;
  name: string | null;
  email: string;
}

interface UserMultiSelectProps {
  selectedUserIds: string[];
  onSelectionChange: (userIds: string[]) => void;
  searchUsers: (query: string, limit?: number) => Promise<UserOption[]>;
  initialUsers?: UserOption[];
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  searchPlaceholder?: string;
  minSearchLength?: number;
  loadingMessage?: string;
  emptyMessage?: string;
  minSearchMessage?: string;
  selectionSummary?: (count: number) => string;
}

export function UserMultiSelect({
  selectedUserIds,
  onSelectionChange,
  searchUsers,
  initialUsers = [],
  disabled = false,
  placeholder = "Select users...",
  className,
  searchPlaceholder = "Search users by name or email...",
  minSearchLength = 2,
  loadingMessage = "Searching...",
  emptyMessage = "No users found",
  minSearchMessage,
  selectionSummary,
}: UserMultiSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [users, setUsers] = React.useState<UserOption[]>([]);
  const [loading, setLoading] = React.useState(false);

  const [knownUsers, setKnownUsers] = React.useState<Record<string, UserOption>>(() =>
    Object.fromEntries(initialUsers.map((user) => [user.id, user])),
  );

  const mergeKnownUsers = React.useCallback((incomingUsers: UserOption[]) => {
    if (incomingUsers.length === 0) {
      return;
    }

    setKnownUsers((current) => {
      const next = { ...current };
      for (const user of incomingUsers) {
        next[user.id] = user;
      }
      return next;
    });
  }, []);

  React.useEffect(() => {
    mergeKnownUsers(initialUsers);
  }, [initialUsers, mergeKnownUsers]);

  const selectedUsers = React.useMemo(
    () =>
      selectedUserIds.map((userId) => {
        return knownUsers[userId] ?? { id: userId, name: userId, email: "" };
      }),
    [knownUsers, selectedUserIds],
  );

  React.useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchQuery.trim().length >= minSearchLength) {
        setLoading(true);
        try {
          const results = await searchUsers(searchQuery, 20);
          setUsers(results);
          mergeKnownUsers(results);
        } catch (error) {
          console.error("Failed to search users:", error);
          setUsers([]);
        } finally {
          setLoading(false);
        }
      } else {
        setUsers([]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [mergeKnownUsers, minSearchLength, searchQuery, searchUsers]);

  const toggleUser = (user: UserOption) => {
    if (selectedUserIds.includes(user.id)) {
      onSelectionChange(selectedUserIds.filter((id) => id !== user.id));
    } else {
      mergeKnownUsers([user]);
      onSelectionChange([...selectedUserIds, user.id]);
    }
  };

  const removeUser = (userId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectionChange(selectedUserIds.filter((id) => id !== userId));
  };

  return (
    <div className={cn("space-y-2", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
            disabled={disabled}
          >
            {selectedUsers.length === 0 ? (
              <span className="text-muted-foreground">{placeholder}</span>
            ) : (
              <span className="truncate">
                {selectionSummary
                  ? selectionSummary(selectedUsers.length)
                  : `${selectedUsers.length} user${selectedUsers.length !== 1 ? "s" : ""} selected`}
              </span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0" align="start">
          <Command filter={() => 1}>
            <CommandInput
              placeholder={searchPlaceholder}
              value={searchQuery}
              onValueChange={setSearchQuery}
            />
            <CommandList>
              {loading ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  {loadingMessage}
                </div>
              ) : users.length === 0 ? (
                <CommandEmpty>
                  {searchQuery.trim().length < minSearchLength
                    ? (minSearchMessage ?? `Type at least ${minSearchLength} characters to search`)
                    : emptyMessage}
                </CommandEmpty>
              ) : (
                <CommandGroup>
                  {users.map((user) => (
                    <CommandItem
                      key={user.id}
                      value={user.id}
                      onSelect={() => {
                        toggleUser(user);
                      }}
                    >
                      <div className="flex items-center gap-2 flex-1">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                          <User className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex flex-col">
                          <span className="font-medium">{user.name || user.email}</span>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {user.email}
                          </span>
                        </div>
                      </div>
                      {selectedUserIds.includes(user.id) && (
                        <Check className="h-4 w-4 text-primary" />
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Selected users badges */}
      {selectedUsers.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedUsers.map((user) => (
            <Badge
              key={user.id}
              variant="secondary"
              className="gap-1 pr-1"
              title={user.email || user.id}
            >
              <span className="max-w-[150px] truncate">
                {user.name || user.email || user.id}
              </span>
              <button
                type="button"
                onClick={(e) => removeUser(user.id, e)}
                className="ml-1 rounded-full hover:bg-destructive/20 p-0.5 transition-colors"
                disabled={disabled}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
