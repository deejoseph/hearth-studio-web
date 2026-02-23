import { BrowserRouter, Routes, Route } from "react-router-dom";
import MainLayout from "../layout/MainLayout";

import Home from "../pages/Home";
import Login from "../pages/Login";
import Product from "../pages/Product";
import Customize from "../pages/Customize";

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/product" element={<Product />} />
          <Route path="/customize" element={<Customize />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}