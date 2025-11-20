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
import { useBusinessContext } from '../../../layout';

type MemberRole = 'Admin' | 'Member';

export default function InviteMemberPage() {
  const { user, businessId } = useBusinessContext();
  const { toast } = useToast();

  const [role, setRole] = useState<MemberRole | null>(null);
  const [permissions, setPermissions] = useState<Record<string, any>>({});
  const [isCreatingLink, setIsCreatingLink] = useState(false);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  
  const handleRoleChange = (selectedRole: MemberRole) => {
    setRole(selectedRole);
    // Reset permissions when role changes
    if (selectedRole === 'Admin') {
      setPermissions({ 
        canManageMembers: false, 
        canChangeSettings: false,
        canManageStores: false 
      });
    } else {
      setPermissions({ 
        canViewOrders: true,
        canManageOrders: false 
      });
    }
  };

  const handlePermissionChange = (key: string, value: any) => {
    setPermissions(prev => ({ ...prev, [key]: value }));
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
      const response = await fetch('/api/business/members/create-invite', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': `Bearer ${idToken}` 
        },
        body: JSON.stringify({ businessId, role, permissions })
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to create link');
      }

      setGeneratedLink(`${window.location.origin}/join-business/${result.sessionId}`);
      toast({ title: "Invite Link Created", description: "You can now share the link with the new member." });

    } catch (error) {
      toast({ 
        title: "Error", 
        description: error instanceof Error ? error.message : 'An unknown error occurred.', 
        variant: "destructive" 
      });
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
          <CardDescription>
            Configure the role and permissions for a new business member and generate a one-time invitation link.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          {/* Step 1: Role Selection */}
          <section>
            <Label className="text-lg font-semibold">1. Select Member Role</Label>
            <RadioGroup 
              value={role || ""} 
              onValueChange={(value) => handleRoleChange(value as MemberRole)} 
              className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4"
            >
              {['Admin', 'Member'].map((r) => (
                <Label 
                  key={r} 
                  htmlFor={r} 
                  className={`rounded-lg border p-4 cursor-pointer transition-all ${
                    role === r ? 'ring-2 ring-primary bg-primary/5' : 'hover:bg-muted/50'
                  }`}
                >
                  <RadioGroupItem value={r} id={r} className="sr-only" />
                  <div className="font-bold">{r}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {r === 'Admin' && 'High-level access, can manage settings and other members if permitted.'}
                    {r === 'Member' && 'Basic access to view and manage orders across all stores in the business.'}
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
                      <Checkbox 
                        id="canManageMembers" 
                        checked={permissions.canManageMembers} 
                        onCheckedChange={(checked) => handlePermissionChange('canManageMembers', checked)} 
                      />
                      <Label htmlFor="canManageMembers">Can manage other members (add, remove, edit permissions)</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="canChangeSettings" 
                        checked={permissions.canChangeSettings} 
                        onCheckedChange={(checked) => handlePermissionChange('canChangeSettings', checked)} 
                      />
                      <Label htmlFor="canChangeSettings">Can change business settings</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="canManageStores" 
                        checked={permissions.canManageStores} 
                        onCheckedChange={(checked) => handlePermissionChange('canManageStores', checked)} 
                      />
                      <Label htmlFor="canManageStores">Can add/remove stores from business</Label>
                    </div>
                  </div>
                )}
                {role === 'Member' && (
                  <div className="space-y-4">
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="canViewOrders" 
                        checked={permissions.canViewOrders} 
                        onCheckedChange={(checked) => handlePermissionChange('canViewOrders', checked)} 
                      />
                      <Label htmlFor="canViewOrders">Can view orders across all stores</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="canManageOrders" 
                        checked={permissions.canManageOrders} 
                        onCheckedChange={(checked) => handlePermissionChange('canManageOrders', checked)} 
                      />
                      <Label htmlFor="canManageOrders">Can manage orders (assign AWB, update status)</Label>
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
                <Button onClick={createJoiningLink} disabled={isCreatingLink}>
                  {isCreatingLink ? (
                    <Loader2 className="animate-spin mr-2" />
                  ) : (
                    <LinkIcon className="mr-2 h-4 w-4" />
                  )}
                  Create Joining Link
                </Button>

                {generatedLink && (
                  <div className="mt-4 space-y-4">
                    <Alert>
                      <CheckCircle className="h-4 w-4" />
                      <AlertTitle>Link Generated Successfully!</AlertTitle>
                      <AlertDescription>
                        <div className="flex items-center gap-2 mt-2">
                          <input 
                            type="text" 
                            readOnly 
                            value={generatedLink} 
                            className="flex-1 p-2 border rounded-md text-sm bg-muted" 
                          />
                          <Button size="sm" variant="outline" onClick={copyLink}>
                            <Copy className="mr-2 h-4 w-4" /> Copy
                          </Button>
                        </div>
                      </AlertDescription>
                    </Alert>
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Security Warning</AlertTitle>
                      <AlertDescription>
                        This link provides access to your business and all its stores. It is valid for one hour and can only be used once. Share it only with the intended recipient.
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