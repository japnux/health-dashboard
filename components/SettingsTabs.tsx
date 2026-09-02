"use client";

import { useState } from "react";
import { SettingsForm } from "./SettingsForm";
import { SyncLogs } from "./SyncLogs";
import { MealSlotsSettings } from "./MealSlotsSettings";
import { ApiUsageStats } from "./ApiUsageStats";
import { NUTRITION_ENABLED } from "@/lib/features";

type TabId = "config" | "slots" | "logs" | "api";

const TABS: { id: TabId; label: string }[] = [
  { id: "config", label: "Configuration" },
  ...(NUTRITION_ENABLED
    ? [{ id: "slots" as const, label: "Meal Slots" }]
    : []),
  { id: "logs", label: "Logs sync" },
  { id: "api", label: "Coûts API" },
];

export function SettingsTabs() {
  const [tab, setTab] = useState<TabId>("config");

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-[var(--radius-md)] bg-[var(--color-border)]/30 dark:bg-white/5 p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 text-sm py-1.5 rounded-[var(--radius-sm)] transition-colors ${
              tab === t.id
                ? "bg-white dark:bg-white/10 text-[var(--color-heading)] dark:text-white shadow-sm font-normal"
                : "text-[var(--color-body)] hover:text-[var(--color-heading)] dark:hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "config" && <SettingsForm />}
      {tab === "slots" && NUTRITION_ENABLED && <MealSlotsSettings />}
      {tab === "logs" && <SyncLogs />}
      {tab === "api" && <ApiUsageStats />}
    </div>
  );
}
