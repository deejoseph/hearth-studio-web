import { createContext, useContext, useState, useEffect } from "react";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);

  // 🔥 安全读取 localStorage
  useEffect(() => {
    try {
      const storedUser = localStorage.getItem("user");

      if (
        storedUser &&
        storedUser !== "undefined" &&
        storedUser !== "null"
      ) {
        const parsedUser = JSON.parse(storedUser);
        setUser(parsedUser);
      }
    } catch (error) {
      console.error("Invalid user data in localStorage:", error);
      localStorage.removeItem("user"); // 清除坏数据
      setUser(null);
    }
  }, []);

  // 🔥 安全登录
  const login = (userData) => {
    if (!userData || typeof userData !== "object") {
      console.warn("Invalid userData passed to login()");
      return;
    }

    localStorage.setItem("user", JSON.stringify(userData));
    setUser(userData);
  };

  const updateUser = (partialUser) => {
    if (!partialUser || typeof partialUser !== "object") return;
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...partialUser };
      localStorage.setItem("user", JSON.stringify(next));
      return next;
    });
  };

  // 🔥 退出登录
  const logout = () => {
    localStorage.removeItem("user");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
