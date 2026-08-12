import AdminDashboard from "./AdminDashboard";
import "./admin.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Navera Admin",
  // Nothing here should ever be indexed, even though it's behind a login.
  robots: { index: false, follow: false },
};

export default function Page() {
  return <AdminDashboard />;
}
