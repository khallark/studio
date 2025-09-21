
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';

import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { WhatsAppBodyEditor } from '@/components/whatsapp-body-editor';
import { Loader2, Plus, Trash2 } from 'lucide-react';

const templateCategories = ["UTILITY", "MARKETING", "AUTHENTICATION"];
const languages = ["en"]; // For now, only English

const formSchema = z.object({
  templateName: z.string().trim().min(1, 'Template name is required.'),
  templateCategory: z.enum(templateCategories as [string, ...string[]], {
    errorMap: () => ({ message: 'Please select a template category.' }),
  }),
  language: z.enum(languages as [string, ...string[]]),

  headerType: z.enum(['NONE', 'TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT']),
  headerText: z.string().max(60, 'Header text cannot exceed 60 characters.').optional(),
  headerFile: z.any().optional(),

  bodyText: z.string().trim().min(1, 'Template body cannot be empty.'),
  
  footerText: z.string().max(60, 'Footer text cannot exceed 60 characters.').optional(),

  buttonType: z.enum(['NONE', 'COPY_CODE', 'URL_QUICK_REPLIES']),
  copyCodeText: z.string().optional(),
  
  quickReplies: z.array(z.string().trim().min(1)).max(3).optional(),
  
  callToActionUrlText: z.string().optional(),
  callToActionUrl: z.string().url().optional(),

  callToActionPhoneText: z.string().optional(),
  callToActionPhone: z.string().optional(),
});


type FormData = z.infer<typeof formSchema>;

interface CreateTemplateDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateTemplateDialog({ isOpen, onClose }: CreateTemplateDialogProps) {
  const [user] = useAuthState(auth);
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBodyValid, setIsBodyValid] = useState(false);

  const {
    register, handleSubmit, control, watch, setValue, formState: { errors, isValid }, reset,
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    mode: 'onChange',
    defaultValues: {
      language: 'en',
      headerType: 'NONE',
      buttonType: 'NONE',
      quickReplies: ['']
    },
  });

  const headerType = watch('headerType');
  const buttonType = watch('buttonType');
  const quickReplies = watch('quickReplies') || [''];

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true);
    
    if (!user) {
        toast({ title: "Not authenticated", variant: "destructive"});
        setIsSubmitting(false);
        return;
    }

    const formData = new FormData();
    formData.append('templateName', data.templateName);
    formData.append('templateCategory', data.templateCategory);
    formData.append('language', data.language);
    formData.append('headerType', data.headerType);
    if(data.headerText) formData.append('headerText', data.headerText);
    if(data.headerFile?.[0]) formData.append('headerFile', data.headerFile[0]);
    formData.append('bodyText', data.bodyText);
    if(data.footerText) formData.append('footerText', data.footerText);
    formData.append('buttonType', data.buttonType);
    if(data.copyCodeText) formData.append('copyCodeText', data.copyCodeText);
    if(data.quickReplies) {
        data.quickReplies.filter(qr => qr.trim()).forEach(qr => formData.append('quickReplies[]', qr));
    }
    if(data.callToActionUrlText) formData.append('callToActionUrlText', data.callToActionUrlText);
    if(data.callToActionUrl) formData.append('callToActionUrl', data.callToActionUrl);
    if(data.callToActionPhoneText) formData.append('callToActionPhoneText', data.callToActionPhoneText);
    if(data.callToActionPhone) formData.append('callToActionPhone', data.callToActionPhone);

    try {
        const idToken = await user.getIdToken();
        const response = await fetch('/api/integrations/interakt/templates/create', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${idToken}`
            },
            body: formData,
        });

        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.details || 'Failed to create template');
        }

        toast({ title: 'Template Creation Started', description: 'Your template has been submitted for approval.' });
        onClose();

    } catch (error) {
        console.error("Template creation failed:", error);
        toast({ title: 'Creation Failed', description: error instanceof Error ? error.message : 'An unknown error occurred', variant: 'destructive' });
    } finally {
        setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (!isOpen) {
        reset();
        setIsBodyValid(false);
    }
  }, [isOpen, reset]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Create a new Message Template</DialogTitle>
          <DialogDescription>Design and submit a new template for WhatsApp messaging.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <ScrollArea className="max-h-[70vh] p-1 pr-6">
            <div className="space-y-6 p-4">
              {/* Template Name & Category */}
              <div className="grid md:grid-cols-2 gap-4">
                 <div>
                    <Label htmlFor="templateName">Template Name</Label>
                    <Input id="templateName" {...register('templateName')} placeholder="e.g. order_confirmation" />
                    {errors.templateName && <p className="text-destructive text-xs mt-1">{errors.templateName.message}</p>}
                </div>
                <div>
                    <Label>Template Category</Label>
                    <Controller
                        control={control}
                        name="templateCategory"
                        render={({ field }) => (
                            <Select onValueChange={field.onChange} value={field.value}>
                                <SelectTrigger><SelectValue placeholder="Select a category..." /></SelectTrigger>
                                <SelectContent>
                                    {templateCategories.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        )}
                    />
                     {errors.templateCategory && <p className="text-destructive text-xs mt-1">{errors.templateCategory.message}</p>}
                </div>
              </div>
              
               <Separator />
               
              {/* Header */}
              <div>
                <Label>Header (Optional)</Label>
                <Controller
                    name="headerType"
                    control={control}
                    render={({ field }) => (
                        <RadioGroup value={field.value} onValueChange={field.onChange} className="mt-2 flex flex-wrap gap-4">
                            <div className="flex items-center space-x-2"><RadioGroupItem value="NONE" id="h-none" /><Label htmlFor="h-none">None</Label></div>
                            <div className="flex items-center space-x-2"><RadioGroupItem value="TEXT" id="h-text" /><Label htmlFor="h-text">Text</Label></div>
                            <div className="flex items-center space-x-2"><RadioGroupItem value="IMAGE" id="h-image" /><Label htmlFor="h-image">Image</Label></div>
                            <div className="flex items-center space-x-2"><RadioGroupItem value="VIDEO" id="h-video" /><Label htmlFor="h-video">Video</Label></div>
                            <div className="flex items-center space-x-2"><RadioGroupItem value="DOCUMENT" id="h-doc" /><Label htmlFor="h-doc">Document</Label></div>
                        </RadioGroup>
                    )}
                />
                {headerType === 'TEXT' && (
                    <div className="mt-4">
                        <Input {...register('headerText')} placeholder="Enter header text (max 60 characters)" />
                        {errors.headerText && <p className="text-destructive text-xs mt-1">{errors.headerText.message}</p>}
                    </div>
                )}
                {(headerType === 'IMAGE' || headerType === 'VIDEO' || headerType === 'DOCUMENT') && (
                    <div className="mt-4">
                        <Input type="file" {...register('headerFile')} accept={headerType === 'IMAGE' ? 'image/png, image/jpeg' : headerType === 'VIDEO' ? 'video/mp4' : 'application/pdf'} />
                        <p className="text-xs text-muted-foreground mt-1">
                            {headerType === 'IMAGE' && 'Max 5MB (JPG, PNG).'}
                            {headerType === 'VIDEO' && 'Max 16MB (MP4).'}
                            {headerType === 'DOCUMENT' && 'Max 100MB (PDF).'}
                        </p>
                         {errors.headerFile && <p className="text-destructive text-xs mt-1">{errors.headerFile.message as string}</p>}
                    </div>
                )}
              </div>
              
              <Separator />

              {/* Body */}
              <div>
                <Label>Body</Label>
                <Controller 
                    name="bodyText"
                    control={control}
                    render={({ field }) => (
                         <WhatsAppBodyEditor 
                            value={field.value || ''}
                            onChange={field.onChange}
                            onValidationChange={setIsBodyValid}
                         />
                    )}
                />
                {errors.bodyText && <p className="text-destructive text-xs mt-1">{errors.bodyText.message}</p>}
              </div>

               <Separator />

              {/* Footer */}
              <div>
                <Label htmlFor="footerText">Footer (Optional)</Label>
                <Input id="footerText" {...register('footerText')} placeholder="Enter footer text (max 60 characters)" />
                 {errors.footerText && <p className="text-destructive text-xs mt-1">{errors.footerText.message}</p>}
              </div>

              <Separator />

              {/* Buttons */}
              <div>
                 <Label>Buttons (Optional)</Label>
                 <Controller
                    name="buttonType"
                    control={control}
                    render={({ field }) => (
                         <RadioGroup value={field.value} onValueChange={field.onChange} className="mt-2 flex flex-wrap gap-4">
                            <div className="flex items-center space-x-2"><RadioGroupItem value="NONE" id="b-none" /><Label htmlFor="b-none">None</Label></div>
                            <div className="flex items-center space-x-2"><RadioGroupItem value="COPY_CODE" id="b-copy" /><Label htmlFor="b-copy">Copy Code</Label></div>
                            <div className="flex items-center space-x-2"><RadioGroupItem value="URL_QUICK_REPLIES" id="b-url-qr" /><Label htmlFor="b-url-qr">Calls to Action & Quick Replies</Label></div>
                        </RadioGroup>
                    )}
                 />
                 {errors.buttonType && <p className="text-destructive text-xs mt-1">{errors.buttonType.message}</p>}
                 
                 {buttonType === 'COPY_CODE' && (
                     <div className="mt-4 space-y-2">
                        <Label htmlFor="copyCodeText">Button Text</Label>
                        <Input id="copyCodeText" {...register('copyCodeText')} placeholder="e.g. Copy Discount Code" />
                        {errors.copyCodeText && <p className="text-destructive text-xs mt-1">{errors.copyCodeText.message}</p>}
                     </div>
                 )}

                 {buttonType === 'URL_QUICK_REPLIES' && (
                     <div className="mt-4 space-y-4 p-4 border rounded-md">
                        <h4 className="font-semibold">Button Configuration</h4>
                        {/* Quick Replies */}
                        <div className="space-y-2">
                            <Label>Quick Replies (up to 3)</Label>
                            {quickReplies.map((qr, index) => (
                                <div key={index} className="flex items-center gap-2">
                                     <Input 
                                        {...register(`quickReplies.${index}` as const)}
                                        placeholder={`Reply #${index + 1}`}
                                     />
                                     <Button type="button" variant="ghost" size="icon" onClick={() => {
                                         const newQRs = [...quickReplies];
                                         newQRs.splice(index, 1);
                                         setValue('quickReplies', newQRs);
                                     }}>
                                         <Trash2 className="h-4 w-4" />
                                     </Button>
                                </div>
                            ))}
                             {quickReplies.length < 3 && (
                                 <Button type="button" variant="outline" size="sm" onClick={() => setValue('quickReplies', [...quickReplies, ''])}>
                                     <Plus className="mr-2 h-4 w-4" /> Add Quick Reply
                                </Button>
                             )}
                        </div>
                        <Separator />
                        {/* URL CTA */}
                        <div className="space-y-2">
                            <Label>Call to Action: Visit Website (URL)</Label>
                             <div className="grid grid-cols-2 gap-2">
                                 <Input {...register('callToActionUrlText')} placeholder="Button text (e.g. View Order)" />
                                 <Input {...register('callToActionUrl')} placeholder="https://example.com/order/{{1}}" />
                             </div>
                             {errors.callToActionUrl && <p className="text-destructive text-xs mt-1">{errors.callToActionUrl.message}</p>}
                        </div>
                         <Separator />
                        {/* Phone CTA */}
                         <div className="space-y-2">
                            <Label>Call to Action: Call Phone Number</Label>
                             <div className="grid grid-cols-2 gap-2">
                                 <Input {...register('callToActionPhoneText')} placeholder="Button text (e.g. Call Us)" />
                                 <Input {...register('callToActionPhone')} placeholder="+1234567890" />
                             </div>
                        </div>
                     </div>
                 )}
              </div>

            </div>
          </ScrollArea>
          <DialogFooter className="mt-6 border-t pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
            <Button type="submit" disabled={!isValid || !isBodyValid || isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSubmitting ? 'Creating...' : 'Create Template'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
