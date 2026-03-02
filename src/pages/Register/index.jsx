import { Link, useNavigate, useLocation } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../../context/AuthContext";

export default function Register() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: ""
  });

  const [error, setError] = useState("");

  const handleChange = (e) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.name || !form.email || !form.password || !form.confirmPassword) {
      setError("Please fill in all fields.");
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setError("");

    try {
      const response = await fetch(
        "/api/hearthstudio/v1/register.php",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            name: form.name,
            email: form.email,
            password: form.password
          })
        }
      );

      const data = await response.json();

      if (!data.success) {
        setError(data.message);
        return;
      }

      // 🔥 注册成功自动登录
      login(data.user);

      const redirectPath = location.state?.from || "/";
      const productData = location.state?.productData || null;

      navigate(redirectPath, {
        state: productData,
        replace: true
      });

    } catch (err) {
      setError("Registration failed. Please try again.");
    }
  };

  return (
    <>
      <h2 className="auth-title">Create Account</h2>
      <p className="auth-subtitle">
        Join Hearth Studio and bring light home
      </p>

      <form onSubmit={handleSubmit} className="auth-form">

        <input
          type="text"
          name="name"
          placeholder="Full Name"
          className="auth-input"
          value={form.name}
          onChange={handleChange}
        />

        <input
          type="email"
          name="email"
          placeholder="Email"
          className="auth-input"
          value={form.email}
          onChange={handleChange}
        />

        <input
          type="password"
          name="password"
          placeholder="Password"
          className="auth-input"
          value={form.password}
          onChange={handleChange}
        />

        <input
          type="password"
          name="confirmPassword"
          placeholder="Confirm Password"
          className="auth-input"
          value={form.confirmPassword}
          onChange={handleChange}
        />

        {error && <p className="auth-error">{error}</p>}

        <button type="submit" className="auth-button">
          Create Account
        </button>

      </form>

      <p className="auth-switch">
        Already have an account?{" "}
        <Link to="/login" state={location.state}>
          Sign In
        </Link>
      </p>
    </>
  );
}