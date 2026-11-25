import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import FamilyHome from "../pages/Home/FamilyHome";
import Guestbook from "../pages/Guestbook";
import GuestbookAdmin from "../pages/GuestbookAdmin";
import CoachAdmin from "../pages/CoachAdmin";
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
        {/* 教练申请审核页：同样不进导航、不进 sitemap，只给管理员一个地址 */}
        <Route path="/coach-admin" element={<CoachAdmin />} />

        {/* The Hearth Studio pages moved to hs.ichessgeek.com; old inbound links
            and bookmarks land on the real home instead of a blank shell. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
