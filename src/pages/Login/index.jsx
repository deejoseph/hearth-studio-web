import { Link, useNavigate, useLocation } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../../context/AuthContext";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const [form, setForm] = useState({
    email: "",
    password: ""
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

    if (!form.email || !form.password) {
      setError("Please fill in all fields.");
      return;
    }

    setError("");

    try {
      const response = await fetch(
        "/api/hearthstudio/v1/login.php",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
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

      login(data.user);

      const redirectPath = location.state?.from || "/";
      const productData = location.state?.productData || null;

      navigate(redirectPath, {
        state: productData,
        replace: true
      });

    } catch (err) {
      setError("Login failed. Please try again.");
    }
  };

  return (
    <>
      <h2 className="auth-title">Welcome Back</h2>
      <p className="auth-subtitle">
        Sign in to continue your journey
      </p>

      <form onSubmit={handleSubmit} className="auth-form">

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

        {error && <p className="auth-error">{error}</p>}

        <button type="submit" className="auth-button">
          Sign In
        </button>

      </form>

      <p className="auth-switch">
        Don’t have an account?{" "}
        <Link to="/register" state={location.state}>
          Create one
        </Link>
      </p>
    </>
  );
}