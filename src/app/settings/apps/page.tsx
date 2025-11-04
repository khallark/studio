
'use client';

import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Info, GripVertical, Loader2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Reorder } from "framer-motion"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { doc, getDoc } from 'firebase/firestore';

interface CourierSetting {
  name: string;
  mode: 'Surface' | 'Express';
}

interface CourierIntegrations {
    delhivery?: { apiKey: string; };
    shiprocket?: { email: string; apiKey: string; };
    xpressbees?: { email: string; apiKey: string; };
    priorityEnabled?: boolean;
    priorityList?: CourierSetting[];
}

interface SettingsData {
    integrations?: {
        couriers?: CourierIntegrations,
    }
}

type MemberRole = 'SuperAdmin' | 'Admin' | 'Staff' | 'Vendor';

// Helper function to merge priority list while preserving order
const mergePriorityList = (savedList: CourierSetting[] | undefined, couriers: CourierIntegrations | undefined): CourierSetting[] => {
    if (!couriers) return [];
    
    // Get all integrated couriers
    const integrated = Object.keys(couriers).filter(k => 
        !['priorityEnabled', 'priorityList'].includes(k) && 
        couriers?.[k as keyof typeof couriers]
    );
    
    // Start with saved list items that are still integrated
    const orderedList = (savedList || [])
        .filter(item => integrated.includes(item.name))
        .map(item => ({ ...item })); // Create new objects to avoid reference issues
    
    // Add newly integrated couriers that aren't in the saved list
    const newIntegrated = integrated
        .filter(name => !(savedList || []).some(s => s.name === name))
        .map(name => ({ name, mode: 'Surface' as const }));
    
    return [...orderedList, ...newIntegrated];
};

export default function AppsSettingsPage() {
  const [user, userLoading] = useAuthState(auth);
  const { toast } = useToast();

  const [settingsData, setSettingsData] = useState<SettingsData | null>(null);
  const [memberRole, setMemberRole] = useState<MemberRole | null>(null);
  const [dataLoading, setDataLoading] = useState(true);

  const [delhiveryApiKey, setDelhiveryApiKey] = useState('');
  const [isEditingDelhivery, setIsEditingDelhivery] = useState(false);
  const [isSubmittingDelhivery, setIsSubmittingDelhivery] = useState(false);
  
  const [shiprocketEmail, setShiprocketEmail] = useState('');
  const [shiprocketPassword, setShiprocketPassword] = useState('');
  const [isEditingShiprocket, setIsEditingShiprocket] = useState(false);
  const [isSubmittingShiprocket, setIsSubmittingShiprocket] = useState(false);

  const [xpressbeesEmail, setXpressbeesEmail] = useState('');
  const [xpressbeesPassword, setXpressbeesPassword] = useState('');
  const [isEditingXpressbees, setIsEditingXpressbees] = useState(false);
  const [isSubmittingXpressbees, setIsSubmittingXpressbees] = useState(false);
  
  const [courierPriorityEnabled, setCourierPriorityEnabled] = useState(false);
  const [courierPriorityList, setCourierPriorityList] = useState<CourierSetting[]>([]);
  const [isSubmittingPriority, setIsSubmittingPriority] = useState(false);

  useEffect(() => {
    document.title = "Settings - Apps";
  }, []);

  const fetchData = async () => {
    if (!user) return;
    setDataLoading(true);

    try {
        const idToken = await user.getIdToken();
        const response = await fetch('/api/settings/get-details', {
            headers: { 'Authorization': `Bearer ${idToken}` }
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.details || 'Failed to fetch settings');
        }
        
        setMemberRole(data.role);
        setSettingsData(data.settings);
        const integrations = data.settings?.integrations;
        
        setDelhiveryApiKey(integrations?.couriers?.delhivery?.apiKey || '');
        
        const couriers = integrations?.couriers;
        setCourierPriorityEnabled(couriers?.priorityEnabled || false);
        const mergedList = mergePriorityList(couriers?.priorityList, couriers);
        setCourierPriorityList(mergedList);

    } catch (error) {
        toast({
            title: 'Error Loading Settings',
            description: error instanceof Error ? error.message : 'Could not load your settings data.',
            variant: 'destructive',
        });
        setSettingsData(null);
    } finally {
        setDataLoading(false);
    }
  }

  useEffect(() => {
    if (!userLoading && user) {
        fetchData();
    } else if (!userLoading && !user) {
        setDataLoading(false);
    }
  }, [user, userLoading]);

  const updatePrioritySettings = async (enabled: boolean, list: CourierSetting[]) => {
      if (!user) return;
      setIsSubmittingPriority(true);
      try {
          const idToken = await user.getIdToken();
          const response = await fetch('/api/integrations/courier/update-priority', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}`},
              body: JSON.stringify({ shop: 'unused', enabled, priorityList: list })
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.details || 'Failed to update priority settings');
          toast({ title: 'Priority Settings Updated' });
          fetchData(); // Refetch
      } catch (error) {
          toast({ title: 'Update Failed', description: error instanceof Error ? error.message : 'An unknown error occurred.', variant: "destructive" });
      } finally {
          setIsSubmittingPriority(false);
      }
  };

  const handlePriorityModeChange = (courierName: string, mode: 'Surface' | 'Express') => {
      const newList = courierPriorityList.map(item => 
          item.name === courierName ? { ...item, mode } : item
      );
      setCourierPriorityList(newList);
      updatePrioritySettings(courierPriorityEnabled, newList);
  };
  
  const handleSaveDelhiveryKey = async () => {
      if (!user || !delhiveryApiKey) {
          toast({ title: "API Key is required", variant: "destructive"});
          return;
      };

      setIsSubmittingDelhivery(true);
      try {
          const idToken = await user.getIdToken();
          const response = await fetch('/api/integrations/courier/update', {
              method: 'POST',
              headers: { 
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${idToken}`
              },
              body: JSON.stringify({
                  courierName: 'delhivery',
                  apiKey: delhiveryApiKey,
              })
          });

          const result = await response.json();
          if (!response.ok) throw new Error(result.details || 'Failed to save API key');

          toast({ title: 'API Key Saved', description: 'Delhivery integration has been updated.' });
          setIsEditingDelhivery(false);
          fetchData(); // Refetch
      } catch (error) {
          toast({ title: 'Save Failed', description: error instanceof Error ? error.message : 'An unknown error occurred.', variant: "destructive" });
      } finally {
          setIsSubmittingDelhivery(false);
      }
  };

  const handleSaveShiprocketCreds = async () => {
    if (!user || !shiprocketEmail || !shiprocketPassword) {
        toast({ title: "Email and Password are required", variant: "destructive"});
        return;
    };

    setIsSubmittingShiprocket(true);
    try {
        const idToken = await user.getIdToken();
        const response = await fetch('/api/integrations/shiprocket/update', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({
                email: shiprocketEmail,
                password: shiprocketPassword,
            })
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.details || 'Failed to connect to Shiprocket');

        toast({ title: 'Shiprocket Connected', description: 'Shiprocket integration has been successfully set up.' });
        setIsEditingShiprocket(false);
        setShiprocketEmail('');
        setShiprocketPassword('');
        fetchData();
    } catch (error) {
        toast({ title: 'Connection Failed', description: error instanceof Error ? error.message : 'An unknown error occurred.', variant: "destructive" });
    } finally {
        setIsSubmittingShiprocket(false);
    }
  };
  
    const handleSaveXpressbeesCreds = async () => {
    if (!user || !xpressbeesEmail || !xpressbeesPassword) {
        toast({ title: "Email and Password are required", variant: "destructive"});
        return;
    };

    setIsSubmittingXpressbees(true);
    try {
        const idToken = await user.getIdToken();
        const response = await fetch('/api/integrations/xpressbees/update', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({
                email: xpressbeesEmail,
                password: xpressbeesPassword,
            })
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.details || 'Failed to connect to Xpressbees');

        toast({ title: 'Xpressbees Connected', description: 'Xpressbees integration has been successfully set up.' });
        setIsEditingXpressbees(false);
        setXpressbeesEmail('');
        setXpressbeesPassword('');
        fetchData();
    } catch (error) {
        toast({ title: 'Connection Failed', description: error instanceof Error ? error.message : 'An unknown error occurred.', variant: "destructive" });
    } finally {
        setIsSubmittingXpressbees(false);
    }
  };

  const hasConnectedStore = !!settingsData;
  const isReadOnly = memberRole === 'Staff';
  const hasDelhiveryKey = !!settingsData?.integrations?.couriers?.delhivery?.apiKey;
  const hasShiprocketCreds = !!settingsData?.integrations?.couriers?.shiprocket?.apiKey;
  const hasXpressbeesCreds = !!settingsData?.integrations?.couriers?.xpressbees?.apiKey;

  const renderSkeleton = () => (
    <Card className="w-full max-w-4xl">
        <CardHeader>
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-96" />
        </CardHeader>
        <CardContent className="space-y-8">
            <Skeleton className="h-24 w-full" />
            <Separator />
            <Skeleton className="h-48 w-full" />
        </CardContent>
    </Card>
  )

  if (dataLoading || userLoading) {
      return (
        <div className="flex justify-center items-start h-full p-4 md:p-6">
            {renderSkeleton()}
        </div>
      )
  }

  return (
    <TooltipProvider>
    <div className="flex justify-center items-start h-full p-4 md:p-6">
      <Card className="w-full max-w-4xl">
        <CardHeader>
          <CardTitle className="text-2xl font-headline">Apps & Integrations</CardTitle>
          <CardDescription>Manage your connected applications and courier services.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
            <section>
                <h2 className="text-lg font-semibold mb-4 text-primary">Courier Services</h2>
                 <div className="rounded-lg border">
                    <div className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-xl font-semibold">Courier Priority</h3>
                                <p className="text-sm text-muted-foreground">Enable and set the priority of your couriers.</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <Label htmlFor="courier-priority-switch" className="text-sm">
                                {courierPriorityEnabled ? 'Enabled' : 'Disabled'}
                                </Label>
                                <Switch
                                id="courier-priority-switch"
                                checked={courierPriorityEnabled}
                                onCheckedChange={(checked) => {
                                    setCourierPriorityEnabled(checked);
                                    updatePrioritySettings(checked, courierPriorityList);
                                }}
                                disabled={isSubmittingPriority || isReadOnly || courierPriorityList.length === 0}
                                />
                            </div>
                        </div>
                    </div>
                    <div className="border-t bg-muted/50 p-6">
                        <h4 className="font-medium mb-4">Drag to Reorder Priority</h4>
                         {isSubmittingPriority && <Loader2 className="h-4 w-4 animate-spin my-2" />}
                        <Reorder.Group axis="y" values={courierPriorityList} onReorder={setCourierPriorityList} className="space-y-2">
                        {courierPriorityList.map((courier) => (
                            <Reorder.Item 
                                key={courier.name} 
                                value={courier} 
                                className="flex items-center gap-4 p-3 rounded-md bg-background border shadow-sm cursor-grab active:cursor-grabbing"
                                onDragEnd={() => updatePrioritySettings(courierPriorityEnabled, courierPriorityList)}
                            >
                                <GripVertical className="h-5 w-5 text-muted-foreground" />
                                <span className="font-medium capitalize flex-1">{courier.name}</span>
                                {courier.name !== 'shiprocket' && (
                                    <Select 
                                        value={courier.mode} 
                                        onValueChange={(value: 'Surface' | 'Express') => handlePriorityModeChange(courier.name, value)}
                                        disabled={isReadOnly}
                                    >
                                        <SelectTrigger className="w-[120px] h-8">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Surface">Surface</SelectItem>
                                            <SelectItem value="Express">Express</SelectItem>
                                        </SelectContent>
                                    </Select>
                                )}
                            </Reorder.Item>
                        ))}
                        </Reorder.Group>
                    </div>
                    {/* Delhivery */}
                    <div className="border-t p-6 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div>
                                <h3 className="text-xl font-semibold">Delhivery</h3>
                                <p className="text-sm text-muted-foreground">Integrate with your Delhivery account.</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            {hasDelhiveryKey && !isEditingDelhivery ? (
                                <>
                                    <Badge variant="default">Connected</Badge>
                                    {!isReadOnly && <Button variant="outline" onClick={() => setIsEditingDelhivery(true)}>Change Key</Button>}
                                </>
                            ) : (
                                 <Button variant="outline" onClick={() => setIsEditingDelhivery(true)} disabled={!hasConnectedStore || isReadOnly}>
                                    {hasConnectedStore ? 'Connect' : 'No Store'}
                                </Button>
                            )}
                        </div>
                    </div>

                    {isEditingDelhivery && (
                        <div className="border-t bg-muted/50 p-6">
                             <div className="flex items-end gap-4">
                                <div className="grid gap-1.5 flex-1">
                                    <label className="text-sm font-medium">Delhivery API Key</label>
                                    <Input 
                                        type="password"
                                        placeholder="Enter your API Key from Delhivery"
                                        value={delhiveryApiKey}
                                        onChange={(e) => setDelhiveryApiKey(e.target.value)}
                                        disabled={isSubmittingDelhivery}
                                    />
                                </div>
                                <div className="flex gap-2">
                                     <Button variant="secondary" onClick={() => setIsEditingDelhivery(false)} disabled={isSubmittingDelhivery}>Cancel</Button>
                                     <Button onClick={handleSaveDelhiveryKey} disabled={isSubmittingDelhivery}>
                                        {isSubmittingDelhivery ? 'Saving...' : 'Save Key'}
                                    </Button>
                                </div>
                             </div>
                        </div>
                    )}

                    {/* Shiprocket */}
                    <div className="border-t p-6 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div>
                                <h3 className="text-xl font-semibold">Shiprocket</h3>
                                <p className="text-sm text-muted-foreground">Integrate with your Shiprocket account.</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            {hasShiprocketCreds && !isEditingShiprocket ? (
                                <>
                                    <Badge variant="default">Connected</Badge>
                                    {!isReadOnly && <Button variant="outline" onClick={() => setIsEditingShiprocket(true)}>Change Credentials</Button>}
                                </>
                            ) : (
                                <Button variant="outline" onClick={() => setIsEditingShiprocket(true)} disabled={!hasConnectedStore || isReadOnly}>
                                    {hasConnectedStore ? 'Connect' : 'No Store'}
                                </Button>
                            )}
                        </div>
                    </div>

                    {isEditingShiprocket && (
                        <div className="border-t bg-muted/50 p-6">
                            <div className="space-y-4">
                                <div className="flex items-center gap-2">
                                    <h4 className="font-medium">Shiprocket Credentials</h4>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p>Read the <a href="https://shiprocket.freshdesk.com/support/solutions/articles/43000337456-api-document-helpsheet" target="_blank" rel="noopener noreferrer" className="underline font-semibold">Shiprocket API docs</a> for help.</p>
                                        </TooltipContent>
                                    </Tooltip>
                                </div>
                                <div className="grid md:grid-cols-2 gap-4">
                                    <div className="grid gap-1.5">
                                        <label className="text-sm font-medium">Email</label>
                                        <Input
                                            type="email"
                                            placeholder="Your Shiprocket email"
                                            value={shiprocketEmail}
                                            onChange={(e) => setShiprocketEmail(e.target.value)}
                                            disabled={isSubmittingShiprocket}
                                        />
                                    </div>
                                    <div className="grid gap-1.5">
                                        <label className="text-sm font-medium">Password</label>
                                        <Input
                                            type="password"
                                            placeholder="Your Shiprocket password"
                                            value={shiprocketPassword}
                                            onChange={(e) => setShiprocketPassword(e.target.value)}
                                            disabled={isSubmittingShiprocket}
                                        />
                                    </div>
                                </div>
                                <div className="flex justify-end gap-2">
                                    <Button variant="secondary" onClick={() => {setIsEditingShiprocket(false); setShiprocketEmail(''); setShiprocketPassword('');}} disabled={isSubmittingShiprocket}>
                                        Cancel
                                    </Button>
                                    <Button onClick={handleSaveShiprocketCreds} disabled={isSubmittingShiprocket}>
                                        {isSubmittingShiprocket ? 'Connecting...' : 'Save & Connect'}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                    
                    {/* Xpressbees */}
                    <div className="border-t p-6 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div>
                                <h3 className="text-xl font-semibold">Xpressbees</h3>
                                <p className="text-sm text-muted-foreground">Integrate with your Xpressbees account.</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            {hasXpressbeesCreds && !isEditingXpressbees ? (
                                <>
                                    <Badge variant="default">Connected</Badge>
                                    {!isReadOnly && <Button variant="outline" onClick={() => setIsEditingXpressbees(true)}>Change Credentials</Button>}
                                </>
                            ) : (
                                <Button variant="outline" onClick={() => setIsEditingXpressbees(true)} disabled={!hasConnectedStore || isReadOnly}>
                                    {hasConnectedStore ? 'Connect' : 'No Store'}
                                </Button>
                            )}
                        </div>
                    </div>

                    {isEditingXpressbees && (
                        <div className="border-t bg-muted/50 p-6">
                            <div className="space-y-4">
                                <h4 className="font-medium">Xpressbees Credentials</h4>
                                <div className="grid md:grid-cols-2 gap-4">
                                    <div className="grid gap-1.5">
                                        <label className="text-sm font-medium">Email</label>
                                        <Input
                                            type="email"
                                            placeholder="Your Xpressbees email"
                                            value={xpressbeesEmail}
                                            onChange={(e) => setXpressbeesEmail(e.target.value)}
                                            disabled={isSubmittingXpressbees}
                                        />
                                    </div>
                                    <div className="grid gap-1.5">
                                        <label className="text-sm font-medium">Password</label>
                                        <Input
                                            type="password"
                                            placeholder="Your Xpressbees password"
                                            value={xpressbeesPassword}
                                            onChange={(e) => setXpressbeesPassword(e.target.value)}
                                            disabled={isSubmittingXpressbees}
                                        />
                                    </div>
                                </div>
                                <div className="flex justify-end gap-2">
                                    <Button variant="secondary" onClick={() => {setIsEditingXpressbees(false); setXpressbeesEmail(''); setXpressbeesPassword('');}} disabled={isSubmittingXpressbees}>
                                        Cancel
                                    </Button>
                                    <Button onClick={handleSaveXpressbeesCreds} disabled={isSubmittingXpressbees}>
                                        {isSubmittingXpressbees ? 'Connecting...' : 'Save & Connect'}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                 </div>
            </section>
        </CardContent>
      </Card>
    </div>
    </TooltipProvider>
  )
}
