import { rpc } from "../lib/db";
import OrderFlow from "./OrderFlow";

export const dynamic = "force-dynamic";

export default async function Page() {
  let info = null;
  let loadError = null;

  try {
    info = await rpc("get_ordering_info");
  } catch (e) {
    loadError = e.message;
  }

  return <OrderFlow info={info} loadError={loadError} />;
}
