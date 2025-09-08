// app/checkout/customer-details.tsx
"use client";

import React, { useEffect, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Edit, Loader2, PlusCircle, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export interface CustomerDetail {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  shipping_address: string;
  billing_address?: string;
}

interface Props {
  initialDetails: CustomerDetail[];
  verifiedPhone: string;
  sessionId: string;
}

/* --- helpers --- */
const apiBase = () => {
  if (typeof window === "undefined") return "/api/proxy/checkout";
  const parts = window.location.pathname.split("/").filter(Boolean);
  return parts[0] === "apps" && parts[1]
    ? `/${parts.slice(0, 2).join("/")}`
    : "/api/proxy/checkout";
};

const initialFormState: Omit<CustomerDetail, "id"> = {
  name: "",
  email: "",
  phone: "",
  shipping_address: "",
  billing_address: "",
};

export default function CustomerDetails({ initialDetails, verifiedPhone, sessionId }: Props) {
  const { toast } = useToast();

  const [details, setDetails] = useState<CustomerDetail[]>(initialDetails);
  const [selectedDetailId, setSelectedDetailId] = useState<string | null>(
    initialDetails[0]?.id ?? null
  );

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingDetail, setEditingDetail] = useState<CustomerDetail | null>(null);
  const [formState, setFormState] = useState(initialFormState);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch initial details
  useEffect(() => {
    const fetchDetails = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(
          `${apiBase()}/customer?sessionId=${sessionId}&phone=${verifiedPhone}`
        );
        const data = await res.json();
        if (res.ok && data.ok) {
          setDetails(data.details);
          if (data.details.length > 0) {
            setSelectedDetailId(data.details[0].id);
          }
        } else {
          throw new Error(data.error || "Failed to fetch details");
        }
      } catch (err) {
        toast({
          title: "Error",
          description: err instanceof Error ? err.message : "Could not load your details.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };
    fetchDetails();
  }, [sessionId, verifiedPhone, toast]);

  const handleApiCall = async (action: "add" | "update" | "delete", payload: any) => {
    setIsSaving(true);
    try {
      const res = await fetch(`${apiBase()}/customer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, phone: verifiedPhone, action, payload }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "An API error occurred");
      return data;
    } catch (err) {
      toast({
        title: "Operation Failed",
        description: err instanceof Error ? err.message : "An unknown error occurred.",
        variant: "destructive",
      });
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  const handleFormSubmit = async () => {
    const action = editingDetail ? "update" : "add";
    const payload = editingDetail ? { ...formState, id: editingDetail.id } : formState;
    const data = await handleApiCall(action, payload);

    if (data && data.ok) {
      toast({ title: `Address ${action === 'add' ? 'Added' : 'Updated'}` });
      if (action === 'add') {
        const newDetails = [...details, data.newDetail];
        setDetails(newDetails);
        setSelectedDetailId(data.newDetail.id);
      } else {
        const updatedDetails = details.map((d) => (d.id === payload.id ? { ...d, ...payload } : d));
        setDetails(updatedDetails);
      }
      setIsFormOpen(false);
    }
  };

  const handleDelete = async (detailId: string) => {
    const data = await handleApiCall("delete", { id: detailId });
    if (data && data.ok) {
      toast({ title: "Address Deleted" });
      const newDetails = details.filter((d) => d.id !== detailId);
      setDetails(newDetails);
      if (selectedDetailId === detailId) {
        setSelectedDetailId(newDetails[0]?.id ?? null);
      }
    }
  };

  const openFormForEdit = (detail: CustomerDetail) => {
    setEditingDetail(detail);
    setFormState(detail);
    setIsFormOpen(true);
  };

  const openFormForAdd = () => {
    setEditingDetail(null);
    setFormState(initialFormState);
    setIsFormOpen(true);
  };

  const renderDetail = (detail: CustomerDetail) => (
    <div className="text-sm">
      <p className="font-semibold text-foreground">{detail.name}</p>
      <p>{detail.shipping_address}</p>
      <p>{detail.email || "No email"}</p>
      <p>{detail.phone || "No contact phone"}</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Shipping Details</h3>
        <Button variant="outline" size="sm" onClick={openFormForAdd}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Add New Address
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-20 w-full rounded-md" />
        </div>
      ) : details.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center">
          <p className="text-muted-foreground">No shipping addresses saved.</p>
          <p className="text-sm text-muted-foreground">Click "Add New Address" to get started.</p>
        </div>
      ) : (
        <RadioGroup value={selectedDetailId ?? ""} onValueChange={setSelectedDetailId}>
          <div className="space-y-4">
            {details.map((detail) => (
              <Label
                key={detail.id}
                htmlFor={detail.id}
                className="flex cursor-pointer items-start gap-4 rounded-md border p-4 transition hover:bg-muted/50 has-[:checked]:border-primary"
              >
                <RadioGroupItem value={detail.id} id={detail.id} />
                <div className="flex-1">{renderDetail(detail)}</div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={(e) => { e.preventDefault(); openFormForEdit(detail); }}
                  >
                    <Edit className="h-4 w-4" />
                    <span className="sr-only">Edit</span>
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={(e) => e.preventDefault()}>
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Delete</span>
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription>This will permanently delete this address.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(detail.id)}>
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </Label>
            ))}
          </div>
        </RadioGroup>
      )}

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingDetail ? "Edit Address" : "Add New Address"}</DialogTitle>
            <DialogDescription>Fill in the details below.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Full Name</Label>
              <Input id="name" value={formState.name} onChange={(e) => setFormState({ ...formState, name: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="shipping_address">Shipping Address</Label>
              <Input id="shipping_address" value={formState.shipping_address} onChange={(e) => setFormState({ ...formState, shipping_address: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={formState.email} onChange={(e) => setFormState({ ...formState, email: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" type="tel" value={formState.phone} onChange={(e) => setFormState({ ...formState, phone: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsFormOpen(false)}>Cancel</Button>
            <Button onClick={handleFormSubmit} disabled={isSaving}>
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
