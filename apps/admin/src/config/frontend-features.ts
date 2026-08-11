import {
  Zap,
  Shield,
  BarChart3,
  Users,
  Layers,
  Clock,
  type LucideIcon,
} from "lucide-react";

export interface Feature {
  icon: LucideIcon;
  key: string; // Translation key for this feature
}

// Feature items with icons and translation keys
// Text content is loaded from messages/{locale}.json -> features.items.{key}
export const features: Feature[] = [
  {
    icon: Zap,
    key: "lightningFast",
  },
  {
    icon: Shield,
    key: "enterpriseSecurity",
  },
  {
    icon: BarChart3,
    key: "advancedAnalytics",
  },
  {
    icon: Users,
    key: "teamCollaboration",
  },
  {
    icon: Layers,
    key: "scalableInfrastructure",
  },
  {
    icon: Clock,
    key: "support",
  },
];