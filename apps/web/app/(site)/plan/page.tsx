import { redirect } from "next/navigation";

/** The dashboard opens on the Fremont demo household's week. */
export default function PlanIndex() {
  redirect("/plan/fremont-demo");
}
