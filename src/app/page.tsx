"use client";

/**
 * SystemLab — page unique (SPA mono-route).
 * Le shell gère la navigation entre vues via useAppStore (activeView).
 */
import { AppShell } from "@/components/app-shell";

export default function Page() {
  return <AppShell />;
}
