"use client";

import { useEffect } from "react";

import { installConsoleLogBridge } from "@/lib/client-logger";

export function ClientLogBridgeProvider() {
  useEffect(() => {
    installConsoleLogBridge();
  }, []);

  return null;
}
