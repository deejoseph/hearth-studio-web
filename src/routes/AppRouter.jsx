import { BrowserRouter, Routes, Route } from "react-router-dom";
import MainLayout from "../layout/MainLayout";

import Home from "../pages/Home";
import Login from "../pages/Login";
import Product from "../pages/Product";
import Customize from "../pages/Customize";
import Register from "../pages/Register";
import AuthLayout from "../layout/AuthLayout";

export default function AppRouter() {
  return (
    <BrowserRouter>
  <Routes>

    {/* 主布局 */}
    <Route element={<MainLayout />}>
      <Route path="/" element={<Home />} />
      <Route path="/product" element={<Product />} />
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