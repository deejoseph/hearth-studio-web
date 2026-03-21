import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "../../styles/Auth.css";

export default function ResetPassword() {
  const location = useLocation();
  const navigate = useNavigate();

  const email = location.state?.email || "";

  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }

    try {
  const response = await fetch(
    "/api/hearthstudio/v1/reset_password.php",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        code,
        new_password: password,
      }),
    }
  );

  const data = await response.json();

  if (data.success) {
    // 先显示成功提示
    setError(""); 
    alert("Password reset successfully. Redirecting to login...");

    // 1秒后跳转
    setTimeout(() => {
      navigate("/login");
    }, 1000);

  } else {
    setError(data.message);
  }

} catch (err) {
  console.error(err);
  setError("Server error.");
}
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-container">
        <div className="auth-card">
          <h2 className="auth-title">Reset Password</h2>

          {error && <div className="auth-error">{error}</div>}

          <form onSubmit={handleSubmit}>
            <input
              type="text"
              placeholder="Enter reset code"
              className="auth-input"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />

            <input
              type="password"
              placeholder="New password"
              className="auth-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            <input
              type="password"
              placeholder="Confirm password"
              className="auth-input"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />

            <button type="submit" className="auth-button">
              Reset Password
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}