import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";

export default function Register() {
  const navigate = useNavigate();

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

  const handleSubmit = (e) => {
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

    console.log("Register data:", form);

    navigate("/login");
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
        Already have an account? <Link to="/login">Sign In</Link>
      </p>
    </>
  );
}