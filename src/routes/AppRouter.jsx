import { BrowserRouter, Routes, Route } from "react-router-dom";
import MainLayout from "../layout/MainLayout";
import AuthLayout from "../layout/AuthLayout";

import Home from "../pages/Home";
import Login from "../pages/Login";
import Register from "../pages/Register";
import Customize from "../pages/Customize";

import Collection from "../pages/collection";
import Tableware from "../pages/collection/Tableware";
import Coffeeware from "../pages/collection/Coffeeware";
import TeaWare from "../pages/collection/Teaware";
import HomeDecor from "../pages/collection/Homedecor";

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>

        {/* 主布局 */}
        <Route element={<MainLayout />}>

          <Route path="/" element={<Home />} />
          <Route path="/collection" element={<Collection />} />

          {/* ✅ 分类页面 */}
          <Route path="/collection/tableware" element={<Tableware />} />
          <Route path="/collection/coffeeware" element={<Coffeeware />} />
          <Route path="/collection/teaware" element={<TeaWare />} />
          <Route path="/collection/homedecor" element={<HomeDecor />} />

          <Route path="/customize" element={<Customize />} />

        </Route>

        {/* Auth 布局 */}
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
        </Route>

      </Routes>
    </BrowserRouter>
  );
}