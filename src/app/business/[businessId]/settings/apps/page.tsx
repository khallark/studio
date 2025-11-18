// /store/[storeId]/settings/apps/page.tsx

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
import { Info, GripVertical, Loader2, Trash2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';
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
} from "@/components/ui/alert-dialog"
import { Reorder } from "framer-motion"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { doc, onSnapshot } from 'firebase/firestore';
import { useStoreAuthorization } from '@/hooks/use-store-authorization';
import { useParams } from 'next/navigation';
import { useBusinessContext } from '../../layout';

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

// Helper function to merge priority list while preserving order
const mergePriorityList = (savedList: CourierSetting[] | undefined, couriers: CourierIntegrations | undefined): CourierSetting[] => {
    if (!couriers) return [];

    const integrated = Object.keys(couriers).filter(k =>
        !['priorityEnabled', 'priorityList'].includes(k) &&
        couriers?.[k as keyof typeof couriers]
    );

    const orderedList = (savedList || [])
        .filter(item => integrated.includes(item.name))
        .map(item => ({ ...item }));

    const newIntegrated = integrated
        .filter(name => !(savedList || []).some(s => s.name === name))
        .map(name => ({ name, mode: 'Surface' as const }));

    return [...orderedList, ...newIntegrated];
};

export default function AppsSettingsPage() {
    const { isAuthorized, loading: authLoading, user, businessId } = useBusinessContext();

    const { toast } = useToast();

    const [settingsData, setSettingsData] = useState<SettingsData | null>(null);
    const [dataLoading, setDataLoading] = useState(true);
    const [deletingCourier, setDeletingCourier] = useState<string | null>(null);

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

    // 3. Get Settings Data based on Role
    useEffect(() => {
        if (!businessId) {
            if (!authLoading) setDataLoading(false);
            return;
        }

        setDataLoading(true);

        const docRef = doc(db, 'users', businessId);

        const unsub = onSnapshot(docRef, (doc) => {
            if (doc.exists()) {
                const data = doc.data() as SettingsData;
                setSettingsData(data);
                const couriers = data.integrations?.couriers;

                setDelhiveryApiKey(couriers?.delhivery?.apiKey || '');
                setCourierPriorityEnabled(couriers?.priorityEnabled || false);
                const mergedList = mergePriorityList(couriers?.priorityList, couriers);
                setCourierPriorityList(mergedList);

            } else {
                setSettingsData(null);
            }
            setDataLoading(false);
        }, (error) => {
            console.error("Error fetching settings:", error);
            toast({
                title: 'Error Loading Settings',
                description: error.message,
                variant: 'destructive',
            });
            setDataLoading(false);
        });

        return () => unsub();
    }, [businessId, user, toast, authLoading]);



    const updatePrioritySettings = async (enabled: boolean, list: CourierSetting[]) => {
        if (!businessId || !user) return;
        setIsSubmittingPriority(true);
        try {
            const idToken = await user.getIdToken();
            const response = await fetch('/api/integrations/courier/update-priority', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
                body: JSON.stringify({ businessId, enabled, priorityList: list.map(item => ({ name: item.name, mode: item.mode })) })
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

    const handleRemoveCourier = async (courierName: string) => {
        if (!businessId || !user) return;
        setDeletingCourier(courierName);
        try {
            const idToken = await user.getIdToken();
            const response = await fetch('/api/integrations/courier/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
                body: JSON.stringify({ businessId, courierName })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.details || 'Failed to remove integration');

            toast({ title: 'Integration Removed', description: `${courierName} has been disconnected.` });
        } catch (error) {
            toast({ title: 'Removal Failed', description: error instanceof Error ? error.message : 'An unknown error occurred.', variant: "destructive" });
        } finally {
            setDeletingCourier(null);
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
        if (!businessId || !user || !delhiveryApiKey) {
            toast({ title: "API Key is required", variant: "destructive" });
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
                    businessId,
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
        if (!businessId || !user || !shiprocketEmail || !shiprocketPassword) {
            toast({ title: "Email and Password are required", variant: "destructive" });
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
                    businessId,
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
        if (!businessId || !user || !xpressbeesEmail || !xpressbeesPassword) {
            toast({ title: "Email and Password are required", variant: "destructive" });
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
                    businessId,
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

    // const isReadOnly = memberRole === 'Staff';
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

    if (dataLoading || authLoading) {
        return (
            <div className="flex justify-center items-start h-full p-4 md:p-6">
                {renderSkeleton()}
            </div>
        )
    }

    if (!isAuthorized) {
        return null;
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
                                                disabled={isSubmittingPriority || courierPriorityList.length === 0}
                                            />
                                        </div>
                                    </div>
                                </div>
                                {courierPriorityList.length > 0 && (
                                    <div className="border-t bg-muted/50 p-6">
                                        <h4 className="font-medium mb-4">Drag to Reorder Priority</h4>
                                        {isSubmittingPriority && <Loader2 className="h-4 w-4 animate-spin my-2" />}
                                        <Reorder.Group axis="y" values={courierPriorityList} onReorder={(list) => {
                                            setCourierPriorityList(list);
                                            updatePrioritySettings(courierPriorityEnabled, list);
                                        }} className="space-y-2">
                                            {courierPriorityList.map((courier) => (
                                                <Reorder.Item
                                                    key={courier.name}
                                                    value={courier}
                                                    className="flex items-center gap-4 p-3 rounded-md bg-background border shadow-sm cursor-grab active:cursor-grabbing"
                                                >
                                                    <GripVertical className="h-5 w-5 text-muted-foreground" />
                                                    <span className="font-medium capitalize flex-1">{courier.name}</span>
                                                    {courier.name !== 'shiprocket' && (
                                                        <Select
                                                            value={courier.mode}
                                                            onValueChange={(value: 'Surface' | 'Express') => handlePriorityModeChange(courier.name, value)}
                                                            // disabled={isReadOnly}
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
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button variant="destructive" size="icon" disabled={deletingCourier === 'delhivery'}>
                                                            {deletingCourier === 'delhivery' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                                        </Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                                            <AlertDialogDescription>
                                                                This will disconnect your Delhivery integration and remove it from your priority list. This action cannot be undone.
                                                            </AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                            <AlertDialogAction onClick={() => handleRemoveCourier('delhivery')}>Remove</AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            </>
                                        ) : (
                                            <Button variant="outline" onClick={() => setIsEditingDelhivery(true)}>
                                                Connect
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
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button variant="destructive" size="icon" disabled={deletingCourier === 'shiprocket'}>
                                                            {deletingCourier === 'shiprocket' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                                        </Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                                            <AlertDialogDescription>
                                                                This will disconnect your Shiprocket integration and remove it from your priority list. This action cannot be undone.
                                                            </AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                            <AlertDialogAction onClick={() => handleRemoveCourier('shiprocket')}>Remove</AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            </>
                                        ) : (
                                            <Button variant="outline" onClick={() => setIsEditingShiprocket(true)}>
                                                Connect
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
                                                <Button variant="secondary" onClick={() => { setIsEditingShiprocket(false); setShiprocketEmail(''); setShiprocketPassword(''); }} disabled={isSubmittingShiprocket}>
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
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button variant="destructive" size="icon" disabled={deletingCourier === 'xpressbees'}>
                                                            {deletingCourier === 'xpressbees' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                                        </Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                                            <AlertDialogDescription>
                                                                This will disconnect your Xpressbees integration and remove it from your priority list. This action cannot be undone.
                                                            </AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                            <AlertDialogAction onClick={() => handleRemoveCourier('xpressbees')}>Remove</AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            </>
                                        ) : (
                                            <Button variant="outline" onClick={() => setIsEditingXpressbees(true)}>
                                                Connect
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
                                                <Button variant="secondary" onClick={() => { setIsEditingXpressbees(false); setXpressbeesEmail(''); setXpressbeesPassword(''); }} disabled={isSubmittingXpressbees}>
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
