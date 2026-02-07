"use client";

import dynamic from "next/dynamic";
import { UserSync } from "@/components/user-sync";

const PhysioScene = dynamic(
  () => import("@/components/physio-scene").then((m) => m.PhysioScene),
  { ssr: false },
);

export default function DashboardPage() {
  return (
    <UserSync>
      <PhysioScene />
    </UserSync>
  );
}
