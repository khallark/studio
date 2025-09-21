
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, onSnapshot, collection, Timestamp } from 'firebase/firestore';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { MessageCircle, Settings, Trash2, CheckCircle, Clock, XCircle, AlertTriangle, ChevronDown, Loader2, PlusCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { CreateTemplateDialog } from '@/components/create-interakt-template-dialog';

// --- Types ---
interface UserData {
  activeAccountId: string | null;
}

interface TemplateData {
    id: string;
    result: boolean;
    message: string;
    data: {
        id: string;
        created_at_utc: string;
        modified_at_utc: string;
        created_by_user_id: string | null;
        name: string;
        language: string;
        category: string;
        sub_category: string | null;
        template_category_label: string | null;
        header_format: string | null;
        header: string | null;
        header_handle: any;
        header_handle_file_url: any;
        header_handle_file_name: any;
        header_text: any;
        body: string;
        body_text: any;
        footer: string | null;
        buttons: string;
        button_text: any;
        allow_category_change: boolean;
        limited_time_offer: any;
        autosubmitted_for: any;
        display_name: string;
        organization_id: string;
        approval_status: 'WAITING' | 'APPROVED' | 'REJECTED';
        wa_template_id: string;
        is_archived: boolean;
        channel_type: string;
        is_click_tracking_enabled: boolean;
        allow_delete: boolean;
        rejection_reason: string | null;
    };
    linkedCategory: OrderStatusCategory | null;
    webhookEvents?: any[];
}

type OrderStatusCategory = 'New' | 'Confirmed' | 'Ready To Dispatch' | 'Dispatched';

interface CategorySettings {
    activeTemplateForNew: string | null;
    activeTemplateForConfirmed: string | null;
    activeTemplateForReadyToDispatch: string | null;
    activeTemplateForDispatched: string | null;
}

// --- Constants ---
const CATEGORIES: OrderStatusCategory[] = ['New', 'Confirmed', 'Ready To Dispatch', 'Dispatched'];

// --- Helper Components ---

const TemplateStatusIcon = ({ status }: { status: TemplateData['data']['approval_status'] }) => {
    switch (status) {
        case 'APPROVED': return <CheckCircle className="h-5 w-5 text-green-500" />;
        case 'WAITING': return <Clock className="h-5 w-5 text-yellow-500" />;
        case 'REJECTED': return <XCircle className="h-5 w-5 text-red-500" />;
        default: return <AlertTriangle className="h-5 w-5 text-gray-500" />;
    }
};

// --- Main Component ---

export default function InteraktPage() {
  const [user, userLoading] = useAuthState(auth);
  const { toast } = useToast();

  // State
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [hasKeys, setHasKeys] = useState(false);
  const [templates, setTemplates] = useState<TemplateData[]>([]);
  const [categorySettings, setCategorySettings] = useState<CategorySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewingTemplate, setViewingTemplate] = useState<TemplateData | null>(null);
  const [isUpdatingActive, setIsUpdatingActive] = useState<string | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);


  // 1. Fetch User's Active Account ID and check for keys
  useEffect(() => {
    if (userLoading) return;
    const fetchUserData = async () => {
      if (user) {
        const userRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userRef);
        if (userDoc.exists()) {
          const userData = userDoc.data();
          setActiveAccountId(userData.activeAccountId || null);

          if (userData.activeAccountId) {
            const accountRef = doc(db, 'accounts', userData.activeAccountId);
            const accountDoc = await getDoc(accountRef);
            if (accountDoc.exists()) {
              const accountData = accountDoc.data();
              const interakt = accountData.integrations?.communication?.interakt;
              setHasKeys(!!interakt?.apiKey && !!interakt?.webhookKey);
            }
          }
        }
      }
    };
    fetchUserData();
  }, [user, userLoading]);

  // 2. Listen for real-time updates on templates and category settings
  useEffect(() => {
    if (!activeAccountId || !hasKeys) {
        setLoading(false);
        return;
    }
    
    setLoading(true);
    
    // Snapshot listener for templates
    const templatesRef = collection(db, 'accounts', activeAccountId, 'communications', 'interakt', 'templates');
    const unsubscribeTemplates = onSnapshot(templatesRef, (snapshot) => {
        const fetchedTemplates = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TemplateData));
        setTemplates(fetchedTemplates);
    }, (error) => {
        console.error("Error fetching Interakt templates:", error);
        toast({ title: "Error", description: "Could not fetch templates.", variant: "destructive" });
    });

    // Snapshot listener for category settings
    const settingsRef = doc(db, 'accounts', activeAccountId, 'communications', 'interakt', 'settings', 'category_settings');
    const unsubscribeSettings = onSnapshot(settingsRef, (docSnap) => {
        if (docSnap.exists()) {
            setCategorySettings(docSnap.data() as CategorySettings);
        } else {
            setCategorySettings(null); // No settings document yet
        }
        setLoading(false);
    }, (error) => {
        console.error("Error fetching category settings:", error);
        toast({ title: "Error", description: "Could not fetch category settings.", variant: "destructive" });
        setLoading(false);
    });

    return () => {
        unsubscribeTemplates();
        unsubscribeSettings();
    };
  }, [activeAccountId, hasKeys, toast]);


  const templatesByCategory = useMemo(() => {
    return CATEGORIES.reduce((acc, category) => {
        acc[category] = templates.filter(t => t.linkedCategory === category);
        return acc;
    }, {} as Record<OrderStatusCategory, TemplateData[]>);
  }, [templates]);

  const activeTemplatesMap = useMemo(() => {
    if (!categorySettings) return {};
    return {
        'New': categorySettings.activeTemplateForNew,
        'Confirmed': categorySettings.activeTemplateForConfirmed,
        'Ready To Dispatch': categorySettings.activeTemplateForReadyToDispatch,
        'Dispatched': categorySettings.activeTemplateForDispatched,
    };
  }, [categorySettings])

    const handleSetActiveTemplate = useCallback(async (category: OrderStatusCategory, templateId: string | null) => {
        if (!activeAccountId || !user) return;
        
        setIsUpdatingActive(category);
        try {
            const idToken = await user.getIdToken();
            const response = await fetch('/api/integrations/interakt/templates/set-active', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({ shop: activeAccountId, category, templateId }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.details || 'Failed to set active template');
            
            toast({
                title: 'Active Template Updated',
                description: `Successfully updated the active template for ${category}.`
            });
        } catch (error) {
            console.error('Set active template error:', error);
            toast({
                title: 'Update Failed',
                description: error instanceof Error ? error.message : 'An unknown error occurred.',
                variant: 'destructive',
            });
        } finally {
            setIsUpdatingActive(null);
        }
    }, [activeAccountId, user, toast]);

  const renderContent = () => {
    if (loading || userLoading) {
      return (
        <Card className="w-full max-w-6xl">
            <CardHeader>
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-4 w-72" />
            </CardHeader>
            <CardContent>
                <Skeleton className="h-64 w-full" />
            </CardContent>
        </Card>
      );
    }

    if (!activeAccountId || !hasKeys) {
         return (
             <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm min-h-[400px] w-full max-w-4xl">
                <div className="flex flex-col items-center gap-2 text-center p-4">
                    <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
                        <MessageCircle className="h-10 w-10 text-primary" />
                    </div>
                    <h3 className="text-2xl font-bold tracking-tight font-headline">
                        Connect Interakt
                    </h3>
                    <p className="text-sm text-muted-foreground max-w-sm">
                        To manage your templates, you must provide both the API Secret Key and Webhook Secret Key in settings.
                    </p>
                    <Button className="mt-4" asChild>
                        <Link href="/settings/apps">
                            <Settings className="mr-2 h-4 w-4"/>
                            Go to Settings
                        </Link>
                    </Button>
                </div>
            </div>
        )
    }

    // Main content when Interakt is connected
    return (
        <div className="w-full max-w-7xl grid lg:grid-cols-5 gap-8">
            {/* Left side: All Templates */}
            <div className="lg:col-span-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                            <CardTitle>All Message Templates</CardTitle>
                            <CardDescription>View and manage all your synced Interakt templates.</CardDescription>
                        </div>
                        <Button onClick={() => setIsCreateDialogOpen(true)}>
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Create New Template
                        </Button>
                    </CardHeader>
                    <CardContent>
                        <ScrollArea className="h-[60vh]">
                            <div className="space-y-3 pr-4">
                                {templates.length > 0 ? templates.map(template => (
                                    <div key={template.id} onClick={() => setViewingTemplate(template)} className="rounded-lg border p-4 flex items-center justify-between cursor-pointer hover:bg-muted/50 transition-colors">
                                        <div className="flex items-center gap-4">
                                            <TemplateStatusIcon status={template.data.approval_status} />
                                            <div>
                                                <p className="font-semibold">{template.data.name}</p>
                                                <p className="text-sm text-muted-foreground">{template.data.category} &bull; {template.data.language.toUpperCase()}</p>
                                            </div>
                                        </div>
                                        <div>
                                            {template.linkedCategory ? (
                                                <Badge variant="secondary">{template.linkedCategory}</Badge>
                                            ): (
                                                <Badge variant="outline">Uncategorized</Badge>
                                            )}
                                        </div>
                                    </div>
                                )) : (
                                    <div className="text-center py-10 text-muted-foreground">
                                        No templates found. They will appear here once created in Interakt.
                                    </div>
                                )}
                            </div>
                        </ScrollArea>
                    </CardContent>
                </Card>
            </div>

            {/* Right side: Categories */}
            <div className="lg:col-span-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Message Categories</CardTitle>
                        <CardDescription>Assign templates to order statuses and set one as active for sending messages.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Accordion type="multiple" className="w-full">
                            {CATEGORIES.map(category => (
                                <AccordionItem key={category} value={category}>
                                    <AccordionTrigger className="text-lg font-medium flex items-center gap-2">
                                        {category}
                                        {isUpdatingActive === category && <Loader2 className="h-4 w-4 animate-spin" />}
                                    </AccordionTrigger>
                                    <AccordionContent>
                                        <div className="space-y-4 pt-2">
                                            {templatesByCategory[category].length > 0 ? (
                                                <RadioGroup 
                                                    value={activeTemplatesMap[category] || 'none'} 
                                                    onValueChange={(templateId) => handleSetActiveTemplate(category, templateId === 'none' ? null : templateId)}
                                                    disabled={isUpdatingActive === category}
                                                >
                                                    <div className="flex items-center space-x-2">
                                                        <RadioGroupItem value="none" id={`${category}-none`} />
                                                        <Label htmlFor={`${category}-none`}>None</Label>
                                                    </div>
                                                    {templatesByCategory[category].map(template => {
                                                        const isApproved = template.data.approval_status === 'APPROVED';
                                                        return (
                                                            <div key={template.id} className="flex items-center space-x-2">
                                                                <RadioGroupItem 
                                                                    value={template.id} 
                                                                    id={`${category}-${template.id}`} 
                                                                    disabled={!isApproved}
                                                                />
                                                                <Label 
                                                                    htmlFor={`${category}-${template.id}`} 
                                                                    onClick={() => setViewingTemplate(template)} 
                                                                    className={cn(
                                                                        "cursor-pointer hover:underline",
                                                                        !isApproved && "text-muted-foreground cursor-not-allowed hover:no-underline"
                                                                    )}
                                                                >
                                                                    {template.data.name}
                                                                </Label>
                                                            </div>
                                                        )
                                                    })}
                                                </RadioGroup>
                                            ) : (
                                                <p className="text-sm text-muted-foreground text-center py-4">No templates assigned to this category.</p>
                                            )}
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>
                            ))}
                        </Accordion>
                    </CardContent>
                </Card>
            </div>
             {viewingTemplate && (
                <TemplateDetailDialog
                    template={viewingTemplate}
                    isOpen={!!viewingTemplate}
                    onClose={() => setViewingTemplate(null)}
                    shopId={activeAccountId}
                    user={user}
                />
            )}
            {activeAccountId && (
                <CreateTemplateDialog
                    isOpen={isCreateDialogOpen}
                    onClose={() => setIsCreateDialogOpen(false)}
                    shopId={activeAccountId}
                />
            )}
        </div>
    );
  };

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6 items-center justify-center">
      {renderContent()}
    </main>
  );
}

// --- Detail Dialog Component ---
interface TemplateDetailDialogProps {
    template: TemplateData;
    isOpen: boolean;
    onClose: () => void;
    shopId: string;
    user: any; // Firebase user object
}

function TemplateDetailDialog({ template, isOpen, onClose, shopId, user }: TemplateDetailDialogProps) {
    const { toast } = useToast();
    const [selectedCategory, setSelectedCategory] = useState<OrderStatusCategory | 'null'>(template.linkedCategory || 'null');
    const [isUpdating, setIsUpdating] = useState(false);

    useEffect(() => {
        setSelectedCategory(template.linkedCategory || 'null');
    }, [template]);

    const handleCategoryChange = useCallback(async () => {
        if (!shopId || !user) return;
        
        setIsUpdating(true);
        try {
            const idToken = await user.getIdToken();
            const response = await fetch('/api/integrations/interakt/templates/update-category', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({
                    shop: shopId,
                    templateId: template.id,
                    category: selectedCategory === 'null' ? null : selectedCategory,
                }),
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.details || 'Failed to update category');

            toast({
                title: "Category Updated",
                description: `Template moved to ${selectedCategory === 'null' ? 'Uncategorized' : selectedCategory}.`
            });
            onClose();

        } catch (error) {
            console.error('Update category error:', error);
            toast({
                title: 'Update Failed',
                description: error instanceof Error ? error.message : 'An unknown error occurred.',
                variant: 'destructive',
            });
        } finally {
            setIsUpdating(false);
        }
    }, [shopId, user, template.id, selectedCategory, toast, onClose]);

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-4">
                        <span>{template.data.name}</span>
                        <Badge variant="outline">{template.data.approval_status}</Badge>
                    </DialogTitle>
                    <DialogDescription>
                        Template ID: {template.id}
                    </DialogDescription>
                </DialogHeader>

                <div className="grid md:grid-cols-2 gap-6 max-h-[60vh] overflow-y-auto p-1">
                    <div className="space-y-6">
                        <h3 className="font-semibold text-lg">Template Content</h3>
                        <div className="space-y-4 text-sm">
                            {template.data.header && (
                                <div>
                                    <h4 className="font-medium text-gray-500">Header</h4>
                                    <p className="p-3 bg-muted rounded-md mt-1 font-mono text-xs">{template.data.header}</p>
                                </div>
                            )}
                             <div>
                                <h4 className="font-medium text-gray-500">Body</h4>
                                <p className="p-3 bg-muted rounded-md mt-1 font-mono text-xs whitespace-pre-wrap">{template.data.body}</p>
                            </div>
                            {template.data.footer && (
                                 <div>
                                    <h4 className="font-medium text-gray-500">Footer</h4>
                                    <p className="p-3 bg-muted rounded-md mt-1 font-mono text-xs">{template.data.footer}</p>
                                </div>
                            )}
                             {template.data.rejection_reason && (
                                 <div>
                                    <h4 className="font-medium text-red-600">Rejection Reason</h4>
                                    <p className="p-3 bg-destructive/10 text-destructive rounded-md mt-1 text-xs">{template.data.rejection_reason}</p>
                                </div>
                            )}
                        </div>
                    </div>
                     <div className="space-y-6">
                        <h3 className="font-semibold text-lg">Configuration</h3>
                        <div className="space-y-2">
                             <Label>Assign to Category</Label>
                             <Select value={selectedCategory} onValueChange={(value) => setSelectedCategory(value as OrderStatusCategory | 'null')} disabled={isUpdating}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select a category..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="null">Uncategorized</SelectItem>
                                    <Separator className="my-1" />
                                    {CATEGORIES.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                         <Button onClick={handleCategoryChange} disabled={selectedCategory === (template.linkedCategory || 'null') || isUpdating}>
                            {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {isUpdating ? 'Saving...' : 'Save Category Change'}
                         </Button>
                     </div>
                </div>

                <DialogFooter className="mt-4">
                    <Button variant="destructive" onClick={() => toast({title: "Not implemented", description: "Delete functionality is coming soon."})}>
                        <Trash2 className="mr-2 h-4 w-4" /> Delete Template
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
