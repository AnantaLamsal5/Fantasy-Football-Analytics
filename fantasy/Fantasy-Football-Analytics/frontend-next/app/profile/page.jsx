"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { changePassword, updateProfile, uploadProfilePicture } from "@/services/accountService";
import { API_BASE_URL } from "@/utils/constants";

export default function ProfilePage() {
  const { user, setAuthenticatedUser } = useAuth();
  const [form, setForm] = useState({ username: "", email: "" });
  const [loading, setLoading] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [profilePicture, setProfilePicture] = useState("");
  const [pictureFile, setPictureFile] = useState(null);
  const [pictureLoading, setPictureLoading] = useState(false);

  function imageUrl(path) {
    if (!path) return "";
    if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("data:")) return path;
    return `${API_BASE_URL}${path}`;
  }

  useEffect(() => {
    let nextForm = null;
    let nextPicture = "";
    if (user) {
      nextForm = { username: user.username || "", email: user.email || "" };
      nextPicture = user.profile_picture || "";
    } else if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("ff_user");
        if (stored) {
          const parsed = JSON.parse(stored);
          nextForm = { username: parsed.username || "", email: parsed.email || "" };
          nextPicture = parsed.profile_picture || "";
        }
      } catch (e) {
        console.warn("Failed to read user from localStorage", e);
      }
    }
    if (nextForm) {
      Promise.resolve().then(() => {
        setForm(nextForm);
        setProfilePicture(nextPicture);
      });
    }
  }, [user]);

  async function onSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const res = await updateProfile(form);
      if (res?.user) {
        setAuthenticatedUser(res.user);
        try {
          localStorage.setItem("ff_user", JSON.stringify(res.user));
        } catch (e) {}
        setMessage("Profile updated.");
      }
    } catch (err) {
      setError(err.message || "Failed to update profile.");
    } finally {
      setLoading(false);
    }
  }

  async function onPasswordSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const res = await changePassword(passwordForm);
      setPasswordForm({ currentPassword: "", newPassword: "" });
      setMessage(res?.detail || "Password updated.");
    } catch (err) {
      setError(err.message || "Failed to update password.");
    } finally {
      setLoading(false);
    }
  }

  function onPictureChange(e) {
    const file = e.target.files?.[0];
    setError("");
    setMessage("");
    if (!file) {
      setPictureFile(null);
      return;
    }
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) {
      setPictureFile(null);
      setError("Only JPG, JPEG, PNG, and WEBP images are allowed.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setPictureFile(null);
      setError("Profile picture must be 2MB or smaller.");
      return;
    }
    setPictureFile(file);
  }

  async function onPictureUpload(e) {
    e.preventDefault();
    if (!pictureFile) {
      setError("Choose a profile picture first.");
      return;
    }
    setPictureLoading(true);
    setError("");
    setMessage("");
    try {
      const res = await uploadProfilePicture(pictureFile);
      if (res?.user) {
        setAuthenticatedUser(res.user);
        localStorage.setItem("ff_user", JSON.stringify(res.user));
        setProfilePicture(res.user.profile_picture || res.profile_picture || "");
      }
      setPictureFile(null);
      setMessage(res?.detail || "Profile picture updated.");
    } catch (err) {
      setError(err.message || "Failed to upload profile picture.");
    } finally {
      setPictureLoading(false);
    }
  }

  return (
    <div className="container mx-auto p-6 md:p-10">
      <div className="card max-w-lg w-full mx-auto p-6">
        <h1 className="text-2xl font-bold mb-4">Your Profile</h1>
        <form onSubmit={onPictureUpload} className="space-y-4 mb-6 pb-6 border-b border-border">
          <div className="flex items-center gap-4">
            <div className="h-20 w-20 rounded-full bg-primary text-primary-foreground flex items-center justify-center overflow-hidden font-bold text-2xl">
              {profilePicture ? (
                <img src={imageUrl(profilePicture)} alt="Profile" className="h-full w-full object-cover" />
              ) : (
                form.username?.[0]?.toUpperCase() || "U"
              )}
            </div>
            <div className="flex-1">
              <label className="text-sm text-muted-foreground">Profile Picture</label>
              <input
                className="w-full mt-1 px-3 py-2 rounded-md border border-border"
                type="file"
                accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                onChange={onPictureChange}
              />
            </div>
          </div>
          <button className="btn-primary" disabled={pictureLoading || !pictureFile} type="submit">
            {pictureLoading ? "Uploading..." : "Upload Picture"}
          </button>
        </form>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="text-sm text-muted-foreground">Username</label>
            <input
              className="w-full mt-1 px-3 py-2 rounded-md border border-border"
              value={form.username}
              onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Email</label>
            <input
              className="w-full mt-1 px-3 py-2 rounded-md border border-border"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
            />
          </div>
          <div className="flex items-center gap-3">
            <button className="btn-primary" disabled={loading} type="submit">
              {loading ? "Saving..." : "Save"}
            </button>
            {message && <p className="text-sm text-green-400">{message}</p>}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        </form>
        <form onSubmit={onPasswordSubmit} className="space-y-4 mt-6 pt-6 border-t border-border">
          <h2 className="text-lg font-bold">Change Password</h2>
          <div>
            <label className="text-sm text-muted-foreground">Current Password</label>
            <input
              className="w-full mt-1 px-3 py-2 rounded-md border border-border"
              type="password"
              value={passwordForm.currentPassword}
              onChange={(e) => setPasswordForm((p) => ({ ...p, currentPassword: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">New Password</label>
            <input
              className="w-full mt-1 px-3 py-2 rounded-md border border-border"
              type="password"
              value={passwordForm.newPassword}
              onChange={(e) => setPasswordForm((p) => ({ ...p, newPassword: e.target.value }))}
            />
          </div>
          <button className="btn-primary" disabled={loading} type="submit">
            {loading ? "Saving..." : "Update Password"}
          </button>
        </form>
      </div>
    </div>
  );
}
