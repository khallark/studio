
'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, Copy, Loader2, Link as LinkIcon, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';

type MemberRole = 'Admin' | 'Staff' | 'Vendor';

const allStatuses = [
  'New', 'Confirmed', 'Ready To Dispatch', 'Dispatched', 'In Transit', 'Out For Delivery',
  'Delivered', 'RTO In Transit', 'RTO Delivered', 'DTO Requested', 'DTO Booked',
  'DTO In Transit', 'DTO Delivered', 'Pending Refunds', 'Lost', 'Closed', 'RTO Closed'
];

export default function InviteMemberPage() {
  const [user, loadingAuth] = useAuthState(auth);
  const { toast } = useToast();

  const [role, setRole] = useState<MemberRole | null>(null);
  const [permissions, setPermissions] = useState<Record<string, any>>({});
  const [isCreatingLink, setIsCreatingLink] = useState(false);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  
  const handleRoleChange = (selectedRole: MemberRole) => {
    setRole(selectedRole);
    // Reset permissions when role changes
    if (selectedRole === 'Staff' || selectedRole === 'Vendor') {
      setPermissions({ viewableStatuses: [] });
    } else {
      setPermissions({ canManageMembers: false, canChangeSettings: false });
    }
  };

  const handlePermissionChange = (key: string, value: any) => {
    setPermissions(prev => ({ ...prev, [key]: value }));
  };
  
  const handleStatusSelection = (status: string) => {
    const currentStatuses = permissions.viewableStatuses || [];
    const newStatuses = currentStatuses.includes(status)
      ? currentStatuses.filter((s: string) => s !== status)
      : [...currentStatuses, status];
    handlePermissionChange('viewableStatuses', newStatuses);
  };
  
  const createJoiningLink = async () => {
    if (!user) {
      toast({ title: "Authentication Error", description: "You must be logged in.", variant: "destructive" });
      return;
    }
    if (!role) {
      toast({ title: "Role not selected", description: "Please select a member role.", variant: "destructive" });
      return;
    }

    setIsCreatingLink(true);
    setGeneratedLink(null);

    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/shops/members/create-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
        body: JSON.stringify({ role, permissions })
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to create link');
      }

      setGeneratedLink(`${window.location.origin}/join-shop/${result.sessionId}`);
      toast({ title: "Invite Link Created", description: "You can now share the link with the new member." });

    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : 'An unknown error occurred.', variant: "destructive" });
    } finally {
      setIsCreatingLink(false);
    }
  };

  const copyLink = () => {
    if (generatedLink) {
      navigator.clipboard.writeText(generatedLink);
      toast({ title: "Copied to clipboard!" });
    }
  };

  return (
    <main className="flex flex-1 flex-col p-4 md:p-6 items-center">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Create a Joining Link</CardTitle>
          <CardDescription>Configure the role and permissions for a new member and generate a one-time invitation link.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          {/* Step 1: Role Selection */}
          <section>
            <Label className="text-lg font-semibold">1. Select Member Role</Label>
            <RadioGroup value={role || ""} onValueChange={(value) => handleRoleChange(value as MemberRole)} className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              {['Admin', 'Staff', 'Vendor'].map((r) => (
                <Label key={r} htmlFor={r} className={`rounded-lg border p-4 cursor-pointer transition-all ${role === r ? 'ring-2 ring-primary bg-primary/5' : 'hover:bg-muted/50'}`}>
                  <RadioGroupItem value={r} id={r} className="sr-only" />
                  <div className="font-bold">{r}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {r === 'Admin' && 'High-level access, can manage settings and other members if permitted.'}
                    {r === 'Staff' && 'Limited access to orders based on their status.'}
                    {r === 'Vendor' && 'Similar to staff, but with their own isolated settings.'}
                  </p>
                </Label>
              ))}
            </RadioGroup>
          </section>

          {/* Step 2: Permissions */}
          {role && (
            <section>
              <Label className="text-lg font-semibold">2. Set Permissions</Label>
              <div className="mt-4 p-4 border rounded-lg space-y-4">
                {role === 'Admin' && (
                  <div className="space-y-4">
                    <div className="flex items-center space-x-2">
                      <Checkbox id="canManageMembers" checked={permissions.canManageMembers} onCheckedChange={(checked) => handlePermissionChange('canManageMembers', checked)} />
                      <Label htmlFor="canManageMembers">Can manage other members (add, remove, edit permissions)</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox id="canChangeSettings" checked={permissions.canChangeSettings} onCheckedChange={(checked) => handlePermissionChange('canChangeSettings', checked)} />
                      <Label htmlFor="canChangeSettings">Can change main shop settings</Label>
                    </div>
                  </div>
                )}
                {(role === 'Staff' || role === 'Vendor') && (
                  <div>
                    <Label className="font-medium">Viewable Order Statuses</Label>
                    <p className="text-xs text-muted-foreground mb-4">Select which order statuses this member can see. {role === 'Vendor' && 'Vendors cannot see "New" orders.'}</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {allStatuses.map(status => (
                        <div key={status} className="flex items-center space-x-2">
                          <Checkbox
                            id={`status-${status}`}
                            checked={permissions.viewableStatuses.includes(status)}
                            onCheckedChange={() => handleStatusSelection(status)}
                            disabled={role === 'Vendor' && status === 'New'}
                          />
                          <Label htmlFor={`status-${status}`} className="text-sm font-normal">{status}</Label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}
          
          {/* Step 3: Generate Link */}
          {role && (
            <section>
              <Label className="text-lg font-semibold">3. Generate Link</Label>
              <div className="mt-4">
                <Button onClick={createJoiningLink} disabled={isCreatingLink || loadingAuth}>
                  {isCreatingLink ? <Loader2 className="animate-spin mr-2" /> : <LinkIcon className="mr-2 h-4 w-4" />}
                  Create Joining Link
                </Button>

                {generatedLink && (
                  <div className="mt-4 space-y-4">
                    <Alert>
                      <CheckCircle className="h-4 w-4" />
                      <AlertTitle>Link Generated Successfully!</AlertTitle>
                      <AlertDescription>
                        <div className="flex items-center gap-2 mt-2">
                          <input type="text" readOnly value={generatedLink} className="flex-1 p-2 border rounded-md text-sm bg-muted" />
                          <Button size="sm" variant="outline" onClick={copyLink}><Copy className="mr-2 h-4 w-4" /> Copy</Button>
                        </div>
                      </AlertDescription>
                    </Alert>
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Security Warning</AlertTitle>
                      <AlertDescription>
                        This link provides access to your shop. It is valid for one hour and can only be used once. Share it only with the intended recipient.
                      </AlertDescription>
                    </Alert>
                  </div>
                )}
              </div>
            </section>
          )}

        </CardContent>
      </Card>
    </main>
  );
}
