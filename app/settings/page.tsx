"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import Button from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn-default/input";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import {
  Check,
  AlertCircle,
  Mail,
  Bell,
  Flame,
  RefreshCw,
  CheckCircle2,
  Clock,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { Connector } from "@/components/shared/layout/curvy-rect";

type FirecrawlKeyStatus = "pending" | "active" | "fallback" | "failed" | "invalid";

interface FirecrawlInfo {
  status: FirecrawlKeyStatus;
  hasKey: boolean;
  createdAt: string | null;
  error: string | null;
}

export default function SettingsPage() {
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">(
    "idle",
  );
  const [sendingTest, setSendingTest] = useState(false);
  const [testStatus, setTestStatus] = useState<"idle" | "success" | "error">(
    "idle",
  );
  const [testMessage, setTestMessage] = useState("");

  // Firecrawl state
  const [firecrawlInfo, setFirecrawlInfo] = useState<FirecrawlInfo | null>(null);
  const [regeneratingKey, setRegeneratingKey] = useState(false);
  const [regenerateMessage, setRegenerateMessage] = useState("");

  // Load current preferences and Firecrawl info
  useEffect(() => {
    const loadPreferences = async () => {
      if (!user?.id) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const { data } = await supabase
          .from("user_preferences")
          .select("notification_email, firecrawl_api_key, firecrawl_key_status, firecrawl_key_created_at, firecrawl_key_error")
          .eq("user_id", user.id)
          .maybeSingle();

        if (data) {
          setEmail(data.notification_email || "");
          setFirecrawlInfo({
            status: data.firecrawl_key_status || "pending",
            hasKey: !!data.firecrawl_api_key,
            createdAt: data.firecrawl_key_created_at,
            error: data.firecrawl_key_error,
          });
        } else {
          // No preferences yet - set defaults
          setFirecrawlInfo({
            status: "pending",
            hasKey: false,
            createdAt: null,
            error: null,
          });
        }
      } catch {
        // Silently handle any exceptions
      }
      setLoading(false);
    };

    loadPreferences();
  }, [user?.id]);

  const savePreferences = async () => {
    if (!user?.id) return;

    setSaving(true);
    setSaveStatus("idle");

    // Validate email if provided
    if (email && !isValidEmail(email)) {
      setSaveStatus("error");
      setSaving(false);
      return;
    }

    try {
      const { error } = await supabase.from("user_preferences").upsert({
        user_id: user.id,
        notification_email: email || null,
      }, {
        onConflict: "user_id",
      });

      if (error) {
        setSaveStatus("error");
      } else {
        setSaveStatus("success");
        setTimeout(() => setSaveStatus("idle"), 3000);
      }
    } catch {
      setSaveStatus("error");
    }

    setSaving(false);
  };

  const isValidEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const sendTestEmail = async () => {
    setSendingTest(true);
    setTestStatus("idle");
    setTestMessage("");

    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const response = await fetch(
        `${supabaseUrl}/functions/v1/send-test-email`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      const data = await response.json();

      if (!response.ok) {
        setTestStatus("error");
        setTestMessage(data.error || "Failed to send test email");
      } else {
        setTestStatus("success");
        setTestMessage("Test email sent! Check your inbox.");
        setTimeout(() => {
          setTestStatus("idle");
          setTestMessage("");
        }, 5000);
      }
    } catch (error) {
      setTestStatus("error");
      setTestMessage(
        error instanceof Error ? error.message : "Failed to send test email",
      );
    }

    setSendingTest(false);
  };

  const regenerateFirecrawlKey = async () => {
    if (!user?.id || !user?.email) return;

    setRegeneratingKey(true);
    setRegenerateMessage("");

    try {
      const response = await fetch("/api/firecrawl/regenerate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();

      if (!response.ok) {
        setRegenerateMessage(data.error || "Failed to regenerate key");
      } else {
        setRegenerateMessage("API key regenerated successfully!");
        // Refresh the Firecrawl info
        setFirecrawlInfo({
          status: "active",
          hasKey: true,
          createdAt: new Date().toISOString(),
          error: null,
        });
        setTimeout(() => setRegenerateMessage(""), 5000);
      }
    } catch (error) {
      setRegenerateMessage(
        error instanceof Error ? error.message : "Failed to regenerate key",
      );
    }

    setRegeneratingKey(false);
  };

  const getStatusDisplay = (status: FirecrawlKeyStatus) => {
    switch (status) {
      case "active":
        return {
          icon: <CheckCircle2 className="w-16 h-16" />,
          text: "Connected",
          color: "text-accent-forest",
          bgColor: "bg-accent-forest/10",
          borderColor: "border-accent-forest/20",
        };
      case "pending":
        return {
          icon: <Clock className="w-16 h-16" />,
          text: "Pending",
          color: "text-accent-honey",
          bgColor: "bg-accent-honey/10",
          borderColor: "border-accent-honey/20",
        };
      case "fallback":
        return {
          icon: <AlertTriangle className="w-16 h-16" />,
          text: "Using Shared Key",
          color: "text-accent-honey",
          bgColor: "bg-accent-honey/10",
          borderColor: "border-accent-honey/20",
        };
      case "failed":
      case "invalid":
        return {
          icon: <XCircle className="w-16 h-16" />,
          text: status === "failed" ? "Setup Failed" : "Key Invalid",
          color: "text-accent-crimson",
          bgColor: "bg-accent-crimson/10",
          borderColor: "border-accent-crimson/20",
        };
      default:
        return {
          icon: <Clock className="w-16 h-16" />,
          text: "Unknown",
          color: "text-black-alpha-48",
          bgColor: "bg-black-alpha-4",
          borderColor: "border-border-muted",
        };
    }
  };

  return (
    <div className="min-h-screen bg-background-base">
      {/* Top border line */}
      <div className="h-1 w-full bg-border-faint" />

      <div className="container relative">
        {/* Corner connectors */}
        <Connector className="absolute -top-10 -left-[10.5px]" />
        <Connector className="absolute -top-10 -right-[10.5px]" />

        {/* Header Section */}
        <div className="py-48 lg:py-64 relative">
          {/* Bottom border */}
          <div className="h-1 bottom-0 absolute w-screen left-[calc(50%-50vw)] bg-border-faint" />
          <Connector className="absolute -bottom-10 -left-[10.5px]" />
          <Connector className="absolute -bottom-10 -right-[10.5px]" />

          <div className="px-24">
            <h1 className="text-title-h3 lg:text-title-h2 font-semibold text-accent-black">
              Settings
            </h1>
            <p className="text-body-large text-black-alpha-56 mt-4">
              Configure your account preferences
            </p>
          </div>
        </div>

        {/* Firecrawl Integration Section */}
        <div className="py-24 lg:py-32 relative">
          <div className="h-1 bottom-0 absolute w-screen left-[calc(50%-50vw)] bg-border-faint" />

          <div className="flex items-center gap-16">
            <div className="w-2 h-16 bg-heat-100" />
            <div className="flex gap-12 items-center text-mono-x-small text-black-alpha-32 font-mono">
              <Flame className="w-14 h-14" />
              <span className="uppercase tracking-wider">Firecrawl Integration</span>
            </div>
          </div>
        </div>

        {/* Firecrawl Content */}
        <div className="pb-32">
          {loading ? (
            <div className="bg-white rounded-12 border border-border-faint p-24 max-w-600">
              <div className="space-y-16">
                <Skeleton className="h-16 w-128" />
                <Skeleton className="h-40 w-full rounded-8" />
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-12 border border-border-faint overflow-hidden max-w-600">
              <div className="p-24 space-y-16">
                <div>
                  <h3 className="text-label-medium font-semibold text-accent-black mb-8">
                    Web Scraping Connection
                  </h3>
                  <p className="text-body-small text-black-alpha-48 mb-16">
                    Your scouts use Firecrawl to search and scrape web content. Each account has a dedicated API key for tracking and reliability.
                  </p>

                  {/* Status Badge */}
                  {firecrawlInfo && (
                    <div className="space-y-12">
                      <div className="flex items-center gap-12">
                        <span className="text-body-small text-black-alpha-56">Status:</span>
                        {(() => {
                          const display = getStatusDisplay(firecrawlInfo.status);
                          return (
                            <div
                              className={`inline-flex items-center gap-8 px-12 py-6 rounded-6 ${display.bgColor} ${display.color} border ${display.borderColor}`}
                            >
                              {display.icon}
                              <span className="text-label-small font-medium">
                                {display.text}
                              </span>
                            </div>
                          );
                        })()}
                      </div>

                      {/* Created At */}
                      {firecrawlInfo.createdAt && firecrawlInfo.status === "active" && (
                        <p className="text-body-small text-black-alpha-48">
                          Connected since {new Date(firecrawlInfo.createdAt).toLocaleDateString()}
                        </p>
                      )}

                      {/* Error Message */}
                      {firecrawlInfo.error && (firecrawlInfo.status === "failed" || firecrawlInfo.status === "invalid") && (
                        <div className="flex items-start gap-8 p-12 rounded-8 bg-accent-crimson/10 border border-accent-crimson/20">
                          <AlertCircle className="w-16 h-16 text-accent-crimson mt-2 shrink-0" />
                          <span className="text-body-small text-accent-crimson">
                            {firecrawlInfo.error}
                          </span>
                        </div>
                      )}

                      {/* Regenerate Button - show for failed, invalid, or pending states */}
                      {(firecrawlInfo.status === "failed" ||
                        firecrawlInfo.status === "invalid" ||
                        firecrawlInfo.status === "pending") && (
                        <div className="pt-8">
                          <Button
                            onClick={regenerateFirecrawlKey}
                            disabled={regeneratingKey}
                            variant="secondary"
                            className="flex items-center gap-8"
                          >
                            {regeneratingKey ? (
                              <>
                                <div className="animate-spin rounded-full h-16 w-16 border-2 border-black-alpha-32 border-t-transparent" />
                                Connecting...
                              </>
                            ) : (
                              <>
                                <RefreshCw className="w-16 h-16" />
                                {firecrawlInfo.status === "pending" ? "Connect Now" : "Reconnect"}
                              </>
                            )}
                          </Button>

                          {regenerateMessage && (
                            <div
                              className={`flex items-start gap-8 mt-12 p-12 rounded-8 ${
                                regenerateMessage.includes("success")
                                  ? "bg-accent-forest/10 text-accent-forest border border-accent-forest/20"
                                  : "bg-accent-crimson/10 text-accent-crimson border border-accent-crimson/20"
                              }`}
                            >
                              {regenerateMessage.includes("success") ? (
                                <Check className="w-16 h-16 mt-2 shrink-0" />
                              ) : (
                                <AlertCircle className="w-16 h-16 mt-2 shrink-0" />
                              )}
                              <span className="text-body-small">{regenerateMessage}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Info Footer */}
              <div className="px-24 py-16 border-t border-border-faint bg-background-base">
                <p className="text-mono-x-small font-mono text-black-alpha-32">
                  Powered by Firecrawl - Web scraping for AI applications
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Notifications Section Label */}
        <div className="py-24 lg:py-32 relative">
          <div className="h-1 bottom-0 absolute w-screen left-[calc(50%-50vw)] bg-border-faint" />

          <div className="flex items-center gap-16">
            <div className="w-2 h-16 bg-heat-100" />
            <div className="flex gap-12 items-center text-mono-x-small text-black-alpha-32 font-mono">
              <Bell className="w-14 h-14" />
              <span className="uppercase tracking-wider">Notifications</span>
            </div>
          </div>
        </div>

        {/* Notifications Content */}
        <div className="pb-64">
          {loading ? (
            <div className="bg-white rounded-12 border border-border-faint p-24 max-w-600">
              <div className="space-y-24">
                <div>
                  <Skeleton className="h-16 w-128 mb-12" />
                  <Skeleton className="h-44 w-full rounded-8" />
                  <Skeleton className="h-14 w-256 mt-8" />
                </div>
                <Skeleton className="h-40 w-120 rounded-8" />
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-12 border border-border-faint overflow-hidden max-w-600">
              <div className="p-24 space-y-24">
                {/* Email Notification Section */}
                <div>
                  <label
                    htmlFor="email"
                    className="block text-label-medium font-semibold text-accent-black mb-8"
                  >
                    Notification Email
                  </label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full"
                    disabled={saving}
                  />
                  <p className="text-body-small text-black-alpha-48 mt-8">
                    Receive email notifications when your scouts find new
                    results
                  </p>

                  {/* Test Email Button */}
                  {email && isValidEmail(email) && (
                    <div className="mt-16">
                      <Button
                        onClick={sendTestEmail}
                        disabled={sendingTest}
                        variant="secondary"
                        className="flex items-center gap-8"
                      >
                        {sendingTest ? (
                          <>
                            <div className="animate-spin rounded-full h-16 w-16 border-2 border-black-alpha-32 border-t-transparent" />
                            Sending...
                          </>
                        ) : (
                          <>
                            <Mail className="w-16 h-16" />
                            Send Test Email
                          </>
                        )}
                      </Button>

                      {testMessage && (
                        <div
                          className={`flex items-start gap-8 mt-12 p-12 rounded-8 ${
                            testStatus === "success"
                              ? "bg-accent-forest/10 text-accent-forest border border-accent-forest/20"
                              : "bg-accent-crimson/10 text-accent-crimson border border-accent-crimson/20"
                          }`}
                        >
                          {testStatus === "success" ? (
                            <Check className="w-16 h-16 mt-2 shrink-0" />
                          ) : (
                            <AlertCircle className="w-16 h-16 mt-2 shrink-0" />
                          )}
                          <span className="text-body-small leading-relaxed">
                            {testMessage}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Save Button */}
                <div className="flex items-center gap-12">
                  <Button
                    onClick={savePreferences}
                    disabled={saving}
                    className="flex items-center gap-8"
                  >
                    {saving ? (
                      <>
                        <div className="animate-spin rounded-full h-16 w-16 border-2 border-white border-t-transparent" />
                        Saving...
                      </>
                    ) : (
                      "Save Preferences"
                    )}
                  </Button>

                  {saveStatus === "success" && (
                    <div className="flex items-center gap-8 text-accent-forest">
                      <Check className="w-16 h-16" />
                      <span className="text-body-small font-medium">
                        Saved!
                      </span>
                    </div>
                  )}

                  {saveStatus === "error" && (
                    <div className="flex items-center gap-8 text-accent-crimson">
                      <AlertCircle className="w-16 h-16" />
                      <span className="text-body-small font-medium">
                        {email && !isValidEmail(email)
                          ? "Please enter a valid email"
                          : "Failed to save"}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Future Settings Placeholder */}
              <div className="px-24 py-16 border-t border-border-faint bg-background-base">
                <p className="text-mono-x-small font-mono text-black-alpha-32">
                  More notification options (SMS, Slack, Discord) coming soon...
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
