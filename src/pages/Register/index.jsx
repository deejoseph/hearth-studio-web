import { Link, useNavigate, useLocation } from "react-router-dom";
import { useState } from "react";
import { register as registerRequest } from "../../api/authService";
import { uploadImage } from "../../api/uploadService";

export default function Register() {
  const navigate = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    display_name: "",
    country: "",
    city: "",
    style_preference: "",
    budget_range: "",
    bio: "",
    avatar_url: ""
  });

  const [error, setError] = useState("");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value
    });
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Avatar must be an image file.");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setError("Avatar must be smaller than 2MB.");
      return;
    }

    setError("");
    setUploadingAvatar(true);

    try {
      const fd = new FormData();
      fd.append("image", file);
      fd.append("type", "avatar");

      const data = await uploadImage(fd);
      const avatarUrl =
        data?.url ||
        data?.data?.url ||
        data?.imageUrl ||
        data?.file_url ||
        data?.path ||
        "";

      if (!avatarUrl) {
        setError("Avatar uploaded, but no image URL was returned.");
        return;
      }

      setForm((prev) => ({
        ...prev,
        avatar_url: avatarUrl
      }));
    } catch (err) {
      setError("Avatar upload failed. Please try again.");
    } finally {
      setUploadingAvatar(false);
      e.target.value = "";
    }
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
    setSubmitting(true);

    try {
      const payload = {
        name: form.name,
        email: form.email,
        password: form.password,
        display_name: form.display_name || null,
        country: form.country || null,
        city: form.city || null,
        style_preference: form.style_preference || null,
        budget_range: form.budget_range || null,
        bio: form.bio || null,
        avatar_url: form.avatar_url || null
      };

      const data = await registerRequest(payload);

      if (!data.success) {
        setError(data.message || "Registration failed.");
        return;
      }

      navigate("/verify-email", {
        state: { email: data.email || form.email }
      });
    } catch (err) {
      setError("Registration failed. Please try again.");
    } finally {
      setSubmitting(false);
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
          type="text"
          name="display_name"
          placeholder="Display Name (Optional)"
          className="auth-input"
          value={form.display_name}
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

        <div className="auth-field-group">
          <label className="auth-label" htmlFor="avatar-upload">
            Avatar (Optional)
          </label>
          <input
            id="avatar-upload"
            type="file"
            accept="image/*"
            className="auth-input auth-file-input"
            onChange={handleAvatarChange}
            disabled={uploadingAvatar || submitting}
          />
          {uploadingAvatar && (
            <p className="auth-subhint">Uploading avatar...</p>
          )}
          {form.avatar_url && (
            <img
              src={form.avatar_url}
              alt="Avatar preview"
              className="auth-avatar-preview"
            />
          )}
        </div>

        <input
          type="text"
          name="country"
          placeholder="Country (Optional)"
          className="auth-input"
          value={form.country}
          onChange={handleChange}
        />

        <input
          type="text"
          name="city"
          placeholder="City (Optional)"
          className="auth-input"
          value={form.city}
          onChange={handleChange}
        />

        <input
          type="text"
          name="style_preference"
          placeholder="Style Preference (Optional)"
          className="auth-input"
          value={form.style_preference}
          onChange={handleChange}
        />

        <input
          type="text"
          name="budget_range"
          placeholder="Budget Range (Optional)"
          className="auth-input"
          value={form.budget_range}
          onChange={handleChange}
        />

        <textarea
          name="bio"
          placeholder="Tell us your custom idea (Optional)"
          className="auth-input auth-textarea"
          value={form.bio}
          onChange={handleChange}
          rows={4}
        />

        {error && <p className="auth-error">{error}</p>}

        <button
          type="submit"
          className="auth-button"
          disabled={uploadingAvatar || submitting}
        >
          {submitting ? "Creating Account..." : "Create Account"}
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
