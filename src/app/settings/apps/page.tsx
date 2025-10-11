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
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import Link from 'next/link';
import Image from 'next/image';
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
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Info, Copy, GripVertical, Loader2 } from 'lucide-react';
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

interface CourierSetting {
  name: string;
  mode: 'Surface' | 'Express';
}

interface UserData {
  activeAccountId: string | null;
  accounts: string[];
}

interface CourierIntegrations {
    delhivery?: { apiKey: string; };
    shiprocket?: { email: string; apiKey: string; };
    xpressbees?: { email: string; apiKey: string; };
    priorityEnabled?: boolean;
    priorityList?: CourierSetting[];
}

interface AccountData {
    integrations?: {
        couriers?: CourierIntegrations,
        communication?: {
          interakt?: {
            apiKey?: string;
            webhookKey?: string;
          }
        }
    }
}

// Helper function to merge priority list while preserving order
const mergePriorityList = (savedList: CourierSetting[], couriers: CourierIntegrations | undefined): CourierSetting[] => {
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
        .filter(name => !savedList?.some(s => s.name === name))
        .map(name => ({ name, mode: 'Surface' as const }));
    
    return [...orderedList, ...newIntegrated];
};

export default function AppsSettingsPage() {
  const [user, loading] = useAuthState(auth);
  const { toast } = useToast();

  const [userData, setUserData] = useState<UserData | null>(null);
  const [accountData, setAccountData] = useState<AccountData | null>(null);
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

  const [interaktApiKey, setInteraktApiKey] = useState('');
  const [isEditingInteraktApi, setIsEditingInteraktApi] = useState(false);
  const [isSubmittingInteraktApi, setIsSubmittingInteraktApi] = useState(false);

  const [interaktWebhookKey, setInteraktWebhookKey] = useState('');
  const [isEditingInteraktWebhook, setIsEditingInteraktWebhook] = useState(false);
  const [isSubmittingInteraktWebhook, setIsSubmittingInteraktWebhook] = useState(false);
  
  const [courierPriorityEnabled, setCourierPriorityEnabled] = useState(false);
  const [courierPriorityList, setCourierPriorityList] = useState<CourierSetting[]>([]);
  const [isSubmittingPriority, setIsSubmittingPriority] = useState(false);


  const [appUrl, setAppUrl] = useState('');

  useEffect(() => {
    document.title = "Settings - Apps";
  })

  useEffect(() => {
    // This will only run on the client side
    setAppUrl(window.location.origin);
  }, []);

  const updatePrioritySettings = async (enabled: boolean, list: CourierSetting[]) => {
      if (!userData?.activeAccountId || !user) return;
      setIsSubmittingPriority(true);
      try {
          const idToken = await user.getIdToken();
          const response = await fetch('/api/integrations/courier/update-priority', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}`},
              body: JSON.stringify({ shop: userData.activeAccountId, enabled, priorityList: list })
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.details || 'Failed to update priority settings');
          toast({ title: 'Priority Settings Updated' });
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


  useEffect(() => {
    if (loading) return;

    const fetchInitialData = async () => {
        if (user) {
            const userRef = doc(db, 'users', user.uid);
            const userDoc = await getDoc(userRef);
            if (userDoc.exists()) {
                const fetchedUserData = userDoc.data() as UserData;
                setUserData(fetchedUserData);
                
                if (fetchedUserData.activeAccountId) {
                    const accountRef = doc(db, 'accounts', fetchedUserData.activeAccountId);
                    const accountDoc = await getDoc(accountRef);
                    if (accountDoc.exists()) {
                        const accData = accountDoc.data() as AccountData;
                        setAccountData(accData);
                        setDelhiveryApiKey(accData.integrations?.couriers?.delhivery?.apiKey || '');
                        setInteraktApiKey(accData.integrations?.communication?.interakt?.apiKey || '');
                        setInteraktWebhookKey(accData.integrations?.communication?.interakt?.webhookKey || '');
                        
                        const couriers = accData.integrations?.couriers;
                        setCourierPriorityEnabled(couriers?.priorityEnabled || false);
                        
                        // Use the helper function for consistent ordering
                        const mergedList = mergePriorityList(couriers?.priorityList || [], couriers);
                        setCourierPriorityList(mergedList);
                    }
                }
            }
        }
        setDataLoading(false);
    };
    
    fetchInitialData();

    if (user && userData?.activeAccountId) {
        const accountRef = doc(db, 'accounts', userData.activeAccountId);
        const unsubscribe = onSnapshot(accountRef, (doc) => {
            if (doc.exists()) {
                const accData = doc.data() as AccountData;
                setAccountData(accData);
                if (!isEditingDelhivery) setDelhiveryApiKey(accData.integrations?.couriers?.delhivery?.apiKey || '');
                if (!isEditingInteraktApi) setInteraktApiKey(accData.integrations?.communication?.interakt?.apiKey || '');
                if (!isEditingInteraktWebhook) setInteraktWebhookKey(accData.integrations?.communication?.interakt?.webhookKey || '');

                const couriers = accData.integrations?.couriers;
                setCourierPriorityEnabled(couriers?.priorityEnabled || false);
                
                // Use the helper function for consistent ordering
                const mergedList = mergePriorityList(couriers?.priorityList || [], couriers);
                setCourierPriorityList(mergedList);
            }
        });
        return () => unsubscribe();
    }

  }, [user, loading, userData?.activeAccountId, isEditingDelhivery, isEditingInteraktApi, isEditingInteraktWebhook]);

  const hasConnectedStore = userData?.activeAccountId;
  const hasDelhiveryKey = !!accountData?.integrations?.couriers?.delhivery?.apiKey;
  const hasShiprocketCreds = !!accountData?.integrations?.couriers?.shiprocket?.apiKey;
  const hasXpressbeesCreds = !!accountData?.integrations?.couriers?.xpressbees?.apiKey;
  const hasInteraktApiKey = !!accountData?.integrations?.communication?.interakt?.apiKey;
  const hasInteraktWebhookKey = !!accountData?.integrations?.communication?.interakt?.webhookKey;

  const handleDisconnect = () => {
    toast({
      title: "Store Disconnected",
      description: "Your Shopify store has been disconnected.",
    });
    setUserData(prev => prev ? { ...prev, activeAccountId: null } : null);
    setAccountData(null);
  };
  
  const handleSaveDelhiveryKey = async () => {
      if (!userData?.activeAccountId || !user || !delhiveryApiKey) {
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
                  shop: userData.activeAccountId,
                  courierName: 'delhivery',
                  apiKey: delhiveryApiKey,
              })
          });

          const result = await response.json();
          if (!response.ok) throw new Error(result.details || 'Failed to save API key');

          toast({ title: 'API Key Saved', description: 'Delhivery integration has been updated.' });
          setIsEditingDelhivery(false);
      } catch (error) {
          toast({ title: 'Save Failed', description: error instanceof Error ? error.message : 'An unknown error occurred.', variant: "destructive" });
      } finally {
          setIsSubmittingDelhivery(false);
      }
  };

  const handleSaveShiprocketCreds = async () => {
    if (!userData?.activeAccountId || !user || !shiprocketEmail || !shiprocketPassword) {
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
                shop: userData.activeAccountId,
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
    } catch (error) {
        toast({ title: 'Connection Failed', description: error instanceof Error ? error.message : 'An unknown error occurred.', variant: "destructive" });
    } finally {
        setIsSubmittingShiprocket(false);
    }
  };

  const handleSaveXpressbeesCreds = async () => {
    if (!userData?.activeAccountId || !user || !xpressbeesEmail || !xpressbeesPassword) {
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
                shop: userData.activeAccountId,
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
    } catch (error) {
        toast({ title: 'Connection Failed', description: error instanceof Error ? error.message : 'An unknown error occurred.', variant: "destructive" });
    } finally {
        setIsSubmittingXpressbees(false);
    }
  };

  const handleSaveInterakt = async (type: 'apiKey' | 'webhookKey') => {
    if (!userData?.activeAccountId || !user) return;

    let keyToSave: string, valueToSave: string;
    if (type === 'apiKey') {
      if (!interaktApiKey) {
        toast({ title: 'API Key is required', variant: 'destructive' });
        return;
      }
      setIsSubmittingInteraktApi(true);
      keyToSave = 'apiKey';
      valueToSave = interaktApiKey;
    } else {
      if (!interaktWebhookKey) {
        toast({ title: 'Webhook Key is required', variant: 'destructive' });
        return;
      }
      setIsSubmittingInteraktWebhook(true);
      keyToSave = 'webhookKey';
      valueToSave = interaktWebhookKey;
    }

    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/integrations/interakt/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          shop: userData.activeAccountId,
          key: keyToSave,
          value: valueToSave,
        }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.details || 'Failed to save Interakt key');

      toast({ title: 'Interakt Key Saved', description: `Interakt ${type === 'apiKey' ? 'API Key' : 'Webhook Key'} has been updated.` });
      
      if (type === 'apiKey') setIsEditingInteraktApi(false);
      else setIsEditingInteraktWebhook(false);

    } catch (error) {
      toast({ title: 'Save Failed', description: error instanceof Error ? error.message : 'An unknown error occurred.', variant: "destructive" });
    } finally {
      if (type === 'apiKey') setIsSubmittingInteraktApi(false);
      else setIsSubmittingInteraktWebhook(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({ title: 'Copied to clipboard!' });
    }, (err) => {
      toast({ title: 'Failed to copy', description: 'Could not copy text to clipboard.', variant: 'destructive' });
    });
  };


  return (
    <TooltipProvider>
    <div className="flex justify-center items-start h-full p-4 md:p-6">
      <Card className="w-full max-w-4xl">
        <CardHeader>
          <CardTitle className="text-2xl font-headline">Apps & Integrations</CardTitle>
          <CardDescription>Manage your connected applications, courier services, and communication channels.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
            {/* Apps Section */}
            <section>
                <h2 className="text-lg font-semibold mb-4 text-primary">Connected Apps</h2>
                <div className="rounded-lg border p-6">
                    {dataLoading ? (
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                        <Skeleton className="w-16 h-16 rounded-md" />
                        <div className="space-y-2">
                            <Skeleton className="h-6 w-24" />
                            <Skeleton className="h-4 w-48" />
                        </div>
                        </div>
                        <div className="flex items-center gap-4">
                        <Skeleton className="h-6 w-20 rounded-full" />
                        <Skeleton className="h-10 w-28" />
                        </div>
                    </div>
                    ) : (
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <Image src="https://picsum.photos/seed/shopify/64/64" alt="Shopify Logo" width={64} height={64} className="rounded-md" data-ai-hint="shopify logo" />
                        <div>
                            <h3 className="text-xl font-semibold">Shopify</h3>
                            <p className="text-sm text-muted-foreground">Sync your orders and products from Shopify.</p>
                        </div>
                        </div>
                        <div className="flex items-center gap-4">
                        {hasConnectedStore ? (
                            <>
                            <Badge variant="default">Connected</Badge>
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                <Button variant="destructive">Disconnect</Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                    This will disconnect your Shopify store. You will need to reconnect to continue syncing orders.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleDisconnect}>
                                    Yes, Disconnect
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                            </>
                        ) : (
                            <>
                            <Badge variant="secondary">Not Connected</Badge>
                            <Button asChild>
                                <Link href="/dashboard/connect">Connect</Link>
                            </Button>
                            </>
                        )}
                        </div>
                    </div>
                    )}
                </div>
            </section>

            <Separator />
            
            {/* Courier Integrations Section */}
            <section>
                 <h2 className="text-lg font-semibold mb-4 text-primary">Courier Services</h2>
                 <div className="rounded-lg border">
                    {/* Courier Priority */}
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
                                  disabled={isSubmittingPriority || courierPriorityList.length === 0}
                                />
                            </div>
                        </div>
                    </div>
                     {courierPriorityEnabled && (
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
                                    {courier.name !== 'shiprocket' && courier.name !== 'priority' && (
                                        <Select 
                                            value={courier.mode} 
                                            onValueChange={(value: 'Surface' | 'Express') => handlePriorityModeChange(courier.name, value)}
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
                    )}
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
                                    <Button variant="outline" onClick={() => setIsEditingDelhivery(true)}>Change Key</Button>
                                </>
                            ) : (
                                 <Button variant="outline" onClick={() => setIsEditingDelhivery(true)} disabled={!hasConnectedStore}>
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
                                    <Button variant="outline" onClick={() => setIsEditingShiprocket(true)}>Change Credentials</Button>
                                </>
                            ) : (
                                <Button variant="outline" onClick={() => setIsEditingShiprocket(true)} disabled={!hasConnectedStore}>
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
                                    <Button variant="outline" onClick={() => setIsEditingXpressbees(true)}>Change Credentials</Button>
                                </>
                            ) : (
                                <Button variant="outline" onClick={() => setIsEditingXpressbees(true)} disabled={!hasConnectedStore}>
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

             <Separator />

            {/* Communication Channels Section */}
            <section>
                 <h2 className="text-lg font-semibold mb-4 text-primary">Communication Channels</h2>
                 <div className="rounded-lg border">
                    {/* Interakt */}
                    <div className="p-6 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div>
                                <h3 className="text-xl font-semibold">Interakt</h3>
                                <p className="text-sm text-muted-foreground">Connect with Interakt for WhatsApp communication.</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <Badge variant={hasInteraktApiKey && hasInteraktWebhookKey ? 'default' : 'secondary'}>
                            {hasInteraktApiKey && hasInteraktWebhookKey ? 'Connected' : 'Incomplete'}
                          </Badge>
                        </div>
                    </div>
                    {/* Interakt API Key */}
                    <div className="border-t p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <h4 className="font-semibold">API Secret Key</h4>
                                <p className="text-sm text-muted-foreground">Used for sending messages and using Interakt APIs.</p>
                            </div>
                            <div className="flex items-center gap-4">
                                {hasInteraktApiKey && !isEditingInteraktApi ? (
                                    <Button variant="outline" onClick={() => setIsEditingInteraktApi(true)}>Change Key</Button>
                                ) : (
                                    <Button variant="outline" onClick={() => setIsEditingInteraktApi(true)} disabled={!hasConnectedStore}>
                                        {hasConnectedStore ? 'Set Key' : 'No Store'}
                                    </Button>
                                )}
                            </div>
                        </div>
                         {isEditingInteraktApi && (
                            <div className="mt-4 flex items-end gap-4">
                                <div className="grid gap-1.5 flex-1">
                                    <Input 
                                        type="password"
                                        placeholder="Enter your Interakt API Secret Key"
                                        value={interaktApiKey}
                                        onChange={(e) => setInteraktApiKey(e.target.value)}
                                        disabled={isSubmittingInteraktApi}
                                    />
                                </div>
                                <div className="flex gap-2">
                                     <Button variant="secondary" onClick={() => setIsEditingInteraktApi(false)} disabled={isSubmittingInteraktApi}>Cancel</Button>
                                     <Button onClick={() => handleSaveInterakt('apiKey')} disabled={isSubmittingInteraktApi}>
                                        {isSubmittingInteraktApi ? 'Saving...' : 'Save Key'}
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                     {/* Interakt Webhook Key */}
                    <div className="border-t p-6">
                         <div className="flex items-center justify-between">
                            <div>
                                <h4 className="font-semibold">Webhook Secret Key</h4>
                                <p className="text-sm text-muted-foreground">Used for receiving incoming message events.</p>
                            </div>
                            <div className="flex items-center gap-4">
                                {hasInteraktWebhookKey && !isEditingInteraktWebhook ? (
                                    <Button variant="outline" onClick={() => setIsEditingInteraktWebhook(true)}>Change Key</Button>
                                ) : (
                                    <Button variant="outline" onClick={() => setIsEditingInteraktWebhook(true)} disabled={!hasConnectedStore}>
                                        {hasConnectedStore ? 'Set Key' : 'No Store'}
                                    </Button>
                                )}
                            </div>
                        </div>
                        {isEditingInteraktWebhook && (
                          <div className="mt-4 space-y-6">
                            <div>
                              <h5 className="font-medium text-sm mb-2">Setup Instructions:</h5>
                              <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                                <li>Go to Interakt Dashboard &gt; Settings &gt; Developer Settings &gt; Configure &gt; Webhook.</li>
                                <li>
                                  <div className="flex items-center gap-2">
                                    <span>Paste this URL in the "Webhook url" box:</span>
                                    <div className="flex items-center gap-1 rounded-md bg-background border px-2 py-1">
                                      <code className="text-xs">{appUrl}/api/webhooks/interakt?shop={userData?.activeAccountId}</code>
                                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToClipboard(`${appUrl}/api/webhooks/interakt?shop=${encodeURIComponent(userData?.activeAccountId || "")}`)}>
                                        <Copy className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  </div>
                                </li>
                                <li>Copy the "Secret Key" provided by Interakt.</li>
                                <li>Paste the Secret Key below and click Save.</li>
                              </ol>
                            </div>
                            <div className="flex items-end gap-4">
                                <div className="grid gap-1.5 flex-1">
                                    <Input 
                                        type="password"
                                        placeholder="Paste your Interakt Webhook Secret Key"
                                        value={interaktWebhookKey}
                                        onChange={(e) => setInteraktWebhookKey(e.target.value)}
                                        disabled={isSubmittingInteraktWebhook}
                                    />
                                </div>
                                <div className="flex gap-2">
                                     <Button variant="secondary" onClick={() => setIsEditingInteraktWebhook(false)} disabled={isSubmittingInteraktWebhook}>Cancel</Button>
                                     <Button onClick={() => handleSaveInterakt('webhookKey')} disabled={isSubmittingInteraktWebhook}>
                                        {isSubmittingInteraktWebhook ? 'Saving...' : 'Save Key'}
                                    </Button>
                                </div>
                            </div>
                          </div>
                        )}
                    </div>
                 </div>
            </section>
        </CardContent>
      </Card>
    </div>
    </TooltipProvider>
  )
}