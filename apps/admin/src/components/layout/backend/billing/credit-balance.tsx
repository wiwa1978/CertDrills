"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CreditCard, Plus, Loader2 } from "lucide-react";
import { getCreditBalance } from "@/lib/services/credits";

interface CreditBalanceProps {
  className?: string;
}

export function CreditBalance({ className }: CreditBalanceProps) {
  const [credits, setCredits] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    fetchCredits();
  }, []);
  
  const fetchCredits = async () => {
    try {
      const data = await getCreditBalance();
      setCredits(data.balance);
    } catch (error) {
      console.error("Failed to fetch credits:", error);
    } finally {
      setLoading(false);
    }
  };
  
  if (loading) {
    return (
      <Card className={className}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Credit Balance</CardTitle>
          <CreditCard className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }
  
  const creditBalance = credits || 0;
  const isLowCredits = creditBalance <= 10;
  
  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Credit Balance</CardTitle>
        <CreditCard className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">
          {creditBalance.toLocaleString()}
        </div>
        <div className="flex items-center justify-between mt-2">
          <Badge variant={isLowCredits ? "destructive" : "default"}>
            {isLowCredits ? "Low Credits" : "Active"}
          </Badge>
          <Button size="sm" variant="outline">
            <Plus className="h-4 w-4 mr-1" />
            Buy Credits
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
