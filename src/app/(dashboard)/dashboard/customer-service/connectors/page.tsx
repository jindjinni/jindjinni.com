import { DepartmentConnectors } from "@/components/dept-connectors";

export const dynamic = "force-dynamic";

export default function ConnectorsPage() {
  return <DepartmentConnectors dept="customer-service" />;
}
