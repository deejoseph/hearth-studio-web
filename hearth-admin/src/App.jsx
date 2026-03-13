import { useState, useEffect } from "react";

export default function App() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const savedLogin = localStorage.getItem("hearthAdminLogin");
    if (savedLogin === "true") {
      // 如果已经登录，直接跳到后台首页
      window.location.href =
        "https://ichessgeek.com/api/hearthstudio/v1/admin_order.php";
    }
  }, []);

  const handleLogin = async () => {
    if (!username || !password) {
      setError("Please enter username and password");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        "https://ichessgeek.com/api/hearthstudio/v1/admin_login.php",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include", // 🔴 必须加，保证 session 生效
          body: JSON.stringify({
            username,
            password,
          }),
        }
      );

      const data = await response.json();

      if (data.success) {
        localStorage.setItem("hearthAdminLogin", "true");

        // 🔥 关键：根据角色跳转到对应 php
        window.location.href =
          "https://ichessgeek.com/api/hearthstudio/v1/" + data.redirect;
      } else {
        setError(data.message || "Login failed");
      }
    } catch (err) {
      setError("Network error");
    }

    setLoading(false);
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2 style={styles.title}>Hearth Admin</h2>

        <input
          style={styles.input}
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />

        <input
          style={styles.input}
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button style={styles.button} onClick={handleLogin}>
          {loading ? "Logging in..." : "Login"}
        </button>

        {error && (
          <div style={{ color: "red", textAlign: "center" }}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: "100vh",
    width: "100%",
    backgroundColor: "#111",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: "20px",
  },
  card: {
    width: "100%",
    maxWidth: "400px",
    backgroundColor: "#1c1c1c",
    padding: "40px",
    borderRadius: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  },
  title: {
    textAlign: "center",
    marginBottom: "10px",
    color: "#f97316",
  },
  input: {
    padding: "14px",
    fontSize: "16px",
    borderRadius: "8px",
    border: "none",
  },
  button: {
    padding: "14px",
    fontSize: "16px",
    borderRadius: "8px",
    border: "none",
    backgroundColor: "#f97316",
    color: "white",
    cursor: "pointer",
  },
};