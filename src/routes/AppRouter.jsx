import { BrowserRouter, Routes, Route } from "react-router-dom";
import MainLayout from "../layout/MainLayout";
import AuthLayout from "../layout/AuthLayout";

import Home from "../pages/Home";
import Cover from "../pages/Cover";
import Login from "../pages/Login";
import Register from "../pages/Register";
import Customize from "../pages/Customize";
import BridgePage from "../pages/BridgePage";
import OrderDetail from "../pages/OrderDetail";

import Collection from "../pages/collection";
import Tableware from "../pages/collection/Tableware";
import Coffeeware from "../pages/collection/Coffeeware";
import TeaWare from "../pages/collection/Teaware";
import HomeDecor from "../pages/collection/Homedecor";

import { AuthProvider } from "../context/AuthContext";
import ForgotPassword from "../pages/auth/ForgotPassword";
import ResetPassword from "../pages/auth/ResetPassword";
import VerifyEmail from "../pages/VerifyEmail";

export default function AppRouter() {
  return (
    <AuthProvider>
    <BrowserRouter>
      <Routes>

        {/* ================= Main Layout ================= */}
        <Route element={<MainLayout />}>

          <Route path="/" element={<Cover />} />
          <Route path="/home" element={<Home />} />
          <Route path="/collection" element={<Collection />} />

          {/* 分类页面 */}
          <Route path="/collection/tableware" element={<Tableware />} />
          <Route path="/collection/coffeeware" element={<Coffeeware />} />
          <Route path="/collection/teaware" element={<TeaWare />} />
          <Route path="/collection/homedecor" element={<HomeDecor />} />

          {/* 桥梁页面 */}
          <Route
            path="/bridge/:productId/:craftTypeId"
            element={<BridgePage />}
          />

          {/* 时间轴页面 */}
          <Route
            path="/customize"
            element={<Customize />}
          />

          {/* 单个订单详情页面 */}
          <Route
            path="/order/:id"
            element={<OrderDetail />}
          />

        </Route>

        {/* ================= Auth Layout ================= */}
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
        </Route>

        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        </Routes>
    </BrowserRouter>
    </AuthProvider>
  );
}
