// app/checkout/customer-details.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Edit, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

interface Customer {
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  address: string | null;
}

interface Props {
  customer: Customer;
}

/* --- helpers: detect proxy base if under /apps/checkout --- */
function proxyPrefix(): string | null {
  if (typeof window === "undefined") return null;
  const parts = window.location.pathname.split("/").filter(Boolean);
  return parts[0] === "apps" && parts[1] ? `/${parts.slice(0, 2).join("/")}` : null;
}
function apiBase(): string {
  const pp = proxyPrefix();
  return pp ?? "/api/checkout";
}

/* session id the API needs for auth */
function storageKey(): string {
  if (typeof window === "undefined") return "owr:checkout:sid";
  const shop = (window as any).__CHECKOUT_SESSION__?.shop || window.location.host;
  return `owr:checkout:sid:${shop}`;
}
function getEffectiveSessionId(): string | null {
  if (typeof window === "undefined") return null;
  const boot = (window as any).__CHECKOUT_SESSION__?.id as string | undefined;
  if (boot && String(boot).trim()) return String(boot);
  const key = storageKey();
  return (
    window.sessionStorage.getItem(key) ||
    window.localStorage.getItem(key) ||
    null
  );
}

export default function CustomerDetails({ customer }: Props) {
  const { toast } = useToast();

  // derive once
  const sessionId = useMemo(getEffectiveSessionId, []);
  const initialPhone = customer?.phone ?? "";

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  // make the initial paint smooth (show skeleton for a blink)
  const [isLoading, setIsLoading] = useState(true);

  // form state
  const [formFirstName, setFormFirstName] = useState(customer?.first_name ?? "");
  const [formLastName, setFormLastName] = useState(customer?.last_name ?? "");
  const [formEmail, setFormEmail] = useState(customer?.email ?? "");
  const [formAddress, setFormAddress] = useState(customer?.address ?? "");

  // display phone as provided (already verified upstream)
  const [verifiedPhone, setVerifiedPhone] = useState(initialPhone || "");

  // keep originals for cancel
  const [originalValues, setOriginalValues] = useState({
    first_name: customer?.first_name ?? "",
    last_name: customer?.last_name ?? "",
    email: customer?.email ?? "",
    address: customer?.address ?? "",
  });

  // first paint → populate from props, stop skeleton
  useEffect(() => {
    setFormFirstName(customer?.first_name ?? "");
    setFormLastName(customer?.last_name ?? "");
    setFormEmail(customer?.email ?? "");
    setFormAddress(customer?.address ?? "");
    setVerifiedPhone(customer?.phone ?? "");
    setOriginalValues({
      first_name: customer?.first_name ?? "",
      last_name: customer?.last_name ?? "",
      email: customer?.email ?? "",
      address: customer?.address ?? "",
    });
    setIsLoading(false);
  }, [customer]);

  const handleSave = async () => {
    if (!sessionId) {
      toast({
        title: "Missing session",
        description: "Reload the page and start checkout again.",
        variant: "destructive",
      });
      return;
    }
    if (!verifiedPhone) {
      toast({
        title: "Missing phone",
        description: "Verified phone number is required.",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch(`${apiBase()}/customer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // new contract: send sessionId & phone in body
        body: JSON.stringify({
          sessionId,
          phone: verifiedPhone,
          first_name: formFirstName,
          last_name: formLastName,
          email: formEmail,
          address: formAddress,
        }),
      });

      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) throw new Error(data?.error || "Failed to save details");

      toast({ title: "Details Updated", description: "Your shipping information has been saved." });
      setOriginalValues({ first_name: formFirstName, last_name: formLastName, email: formEmail, address: formAddress });
      setIsEditing(false);
    } catch (err) {
      toast({
        title: "Save Failed",
        description: err instanceof Error ? err.message : "An unknown error occurred.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setFormFirstName(originalValues.first_name);
    setFormLastName(originalValues.last_name);
    setFormEmail(originalValues.email);
    setFormAddress(originalValues.address);
    setIsEditing(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Shipping Details</h3>
        {!isEditing && !isLoading && (
          <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
            <Edit className="mr-2 h-4 w-4" />
            Edit
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : isEditing ? (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="grid gap-2">
              <Label htmlFor="name">First Name</Label>
              <Input
                id="name"
                value={formFirstName}
                onChange={(e) => setFormFirstName(e.target.value)}
                disabled={isSaving}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="name">Last Name</Label>
              <Input
                id="name"
                value={formLastName}
                onChange={(e) => setFormLastName(e.target.value)}
                disabled={isSaving}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                disabled={isSaving}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="address">Full Address</Label>
              <Input
                id="address"
                value={formAddress}
                onChange={(e) => setFormAddress(e.target.value)}
                disabled={isSaving}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={handleCancel} disabled={isSaving}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="text-sm text-muted-foreground">
          <p className="text-foreground font-medium">{formFirstName || "No first name provided"}</p>
          <p className="text-foreground font-medium">{formLastName || "No last name provided"}</p>
          <p>{formEmail || "No email provided"}</p>
          <p>{verifiedPhone || "No phone provided"}</p>
          <p>{formAddress || "No address provided"}</p>
        </div>
      )}
    </div>
  );
}
