import { OversightAccessGate } from "@/components/oversight-access-gate";
import { OversightDashboard } from "@/components/oversight-dashboard";

export default function OversightPage() {
  return (
    <OversightAccessGate>
      <OversightDashboard />
    </OversightAccessGate>
  );
}
