
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { WhatsAppBodyEditor } from './whatsapp-body-editor';
import { Loader2, FileUp } from 'lucide-react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import { Badge } from './ui/badge';

interface CreateTemplateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  shopId: string;
}

const MAX_FILE_SIZES = {
  IMAGE: 5 * 1024 * 1024, // 5MB
  VIDEO: 16 * 1024 * 1024, // 16MB
  DOCUMENT: 100 * 1024 * 1024, // 100MB
};

const ACCEPTED_FILE_TYPES = {
  IMAGE: 'image/jpeg, image/png, image/gif',
  VIDEO: 'video/mp4, video/3gpp',
  DOCUMENT: 'application/pdf',
};

// Zod schema for form validation
const formSchema = z.object({
  templateName: z.string().trim().min(1, 'Template name is required').max(512, 'Template name is too long'),
  templateCategory: z.enum(['MARKETING', 'UTILITY', 'AUTHENTICATION'], { required_error: 'Category is required' }),
  buttonType: z.enum(['NONE', 'WITH_BUTTONS']).default('NONE'),
  templateLanguage: z.string().default('en'),
  headerType: z.enum(['NONE', 'TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT']).default('NONE'),
  headerText: z.string().max(60, 'Header text cannot exceed 60 characters').optional(),
  headerFile: z.any().optional(),
  bodyText: z.string().trim().min(1, 'Template body is required').max(1024, 'Body is too long'),
  footerText: z.string().max(60, 'Footer text cannot exceed 60 characters').optional(),
  
  // Button configurations
  hasCopyCode: z.boolean().default(false),
  copyCodeText: z.string().optional(),

  hasUrl: z.boolean().default(false),
  urlText: z.string().optional(),
  urlLink: z.string().optional(),

  hasQuickReply: z.boolean().default(false),
  quickReplyText: z.string().optional(),

  hasCall: z.boolean().default(false),
  callPhoneNumber: z.string().optional(),
})
.refine(data => {
    if (data.headerType === 'TEXT') return data.headerText && data.headerText.trim().length > 0;
    return true;
}, { message: 'Header text is required when header type is Text.', path: ['headerText'] })
.refine(data => {
    if (data.buttonType === 'WITH_BUTTONS') {
        const anyButtonConfigured = data.hasCopyCode || data.hasUrl || data.hasQuickReply || data.hasCall;
        if (!anyButtonConfigured) return false;
    }
    return true;
}, { message: 'At least one button type must be configured.', path: ['buttonType'] })
.refine(data => !data.hasCopyCode || (data.copyCodeText && data.copyCodeText.trim().length > 0), { message: 'Copy code text is required.', path: ['copyCodeText']})
.refine(data => !data.hasUrl || (data.urlText && data.urlText.trim().length > 0), { message: 'URL text is required.', path: ['urlText']})
.refine(data => !data.hasUrl || (data.urlLink && data.urlLink.trim().length > 0), { message: 'URL link is required.', path: ['urlLink']})
.refine(data => !data.hasQuickReply || (data.quickReplyText && data.quickReplyText.trim().length > 0), { message: 'Quick reply text is required.', path: ['quickReplyText']})
.refine(data => !data.hasCall || (data.callPhoneNumber && data.callPhoneNumber.trim().length > 0), { message: 'Phone number is required.', path: ['callPhoneNumber']});


type FormData = z.infer<typeof formSchema>;

export function CreateTemplateDialog({ isOpen, onClose, shopId }: CreateTemplateDialogProps) {
  const { toast } = useToast();
  const [user] = useAuthState(auth);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBodyValid, setIsBodyValid] = useState(false);
  const [fileName, setFileName] = useState('');

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    mode: 'onChange',
    defaultValues: {
      templateName: '',
      buttonType: 'NONE',
      templateLanguage: 'en',
      headerType: 'NONE',
      bodyText: '',
      hasCopyCode: false,
      hasUrl: false,
      hasQuickReply: false,
      hasCall: false,
    },
  });

  const { register, control, handleSubmit, watch, setValue, formState: { errors, isValid } } = form;

  const headerType = watch('headerType');
  const buttonType = watch('buttonType');

  const canSubmit = useMemo(() => isValid && isBodyValid && !isSubmitting, [isValid, isBodyValid, isSubmitting]);

  const handleValidationChange = useCallback((valid: boolean) => {
    setIsBodyValid(valid);
  }, []);

  const onDialogClose = () => {
    form.reset();
    setIsBodyValid(false);
    setFileName('');
    onClose();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const maxSize = MAX_FILE_SIZES[headerType as keyof typeof MAX_FILE_SIZES];
      if (file.size > maxSize) {
          toast({
              title: "File Too Large",
              description: `The selected file exceeds the ${maxSize / 1024 / 1024}MB limit for ${headerType.toLowerCase()}s.`,
              variant: "destructive"
          });
          e.target.value = ''; // Clear input
          return;
      }

      setValue('headerFile', file);
      setFileName(file.name);
  }

  const onSubmit = async (data: FormData) => {
    if (!user) {
        toast({ title: 'Not Authenticated', variant: 'destructive' });
        return;
    }
    setIsSubmitting(true);
    
    const formDataPayload = new FormData();
    formDataPayload.append('shop', shopId);
    formDataPayload.append('templateData', JSON.stringify(data));
    
    if (data.headerFile) {
        formDataPayload.append('file', data.headerFile);
    }

    try {
        const idToken = await user.getIdToken();
        const response = await fetch('/api/integrations/interakt/templates/create', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${idToken}` },
            body: formDataPayload,
        });

        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.details || 'Failed to create template.');
        }
        
        toast({
            title: 'Template Submitted',
            description: result.message || 'Your template has been submitted for approval.',
        });
        onDialogClose();

    } catch (error) {
        console.error('Template creation error:', error);
        toast({ title: 'Submission Failed', description: error instanceof Error ? error.message : 'An unknown error occurred.', variant: 'destructive'});
    } finally {
        setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onDialogClose()}>
      <DialogContent className="max-w-4xl h-full md:h-auto flex flex-col">
        <DialogHeader>
          <DialogTitle>Create a new WhatsApp Template</DialogTitle>
          <DialogDescription>Design and submit a new template for approval by WhatsApp.</DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit(onSubmit)} className="flex-1 min-h-0 flex flex-col">
          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="space-y-6 py-4">
              {/* Section 1: Name & Category */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="templateName">Template Name</Label>
                  <Input id="templateName" placeholder="e.g. order_confirmation_v2" {...register('templateName')} />
                  {errors.templateName && <p className="text-sm text-destructive mt-1">{errors.templateName.message}</p>}
                </div>
                <div>
                    <Controller
                        name="templateCategory"
                        control={control}
                        render={({ field }) => (
                            <>
                            <Label>Template Category</Label>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <SelectTrigger><SelectValue placeholder="Select a category..." /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="MARKETING">Marketing</SelectItem>
                                    <SelectItem value="UTILITY">Utility</SelectItem>
                                    <SelectItem value="AUTHENTICATION">Authentication</SelectItem>
                                </SelectContent>
                            </Select>
                            </>
                        )}
                    />
                  {errors.templateCategory && <p className="text-sm text-destructive mt-1">{errors.templateCategory.message}</p>}
                </div>
              </div>

              {/* Section 2: Header */}
              <div className="space-y-2">
                <Label>Template Header (Optional)</Label>
                <Controller
                  name="headerType"
                  control={control}
                  render={({ field }) => (
                    <RadioGroup value={field.value} onValueChange={field.onChange} className="flex flex-wrap items-center gap-4">
                      {['NONE', 'TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT'].map(type => (
                        <div key={type} className="flex items-center space-x-2">
                          <RadioGroupItem value={type} id={`header-${type}`} />
                          <Label htmlFor={`header-${type}`} className="capitalize font-normal">{type.toLowerCase()}</Label>
                        </div>
                      ))}
                    </RadioGroup>
                  )}
                />
              </div>

              {headerType === 'TEXT' && (
                <div className="pl-6">
                  <Input placeholder="Enter header text (max 60 chars)..." {...register('headerText')} />
                  {errors.headerText && <p className="text-sm text-destructive mt-1">{errors.headerText.message}</p>}
                </div>
              )}

              {['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerType) && (
                <div className="pl-6">
                    <Label htmlFor="headerFile" className="flex items-center justify-center w-full h-32 px-4 transition bg-background border-2 border-dashed rounded-md appearance-none cursor-pointer hover:border-gray-400 focus:outline-none">
                        <span className="flex items-center space-x-2">
                            <FileUp className="w-6 h-6 text-muted-foreground" />
                            <span className="font-medium text-muted-foreground">
                                {fileName || `Drop a ${headerType.toLowerCase()} file here, or click to select`}
                            </span>
                        </span>
                        <Input id="headerFile" type="file" className="hidden" onChange={handleFileChange} accept={ACCEPTED_FILE_TYPES[headerType as keyof typeof ACCEPTED_FILE_TYPES]} />
                    </Label>
                    {errors.headerFile && <p className="text-sm text-destructive mt-1">{errors.headerFile.message as string}</p>}
                </div>
              )}
              
              {/* Section 3: Body */}
               <Separator />
               <div className="space-y-2">
                    <Controller
                        name="bodyText"
                        control={control}
                        render={({ field }) => (
                            <WhatsAppBodyEditor
                                initialValue={field.value}
                                onTextChange={field.onChange}
                                onValidationChange={handleValidationChange}
                            />
                        )}
                    />
                    {errors.bodyText && <p className="text-sm text-destructive mt-1">{errors.bodyText.message}</p>}
               </div>
               
               {/* Section 4: Footer & Buttons */}
               <Separator />
               <div className="space-y-4">
                    <div>
                        <Label htmlFor="footerText">Template Footer (Optional)</Label>
                        <Input id="footerText" placeholder="e.g. Thanks for shopping with us!" {...register('footerText')} />
                        {errors.footerText && <p className="text-sm text-destructive mt-1">{errors.footerText.message}</p>}
                    </div>

                    <div className="space-y-2">
                        <Label>Buttons (Optional)</Label>
                        <Controller
                            name="buttonType"
                            control={control}
                            render={({ field }) => (
                                <RadioGroup value={field.value} onValueChange={field.onChange} className="flex items-center gap-4">
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="NONE" id="btn-none" />
                                    <Label htmlFor="btn-none" className="font-normal">None</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="WITH_BUTTONS" id="btn-with" />
                                    <Label htmlFor="btn-with" className="font-normal">Copy Code, URL, Quick Replies etc.</Label>
                                </div>
                                </RadioGroup>
                            )}
                        />
                         {errors.buttonType && <p className="text-sm text-destructive mt-1">{errors.buttonType.message as string}</p>}
                    </div>
               </div>

                {buttonType === 'WITH_BUTTONS' && (
                    <div className="pl-6 space-y-4 border-l-2 ml-2">
                        {/* Copy Code */}
                        <div className="flex items-start space-x-2">
                            <Checkbox id="hasCopyCode" {...register('hasCopyCode')} />
                            <div className="grid gap-1.5 leading-none w-full">
                                <label htmlFor="hasCopyCode" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                    Copy Code Button
                                </label>
                                {watch('hasCopyCode') && (
                                    <Input placeholder="Text for the copy code button" {...register('copyCodeText')} className="mt-2" />
                                )}
                            </div>
                        </div>
                        {errors.copyCodeText && <p className="text-sm text-destructive mt-1 pl-8">{errors.copyCodeText.message}</p>}
                        
                        {/* URL */}
                        <div className="flex items-start space-x-2">
                            <Checkbox id="hasUrl" {...register('hasUrl')} />
                            <div className="grid gap-1.5 leading-none w-full">
                                <label htmlFor="hasUrl" className="text-sm font-medium">URL Button</label>
                                {watch('hasUrl') && (
                                    <div className="space-y-2 mt-2">
                                        <Input placeholder="Button text" {...register('urlText')} />
                                        {errors.urlText && <p className="text-sm text-destructive">{errors.urlText.message}</p>}
                                        <Input placeholder="https://example.com/your-url" {...register('urlLink')} />
                                        {errors.urlLink && <p className="text-sm text-destructive">{errors.urlLink.message}</p>}
                                    </div>
                                )}
                            </div>
                        </div>
                         {/* Quick Reply */}
                        <div className="flex items-start space-x-2">
                            <Checkbox id="hasQuickReply" {...register('hasQuickReply')} />
                            <div className="grid gap-1.5 leading-none w-full">
                                <label htmlFor="hasQuickReply" className="text-sm font-medium">Quick Reply Button</label>
                                {watch('hasQuickReply') && (
                                    <Input placeholder="Button text for quick reply" {...register('quickReplyText')} className="mt-2" />
                                )}
                            </div>
                        </div>
                        {errors.quickReplyText && <p className="text-sm text-destructive mt-1 pl-8">{errors.quickReplyText.message}</p>}

                         {/* Call */}
                        <div className="flex items-start space-x-2">
                            <Checkbox id="hasCall" {...register('hasCall')} />
                            <div className="grid gap-1.5 leading-none w-full">
                                <label htmlFor="hasCall" className="text-sm font-medium">Call Button</label>
                                {watch('hasCall') && (
                                    <Input placeholder="Your phone number with country code" {...register('callPhoneNumber')} className="mt-2" />
                                )}
                            </div>
                        </div>
                        {errors.callPhoneNumber && <p className="text-sm text-destructive mt-1 pl-8">{errors.callPhoneNumber.message}</p>}
                    </div>
                )}
            </div>
          </ScrollArea>
          
          <DialogFooter className="mt-6 pt-4 border-t shrink-0">
            <DialogClose asChild>
                <Button type="button" variant="outline">Cancel</Button>
            </DialogClose>
            <Button type="submit" disabled={!canSubmit}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSubmitting ? 'Submitting...' : 'Create Template'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
