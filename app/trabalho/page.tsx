import WorksClient from "./WorksClient";
import { listPublicCases } from "@/lib/kbos/showcase";

// Cases publicados (com autorização do cliente) + os antigos do código.
export const revalidate = 60;

export default async function WorksPage() {
  return <WorksClient projects={await listPublicCases()} />;
}
