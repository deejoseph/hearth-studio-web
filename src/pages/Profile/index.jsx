import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { updateProfile } from "../../api/authService";
import { uploadImage } from "../../api/uploadService";
import "./Profile.css";

export default function Profile() {
  const { user, updateUser } = useAuth();
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [avatarZoomOpen, setAvatarZoomOpen] = useState(false);
  const avatarInputRef = useRef(null);
  const [form, setForm] = useState(() => ({
    name: user?.name || "",
    display_name: user?.display_name || "",
    country: user?.country || "",
    city: user?.city || "",
    style_preference: user?.style_preference || "",
    budget_range: user?.budget_range || "",
    bio: user?.bio || "",
    avatar_url: user?.avatar_url || ""
  }));

  const displayName = useMemo(
    () => form.display_name || form.name || "User",
    [form.display_name, form.name]
  );
  const avatarUrl = form.avatar_url || "";
  const avatarFallback = displayName.charAt(0).toUpperCase();

  if (!user) {
    return (
      <section className="profile-page">
        <div className="profile-card profile-empty">
          <h1>Profile</h1>
          <p>Please sign in to view your profile details.</p>
          <Link to="/login" className="profile-btn">
            Go to Login
          </Link>
        </div>
      </section>
    );
  }

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
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
    setMessage("");
    setUploadingAvatar(true);

    try {
      const fd = new FormData();
      fd.append("image", file);
      fd.append("type", "avatar");

      const data = await uploadImage(fd);
      const uploadedUrl =
        data?.url ||
        data?.data?.url ||
        data?.imageUrl ||
        data?.file_url ||
        data?.path ||
        "";

      if (!uploadedUrl) {
        setError("Avatar uploaded, but no image URL was returned.");
        return;
      }

      setForm((prev) => ({ ...prev, avatar_url: uploadedUrl }));
      setMessage("Avatar uploaded. Click Save Profile to apply changes.");
    } catch {
      setError("Avatar upload failed. Please try again.");
    } finally {
      setUploadingAvatar(false);
      e.target.value = "";
    }
  };

  const handleAvatarClick = () => {
    if (avatarUrl) {
      setAvatarZoomOpen(true);
      return;
    }
    avatarInputRef.current?.click();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.name.trim()) {
      setError("Full Name is required.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    const payload = {
      email: user.email,
      name: form.name.trim(),
      display_name: form.display_name.trim() || null,
      country: form.country.trim() || null,
      city: form.city.trim() || null,
      style_preference: form.style_preference.trim() || null,
      budget_range: form.budget_range.trim() || null,
      bio: form.bio.trim() || null,
      avatar_url: form.avatar_url.trim() || null
    };

    try {
      const data = await updateProfile(payload);
      if (!data.success) {
        setError(data.message || "Profile update failed.");
        return;
      }

      const nextUser = data.user || payload;
      updateUser(nextUser);
      setMessage("Profile updated successfully.");
    } catch {
      setError("Profile update failed. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="profile-page">
      <div className="profile-card">
        <div className="profile-header">
          <button
            type="button"
            className="profile-avatar-button"
            onClick={handleAvatarClick}
            aria-label={avatarUrl ? "Open avatar preview" : "Upload avatar"}
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={displayName}
                className="profile-avatar"
              />
            ) : (
              <div className="profile-avatar profile-avatar-fallback">
                {avatarFallback}
              </div>
            )}
          </button>

          <div>
            <h1>{displayName}</h1>
            <p className="profile-subtitle">{user.email}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="profile-form">
          <div className="profile-grid">
            <label className="profile-item">
              <span className="profile-label">Full Name *</span>
              <input
                className="profile-input"
                name="name"
                value={form.name}
                onChange={handleChange}
                required
              />
            </label>
            <label className="profile-item">
              <span className="profile-label">Display Name</span>
              <input
                className="profile-input"
                name="display_name"
                value={form.display_name}
                onChange={handleChange}
              />
            </label>
            <label className="profile-item">
              <span className="profile-label">Country</span>
              <input
                className="profile-input"
                name="country"
                value={form.country}
                onChange={handleChange}
              />
            </label>
            <label className="profile-item">
              <span className="profile-label">City</span>
              <input
                className="profile-input"
                name="city"
                value={form.city}
                onChange={handleChange}
              />
            </label>
            <label className="profile-item">
              <span className="profile-label">Style Preference</span>
              <input
                className="profile-input"
                name="style_preference"
                value={form.style_preference}
                onChange={handleChange}
              />
            </label>
            <label className="profile-item">
              <span className="profile-label">Budget Range</span>
              <input
                className="profile-input"
                name="budget_range"
                value={form.budget_range}
                onChange={handleChange}
              />
            </label>
          </div>

          <label className="profile-item profile-bio">
            <span className="profile-label">Custom Idea</span>
            <textarea
              className="profile-input profile-textarea"
              name="bio"
              rows={4}
              value={form.bio}
              onChange={handleChange}
            />
          </label>

          <div className="profile-upload-row">
            <label className="profile-btn profile-upload-btn">
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                disabled={uploadingAvatar || saving}
                className="profile-hidden-input"
              />
              {uploadingAvatar ? "Uploading Avatar..." : "Change Avatar"}
            </label>
          </div>

          {error && <p className="profile-error">{error}</p>}
          {message && <p className="profile-success">{message}</p>}

          <div className="profile-actions">
            <button
              type="submit"
              className="profile-btn profile-save-btn"
              disabled={saving || uploadingAvatar}
            >
              {saving ? "Saving..." : "Save Profile"}
            </button>
            <Link to="/customize" className="profile-btn">
              Start Customize
            </Link>
          </div>
        </form>
      </div>

      {avatarZoomOpen && avatarUrl && (
        <div
          className="profile-avatar-modal"
          onClick={() => setAvatarZoomOpen(false)}
          role="presentation"
        >
          <img
            src={avatarUrl}
            alt={displayName}
            className="profile-avatar-modal-image"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            className="profile-avatar-modal-close"
            onClick={() => setAvatarZoomOpen(false)}
          >
            x
          </button>
        </div>
      )}
    </section>
  );
}
