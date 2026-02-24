import { BrowserRouter, Routes, Route } from "react-router-dom";
import MainLayout from "../layout/MainLayout";
import AuthLayout from "../layout/AuthLayout";

import Home from "../pages/Home";
import Login from "../pages/Login";
import Register from "../pages/Register";
import Customize from "../pages/Customize";

import Collection from "../pages/Collection";
import Tableware from "../pages/Collection/Tableware";

// 如果还没创建这三个文件，先删除下面三行和对应路由
// import CoffeeWare from "../pages/Collection/CoffeeWare";
// import TeaWare from "../pages/Collection/TeaWare";
// import HomeDecor from "../pages/Collection/HomeDecor";

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>

        {/* 主布局 */}
        <Route element={<MainLayout />}>

          <Route path="/" element={<Home />} />
          <Route path="/collection" element={<Collection />} />          
          <Route path="/collection/:productId" element={<Tableware />} />
          
          {/* 还没做就先别写 */}
          {/* <Route path="/collection/coffeeware" element={<CoffeeWare />} />
          <Route path="/collection/teaware" element={<TeaWare />} />
          <Route path="/collection/home-decor" element={<HomeDecor />} /> */}

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