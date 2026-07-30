"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Area,
} from "recharts";
import { formatDate } from "@/lib/utils";

interface TransactionDataPoint {
  period: string;
  count: number;
}

interface TransactionsChartProps {
  dailyData: TransactionDataPoint[];
  weeklyData: TransactionDataPoint[];
  monthlyData: TransactionDataPoint[];
  yearlyData: TransactionDataPoint[];
}

type TooltipPayloadEntry = {
  color?: string;
  name?: string;
  value?: number | string;
};

type ChartTooltipProps = {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
};

// Helper to normalize date to YYYY-MM-DD format (handles both ISO timestamps and date strings)
const normalizeDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Helper to format date as YYYY-MM-DD
const toDateString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Fill missing days with zero values (last 7 days)
const fillDailyData = (data: TransactionDataPoint[]): TransactionDataPoint[] => {
  // Normalize the keys from backend data (handles ISO timestamps like "2025-12-27T00:00:00.000Z")
  const dataMap = new Map(data.map(d => [normalizeDate(d.period), d]));
  const result: TransactionDataPoint[] = [];
  const today = new Date();
  
  for (let i = 6; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = toDateString(date);
    const existing = dataMap.get(dateStr);
    result.push({
      period: dateStr,
      count: existing?.count ?? 0,
    });
  }
  
  return result;
};

// Fill missing weeks with zero values (last 7 weeks)
const fillWeeklyData = (data: TransactionDataPoint[]): TransactionDataPoint[] => {
  // Normalize the keys from backend data
  const dataMap = new Map(data.map(d => [normalizeDate(d.period), d]));
  const result: TransactionDataPoint[] = [];
  const today = new Date();
  
  for (let i = 6; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - (i * 7));
    // Get the Monday of that week
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    date.setDate(diff);
    const dateStr = toDateString(date);
    const existing = dataMap.get(dateStr);
    result.push({
      period: dateStr,
      count: existing?.count ?? 0,
    });
  }
  
  return result;
};

// Fill missing months with zero values (last 12 months)
const fillMonthlyData = (data: TransactionDataPoint[]): TransactionDataPoint[] => {
  // Normalize the keys from backend data
  const dataMap = new Map(data.map(d => [normalizeDate(d.period), d]));
  const result: TransactionDataPoint[] = [];
  const today = new Date();
  
  for (let i = 11; i >= 0; i--) {
    const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const dateStr = toDateString(date);
    const existing = dataMap.get(dateStr);
    result.push({
      period: dateStr,
      count: existing?.count ?? 0,
    });
  }
  
  return result;
};

// Fill missing years with zero values (last 5 years)
const fillYearlyData = (data: TransactionDataPoint[]): TransactionDataPoint[] => {
  // Normalize the keys from backend data
  const dataMap = new Map(data.map(d => [normalizeDate(d.period), d]));
  const result: TransactionDataPoint[] = [];
  const currentYear = new Date().getFullYear();
  
  for (let i = 4; i >= 0; i--) {
    const year = currentYear - i;
    const dateStr = `${year}-01-01`;
    const existing = dataMap.get(dateStr);
    result.push({
      period: dateStr,
      count: existing?.count ?? 0,
    });
  }
  
  return result;
};

export function TransactionsChart({
  dailyData,
  weeklyData,
  monthlyData,
  yearlyData,
}: TransactionsChartProps) {
  const t = useTranslations("admin.dashboard.transactionsChart");

  // Fill in missing data points with zeros
  const filledDailyData = useMemo(() => fillDailyData(dailyData), [dailyData]);
  const filledWeeklyData = useMemo(() => fillWeeklyData(weeklyData), [weeklyData]);
  const filledMonthlyData = useMemo(() => fillMonthlyData(monthlyData), [monthlyData]);
  const filledYearlyData = useMemo(() => fillYearlyData(yearlyData), [yearlyData]);

  const formatDateShort = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const formatMonth = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  };

  const formatWeek = (dateStr: string) => {
    const date = new Date(dateStr);
    return `W${getWeekNumber(date)}`;
  };

  const formatYear = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.getFullYear().toString();
  };

  const getWeekNumber = (date: Date) => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  };

  const CustomTooltip = ({ active, payload, label }: ChartTooltipProps) => {
    if (active && payload && payload.length) {
      return (
        <div className="rounded-lg border bg-background p-3 shadow-md">
          <p className="text-sm font-medium">{formatDate(label ?? "")}</p>
          {payload.map((entry, index) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: {typeof entry.value === "number" ? entry.value : Number(entry.value ?? 0)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const renderChartContent = (
    data: TransactionDataPoint[],
    formatX: (date: string) => string
  ) => (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ top: 20, right: 20, left: 20, bottom: 20 }}>
        <defs>
          <linearGradient id="colorGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4}/>
            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
          </linearGradient>
        </defs>
        <XAxis
          dataKey="period"
          tickFormatter={formatX}
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
        />
        <YAxis
          tickFormatter={(value: number) => Math.round(value).toString()}
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
          allowDecimals={false}
          domain={[0, 'auto']}
        />
        <Tooltip content={<CustomTooltip />} />
        <Area
          type="monotone"
          dataKey="count"
          stroke="none"
          fill="url(#colorGradient)"
        />
        <Line
          type="monotone"
          dataKey="count"
          name={t("transactions")}
          stroke="#8b5cf6"
          strokeWidth={3}
          dot={{
            fill: "white",
            stroke: "#8b5cf6",
            strokeWidth: 2.5,
            r: 5
          }}
          activeDot={{
            fill: "white",
            stroke: "#8b5cf6",
            strokeWidth: 2.5,
            r: 7
          }}
        />
      </LineChart>
    </ResponsiveContainer>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="daily" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="daily">{t("daily")}</TabsTrigger>
            <TabsTrigger value="weekly">{t("weekly")}</TabsTrigger>
            <TabsTrigger value="monthly">{t("monthly")}</TabsTrigger>
            <TabsTrigger value="yearly">{t("yearly")}</TabsTrigger>
          </TabsList>
          <TabsContent value="daily" className="mt-6">
            {renderChartContent(filledDailyData, formatDateShort)}
          </TabsContent>
          <TabsContent value="weekly" className="mt-6">
            {renderChartContent(filledWeeklyData, formatWeek)}
          </TabsContent>
          <TabsContent value="monthly" className="mt-6">
            {renderChartContent(filledMonthlyData, formatMonth)}
          </TabsContent>
          <TabsContent value="yearly" className="mt-6">
            {renderChartContent(filledYearlyData, formatYear)}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
