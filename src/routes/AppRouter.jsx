import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import FamilyHome from "../pages/Home/FamilyHome";
import Guestbook from "../pages/Guestbook";
import GuestbookAdmin from "../pages/GuestbookAdmin";
import Education from "../pages/Education";
import Tech from "../pages/Tech";
import Business from "../pages/Business";

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<FamilyHome />} />
        <Route path="/education" element={<Education />} />
        <Route path="/tech" element={<Tech />} />
        <Route path="/business" element={<Business />} />
        <Route path="/guestbook" element={<Guestbook />} />
        {/* 留言板管理页：不进导航，仅直接访问 */}
        <Route path="/guestbook-admin" element={<GuestbookAdmin />} />

        {/* The Hearth Studio pages moved to hs.ichessgeek.com; old inbound links
            and bookmarks land on the real home instead of a blank shell. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
