"use client";

import { PageHeading } from "@/components/shared-ui/page-heading";
import { useEffect, useState, useRef, useCallback } from "react";
import {
  User,
  Mail,
  Phone,
  Shield,
  Check,
  X,
  Edit3,
  Clock,
  Activity,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { Spinner } from '@/components/ui/spinner'
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { updateUser } from "@/lib/actions/users/user.actions";
import { updateConsumer } from "@/lib/actions/consumer/consumer.actions";
import { getUserProfile, UserProfile } from "@/lib/actions/profile.actions";

// ─── Helpers ──────────────────────────────────────────────────────────────────
// DB stores the full number with country code, e.g. "+639171234567".
// The edit UI should only ever show/edit the 10 local digits after the "63".
const stripCountryCode = (num?: string | null) =>
  (num ?? "").replace(/^\+?63/, "");

const withCountryCode = (digits: string): string | undefined =>
  digits ? `+63${digits}` : undefined;

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({
  message,
  type,
  onClose,
}: {
  message: string;
  type: "success" | "error";
  onClose: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-md px-4 py-3 shadow-sm border text-sm font-medium
        ${
          type === "success"
            ? "bg-white border-emerald-200 text-emerald-700"
            : "bg-white border-red-200 text-red-700"
        }`}
    >
      {type === "success" ? (
        <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
      ) : (
        <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
      )}
      {message}
      <button
        onClick={onClose}
        className="ml-1 text-slate-400 hover:text-slate-600 transition-colors"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ─── EditableField ────────────────────────────────────────────────────────────
function EditableField({
  label,
  value,
  icon: Icon,
  editing,
  onChange,
  placeholder,
  readOnly,
  badge,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  editing: boolean;
  onChange?: (v: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  badge?: string;
}) {
  const isEditing = editing && !readOnly;

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1.5">
        {label}
      </p>
      {isEditing ? (
        <div className="relative flex items-center">
          <Icon className="absolute left-3 h-4 w-4 text-purple-400 pointer-events-none" />
          <input
            type="text"
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            placeholder={placeholder}
            className="w-full rounded-md border border-purple-300 bg-purple-50/50 pl-9 pr-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition-all"
          />
        </div>
      ) : (
        <div className="flex items-center gap-2.5 rounded-md border border-slate-100 bg-slate-50 px-3 py-2.5">
          <Icon className="h-4 w-4 text-slate-400 flex-shrink-0" />
          <span className="text-sm text-slate-700 font-medium truncate flex-1">
            {value || (
              <span className="text-slate-400 italic font-normal">Not set</span>
            )}
          </span>
          {badge && (
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 bg-slate-200 px-1.5 py-0.5 rounded flex-shrink-0">
              {badge}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── PhoneField ───────────────────────────────────────────────────────────────
// `value` here is ALWAYS the local digits only (no +63) — the parent is
// responsible for stripping/re-attaching the country code.
function PhoneField({
  label,
  value,
  editing,
  onChange,
  placeholder,
  readOnly,
}: {
  label: string;
  value: string; // local digits only, e.g. "9171234567"
  editing: boolean;
  onChange?: (digits: string) => void;
  placeholder?: string;
  readOnly?: boolean;
}) {
  const isEditing = editing && !readOnly;

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-widest text-foreground/80 mb-1.5">
        {label}
      </p>
      {isEditing ? (
        <InputGroup className="h-9 overflow-hidden rounded-md border-2 border-slate-200 bg-background dark:bg-background">
          <InputGroupAddon align="inline-start" className="h-full self-stretch border-r border-slate-200 bg-muted px-3 text-[12.5px] font-semibold text-foreground">
            +63
          </InputGroupAddon>
          <InputGroupInput
            type="tel"
            inputMode="numeric"
            value={value}
            onChange={(e) =>
              onChange?.(e.target.value.replace(/\D/g, "").slice(0, 10))
            }
            placeholder={placeholder}
            maxLength={10}
            className="h-9 min-w-0 px-3 text-[12.5px] text-foreground"
          />
        </InputGroup>
      ) : (
        <div className="flex items-center gap-2.5 rounded-md border border-slate-100 bg-slate-50 px-3 py-2.5">
          <Phone className="h-4 w-4 text-slate-400 flex-shrink-0" />
          <span className="text-sm text-slate-700 font-medium truncate flex-1">
            {value ? (
              `+63 ${value}`
            ) : (
              <span className="text-slate-400 italic font-normal">Not set</span>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function SharedProfilePage() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  // contact_number in form state is ALWAYS local digits only (no +63).
  const [form, setForm] = useState({
    account_name: "",
    first_name: "",
    middle_name: "",
    last_name: "",
    contact_number: "",
  });

  const hasFetched = useRef(false);

  // ── Fetch via server action ────────────────────────────────────────────────
  const fetchUser = useCallback(async () => {
    if (hasFetched.current) return;
    hasFetched.current = true;

    try {
      const profile = await getUserProfile();
      if (!profile) {
        setLoading(false);
        return;
      }
      setUser(profile);
      setForm({
        account_name:   profile.account_name,
        first_name:     profile.first_name ?? "",
        middle_name:    profile.middle_name ?? "",
        last_name:      profile.last_name ?? "",
        contact_number: stripCountryCode(profile.contact_number),
      });
    } catch (err) {
      console.error("Failed to load profile:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const getInitials = () => {
    if (!user) return "?";
    const parts = user.account_name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    if (parts.length === 2) return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
    return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
  };

  const roleName = user?.role?.role_name ?? "";
  const fullName = user?.account_name ?? "";
  const isStaff = user?.userType === "staff";
  const canEdit = isStaff;

  const roleBadgeClass =
    roleName.toLowerCase() === "admin"
      ? "bg-purple-100 text-purple-700 ring-purple-200"
      : roleName.toLowerCase() === "consumer"
      ? "bg-teal-100 text-teal-700 ring-teal-200"
      : "bg-blue-100 text-blue-700 ring-blue-200";

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return "Never";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // ── Cancel ─────────────────────────────────────────────────────────────────
  const handleCancel = () => {
    setEditing(false);
    if (user) {
      setForm({
        account_name:   user.account_name,
        first_name:     user.first_name ?? "",
        middle_name:    user.middle_name ?? "",
        last_name:      user.last_name ?? "",
        contact_number: stripCountryCode(user.contact_number),
      });
    }
  };

  // ── Save — dispatches to the right action based on userType ───────────────
  const handleSave = async () => {
    if (!user || !canEdit) return;

    const localDigits = form.contact_number.trim();
    if (user.userType === "consumer") {
      if (!/^\d{10}$/.test(localDigits)) {
        setToast({
          message: "Contact number is required (exactly 10 digits).",
          type: "error",
        });
        return;
      }
    }

    setSaving(true);
    try {
      let result;
      const contact_number = withCountryCode(localDigits);

      if (user.userType === "consumer") {
        result = await updateConsumer(user.user_id, {
          account_name: form.account_name,
          contact_number: contact_number!,
        });
      } else {
        result = await updateUser(user.user_id, {
          first_name:  form.first_name,
          middle_name: form.middle_name,
          last_name:   form.last_name,
          contact_number,
        });
      }

      if (result.status === "success" && result.data) {
        setUser((prev) =>
          prev
            ? {
                ...prev,
                account_name:
                  user.userType === "consumer"
                    ? result.data.account_name
                    : `${result.data.first_name} ${result.data.last_name}`.trim(),
                first_name:     result.data.first_name ?? prev.first_name,
                middle_name:    result.data.middle_name ?? prev.middle_name,
                last_name:      result.data.last_name ?? prev.last_name,
                contact_number: result.data.contact_number ?? prev.contact_number,
                role: Array.isArray(result.data.role)
                  ? (result.data.role[0] ?? prev.role)
                  : result.data.role ?? prev.role,
              }
            : prev,
        );
        setForm((f) => ({
          ...f,
          contact_number: stripCountryCode(result.data.contact_number ?? contact_number),
        }));
        setEditing(false);
        setToast({ message: "Profile updated successfully!", type: "success" });
      } else {
        setToast({
          message: result.message ?? "Update failed.",
          type: "error",
        });
      }
    } catch {
      setToast({ message: "Something went wrong.", type: "error" });
    } finally {
      setSaving(false);
    }
  };

  // ── Loading / Not found ────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-full min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
          <p className="text-sm text-slate-500">Loading profile…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-full min-h-[60vh] items-center justify-center">
        <p className="text-slate-500">User not found.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/60 p-4 lg:p-8">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <div className="mx-auto max-w-3xl space-y-5">

        <PageHeading
          title="My Profile"
          description="Manage your personal information and account settings"
        />
        <div className="flex items-center justify-end">
          {canEdit && (
            !editing ? (
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-purple-300 hover:bg-purple-50 hover:text-purple-700 transition-all duration-150"
              >
                <Edit3 className="h-4 w-4" />
                Edit Profile
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCancel}
                  className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-all"
                >
                  <X className="h-4 w-4" /> Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1.5 rounded-md border border-purple-600 bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-60 transition-all"
                >
                  {saving ? (
                    <Spinner />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  Save Changes
                </button>
              </div>
            )
          )}
        </div>

        {/* Hero Card */}
        <div className="relative overflow-hidden rounded-md border border-slate-200 bg-white">
          <div className="h-28 bg-gradient-to-br from-purple-600 via-purple-700 to-purple-900 relative overflow-hidden">
            <div className="absolute -top-6 -right-6 h-32 w-32 rounded-full bg-white/5" />
            <div className="absolute -bottom-4 right-16 h-20 w-20 rounded-full bg-white/5" />
            <div className="absolute top-4 left-1/3 h-14 w-14 rounded-full bg-white/5" />
          </div>

          <div className="px-6 pb-6">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 -mt-12 mb-4">
              <div className="relative w-fit">
                <div className="h-24 w-24 rounded-md ring-4 ring-white border border-slate-200 overflow-hidden">
                  <Avatar className="h-full w-full rounded-md">
                    <AvatarImage
                      src={user.profile_image ?? undefined}
                      alt={fullName}
                      className="object-cover"
                    />
                    <AvatarFallback className="h-full w-full rounded-md bg-gradient-to-br from-purple-500 to-purple-700 text-white text-2xl font-bold">
                      {getInitials()}
                    </AvatarFallback>
                  </Avatar>
                </div>
                <span className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-emerald-400 ring-2 ring-white" />
              </div>

              <div className="flex-1 sm:pb-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-bold text-slate-900">{fullName}</h2>
                  {roleName && (
                    <span
                      className={`inline-flex items-center text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md ring-1 ${roleBadgeClass}`}
                    >
                      {roleName}
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-500 mt-0.5">{user.email}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[
                {
                  icon: Activity,
                  label: "Status",
                  value: user.is_active ? "Active" : "Inactive",
                  valueClass: user.is_active ? "text-emerald-600" : "text-red-500",
                },
                {
                  icon: Clock,
                  label: "Last Active",
                  value: formatDate(user.last_active),
                  valueClass: "text-slate-700",
                },
                {
                  icon: Shield,
                  label: "Member Since",
                  value: formatDate(user.created_at),
                  valueClass: "text-slate-700",
                },
              ].map(({ icon: Icon, label, value, valueClass }) => (
                <div
                  key={label}
                  className="rounded-md bg-slate-50 border border-slate-100 px-3 py-2.5 flex flex-col gap-1"
                >
                  <div className="flex items-center gap-1.5 text-slate-400">
                    <Icon className="h-3.5 w-3.5" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider">
                      {label}
                    </span>
                  </div>
                  <p className={`text-xs font-semibold leading-tight ${valueClass}`}>
                    {value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Personal Info */}
        <div className="rounded-md border border-slate-200 bg-white p-6">
          <div className="flex items-center gap-2 mb-5">
            <div className="h-7 w-7 rounded-md bg-purple-100 flex items-center justify-center">
              <User className="h-3.5 w-3.5 text-purple-600" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">
              Personal Information
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {isStaff ? (
              <>
                <EditableField
                  label="First Name"
                  value={editing ? form.first_name : (user.first_name ?? "")}
                  icon={User}
                  editing={editing && canEdit}
                  onChange={(v) => setForm((f) => ({ ...f, first_name: v }))}
                  placeholder="e.g., Juan"
                />
                <EditableField
                  label="Last Name"
                  value={editing ? form.last_name : (user.last_name ?? "")}
                  icon={User}
                  editing={editing && canEdit}
                  onChange={(v) => setForm((f) => ({ ...f, last_name: v }))}
                  placeholder="e.g., Dela Cruz"
                />
                <div className="sm:col-span-2">
                  <EditableField
                    label="Middle Name"
                    value={editing ? form.middle_name : (user.middle_name ?? "")}
                    icon={User}
                    editing={editing && canEdit}
                    onChange={(v) => setForm((f) => ({ ...f, middle_name: v }))}
                    placeholder="e.g., Santos (optional)"
                  />
                </div>
              </>
            ) : (
              <div className="sm:col-span-2">
                <EditableField
                  label="Account Name"
                  value={editing ? form.account_name : user.account_name}
                  icon={User}
                  editing={editing && canEdit}
                  readOnly={!canEdit}
                  onChange={(v) => setForm((f) => ({ ...f, account_name: v }))}
                  placeholder="Full name (e.g., Juan Dela Cruz)"
                />
              </div>
            )}
            <div className="sm:col-span-2">
              <PhoneField
                label={user.userType === "consumer" ? "Contact Number *" : "Contact Number"}
                value={editing ? form.contact_number : stripCountryCode(user.contact_number)}
                editing={editing && canEdit}
                readOnly={!canEdit}
                onChange={(digits) => setForm((f) => ({ ...f, contact_number: digits }))}
                placeholder="9171234567"
              />
            </div>
            <div className="sm:col-span-2">
              <EditableField
                label="Email Address"
                value={user.email}
                icon={Mail}
                editing={editing}
                readOnly
                badge="Read-only"
              />
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}