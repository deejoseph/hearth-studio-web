import { Outlet } from "react-router-dom";
import Header from "../components/Header";

export default function MainLayout() {
  return (
    <div className="layout">
      <Header />

      <main className="main">
        <Outlet />
      </main>

      <footer className="footer">
        © 2026 Hearth Studio
      </footer>
    </div>
  );
}