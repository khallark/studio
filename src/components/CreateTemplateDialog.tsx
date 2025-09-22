'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, Plus, RotateCcw, Loader2, Upload } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface CreateTemplateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  activeAccountId: string;
  user: any;
}

interface ButtonConfig {
  type: 'quick_reply' | 'url' | 'phone_number';
  text: string;
  url?: string;
  phoneNumber?: string;
}

interface FormData {
  name: string;
  category: string;
  buttonType: 'none' | 'buttons';
  language: string;
  headerType: 'none' | 'text' | 'image' | 'video' | 'document';
  headerText: string;
  headerFile: File | null;
  headerMediaHandle?: string;
  body: string;
  footer: string;
  buttons: ButtonConfig[];
}

interface ValidationResult {
  isValid: boolean;
  variables: number[];
  uniqueVariables: number[];
  issues: string[];
}

export default function CreateTemplateDialog({ isOpen, onClose, activeAccountId, user }: CreateTemplateDialogProps) {
  const { toast } = useToast();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Form state
  const [formData, setFormData] = useState<FormData>({
    name: '',
    category: '',
    buttonType: 'none',
    language: 'en',
    headerType: 'none',
    headerText: '',
    headerFile: null,
    body: '',
    footer: '',
    buttons: []
  });

  // UI state
  const [bodyValidation, setBodyValidation] = useState<ValidationResult>({ 
    isValid: true, 
    variables: [], 
    uniqueVariables: [], 
    issues: [] 
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitProgress, setSubmitProgress] = useState('');

  // Button configuration state
  const [buttonConfigs, setButtonConfigs] = useState({
    copyCode: { enabled: false, text: '' },
    url: { enabled: false, text: '', link: '' },
    quickReply: { enabled: false, text: '' },
    call: { enabled: false, phoneNumber: '' }
  });

  // Body editor functions
  const parseExistingVariables = (text: string): number[] => {
    const variableRegex = /\{\{(\d+)\}\}/g;
    const matches = [...text.matchAll(variableRegex)];
    return matches.map(match => parseInt(match[1])).sort((a, b) => a - b);
  };

  const getNextVariableNumber = (text: string): number => {
    const existing = parseExistingVariables(text);
    if (existing.length === 0) return 1;
    
    for (let i = 1; i <= existing.length + 1; i++) {
      if (!existing.includes(i)) return i;
    }
    return existing.length + 1;
  };

  const validateVariables = (text: string): ValidationResult => {
    const variables = parseExistingVariables(text) || [];
    
    if (variables.length === 0) {
      return { isValid: true, variables: [], uniqueVariables: [], issues: [] };
    }

    const issues: string[] = [];
    const uniqueVars = [...new Set(variables)].sort((a, b) => a - b);
    
    if (uniqueVars.length > 0 && uniqueVars[0] !== 1) {
      issues.push('Variables should start from {{1}}');
    }
    
    const expectedSequence = Array.from({length: uniqueVars.length}, (_, i) => i + 1);
    const hasGaps = !expectedSequence.every(num => uniqueVars.includes(num));
    if (hasGaps) {
      issues.push('Variables should be sequential (no gaps)');
    }

    return {
      isValid: issues.length === 0,
      variables: variables,
      uniqueVariables: uniqueVars,
      issues: issues || []
    };
  };

  const autoFixVariables = () => {
    const variables = parseExistingVariables(formData.body);
    if (variables.length === 0) return;
    
    const uniqueVars = [...new Set(variables)].sort((a, b) => a - b);
    const mapping: { [key: number]: number } = {};
    uniqueVars.forEach((oldNum, index) => {
      mapping[oldNum] = index + 1;
    });
    
    const fixedText = formData.body.replace(/\{\{(\d+)\}\}/g, (match, num) => {
      return `{{${mapping[parseInt(num)]}}}`;
    });
    
    setFormData(prev => ({ ...prev, body: fixedText }));
  };

  const handleAddVariable = () => {
    if (!textareaRef.current) return;
    
    const textarea = textareaRef.current;
    const cursorPosition = textarea.selectionStart;
    const nextVarNum = getNextVariableNumber(formData.body);
    const variableText = `{{${nextVarNum}}}`;
    
    const newText = 
      formData.body.slice(0, cursorPosition) + 
      variableText + 
      formData.body.slice(cursorPosition);
    
    setFormData(prev => ({ ...prev, body: newText }));
    
    setTimeout(() => {
      textarea.setSelectionRange(
        cursorPosition + variableText.length,
        cursorPosition + variableText.length
      );
      textarea.focus();
    }, 0);
  };

  useEffect(() => {
    setBodyValidation(validateVariables(formData.body));
  }, [formData.body]);

  const renderPreview = () => {
    if (!formData.body) return <span className="text-gray-400">Preview will appear here...</span>;
    
    return formData.body.split(/(\{\{\d+\}\})/g).map((part, index) => {
      if (part.match(/\{\{\d+\}\}/)) {
        return (
          <span
            key={index}
            className={`px-1 py-0.5 rounded text-xs font-mono ${
              bodyValidation.isValid 
                ? 'bg-green-100 text-green-800 border border-green-200' 
                : 'bg-red-100 text-red-800 border border-red-200'
            }`}
          >
            {part}
          </span>
        );
      }
      return <span key={index}>{part}</span>;
    });
  };

  const isFormValid = (): boolean => {
    const nameValid = formData.name.trim().length > 0 && formData.name.trim().length <= 512;
    const categoryValid = formData.category.length > 0;
    const bodyValid = formData.body.trim().length > 0 && formData.body.trim().length <= 1024 && bodyValidation.isValid;
    const headerTextValid = formData.headerType !== 'text' || (formData.headerText.trim().length > 0 && formData.headerText.trim().length <= 60);
    const headerFileValid = !['image', 'video', 'document'].includes(formData.headerType) || formData.headerFile !== null;
    const footerValid = formData.footer.length === 0 || formData.footer.length <= 60;
    
    let buttonValid = true;
    if (formData.buttonType === 'buttons') {
      const enabledButtons = [
        buttonConfigs.copyCode.enabled && buttonConfigs.copyCode.text.trim(),
        buttonConfigs.url.enabled && buttonConfigs.url.text.trim() && buttonConfigs.url.link.trim(),
        buttonConfigs.quickReply.enabled && buttonConfigs.quickReply.text.trim(),
        buttonConfigs.call.enabled && buttonConfigs.call.phoneNumber.trim()
      ].filter(Boolean);
      buttonValid = enabledButtons.length > 0;
    }
    
    return nameValid && categoryValid && bodyValid && headerTextValid && headerFileValid && footerValid && buttonValid;
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setFormData(prev => ({ ...prev, headerFile: file }));
  };

  const buildButtonsArray = (): ButtonConfig[] => {
    const buttons: ButtonConfig[] = [];
    
    if (buttonConfigs.copyCode.enabled && buttonConfigs.copyCode.text.trim()) {
      buttons.push({ type: 'quick_reply', text: buttonConfigs.copyCode.text.trim() });
    }
    if (buttonConfigs.url.enabled && buttonConfigs.url.text.trim() && buttonConfigs.url.link.trim()) {
      buttons.push({ type: 'url', text: buttonConfigs.url.text.trim(), url: buttonConfigs.url.link.trim() });
    }
    if (buttonConfigs.quickReply.enabled && buttonConfigs.quickReply.text.trim()) {
      buttons.push({ type: 'quick_reply', text: buttonConfigs.quickReply.text.trim() });
    }
    if (buttonConfigs.call.enabled && buttonConfigs.call.phoneNumber.trim()) {
      buttons.push({ type: 'phone_number', text: 'Call', phoneNumber: buttonConfigs.call.phoneNumber.trim() });
    }
    
    return buttons;
  };

  // Handle form submission with proper media upload separation
  const handleSubmit = async () => {
    if (!isFormValid() || !user || !activeAccountId) return;
    
    setIsSubmitting(true);
    setSubmitProgress('Preparing template...');
    
    try {
      const idToken = await user.getIdToken();
      
      let templateData = {
        ...formData,
        name: formData.name.trim(),
        body: formData.body.trim(),
        headerText: formData.headerText.trim(),
        footer: formData.footer.trim(),
        buttons: buildButtonsArray()
      };

      // Handle media upload separately if needed
      if (formData.headerFile) {
        setSubmitProgress('Uploading media...');
        
        const uploadFormData = new FormData();
        uploadFormData.append('file', formData.headerFile);
        uploadFormData.append('shop', activeAccountId);
        
        const uploadResponse = await fetch('/api/integrations/interakt/media/upload', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${idToken}`
          },
          body: uploadFormData
        });
        
        if (!uploadResponse.ok) {
          const uploadError = await uploadResponse.json();
          throw new Error(uploadError.details || 'Failed to upload media');
        }
        
        const uploadResult = await uploadResponse.json();
        templateData = {
          ...templateData,
          headerMediaHandle: uploadResult.data.file_handle
        };
      }
      
      setSubmitProgress('Creating template...');
      
      const response = await fetch('/api/integrations/interakt/templates/create', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          shop: activeAccountId,
          templateData
        })
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.details || 'Failed to create template');
      }
      
      toast({
        title: 'Template Created',
        description: 'Your template has been submitted to WhatsApp for approval.',
      });
      
      resetForm();
      onClose();
      
    } catch (error) {
      console.error('Template creation error:', error);
      toast({
        title: 'Creation Failed',
        description: error instanceof Error ? error.message : 'An unknown error occurred.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
      setSubmitProgress('');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      category: '',
      buttonType: 'none',
      language: 'en',
      headerType: 'none',
      headerText: '',
      headerFile: null,
      body: '',
      footer: '',
      buttons: []
    });
    setButtonConfigs({
      copyCode: { enabled: false, text: '' },
      url: { enabled: false, text: '', link: '' },
      quickReply: { enabled: false, text: '' },
      call: { enabled: false, phoneNumber: '' }
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Template</DialogTitle>
          <DialogDescription>
            Create a new WhatsApp message template for your Interakt account.
          </DialogDescription>
        </DialogHeader>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Left Column - Form Fields */}
          <div className="space-y-6">
            {/* Template Name */}
            <div>
              <Label htmlFor="template-name">Template Name *</Label>
              <Input
                id="template-name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Enter template name..."
                maxLength={512}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {formData.name.length}/512 characters
              </p>
            </div>

            {/* Category */}
            <div>
              <Label>Template Category *</Label>
              <Select value={formData.category} onValueChange={(value) => setFormData(prev => ({ ...prev, category: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="marketing">Marketing</SelectItem>
                  <SelectItem value="utility">Utility</SelectItem>
                  <SelectItem value="authentication">Authentication</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Button Type */}
            <div>
              <Label>Button Type (Optional)</Label>
              <RadioGroup 
                value={formData.buttonType} 
                onValueChange={(value: 'none' | 'buttons') => setFormData(prev => ({ ...prev, buttonType: value }))}
                className="mt-2"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="none" id="btn-none" />
                  <Label htmlFor="btn-none">None</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="buttons" id="btn-buttons" />
                  <Label htmlFor="btn-buttons">Copy Code, URL, Quick Replies etc</Label>
                </div>
              </RadioGroup>
            </div>

            {/* Language */}
            <div>
              <Label>Template Language</Label>
              <Select value={formData.language} onValueChange={(value) => setFormData(prev => ({ ...prev, language: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Header */}
            <div>
              <Label>Template Header (Optional)</Label>
              <RadioGroup 
                value={formData.headerType} 
                onValueChange={(value: any) => setFormData(prev => ({ ...prev, headerType: value, headerText: '', headerFile: null }))}
                className="mt-2"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="none" id="header-none" />
                  <Label htmlFor="header-none">None</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="text" id="header-text" />
                  <Label htmlFor="header-text">Text</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="image" id="header-image" />
                  <Label htmlFor="header-image">Image</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="video" id="header-video" />
                  <Label htmlFor="header-video">Video</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="document" id="header-document" />
                  <Label htmlFor="header-document">Document</Label>
                </div>
              </RadioGroup>

              {formData.headerType === 'text' && (
                <div className="mt-3">
                  <Input
                    value={formData.headerText}
                    onChange={(e) => setFormData(prev => ({ ...prev, headerText: e.target.value }))}
                    placeholder="Header text..."
                    maxLength={60}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {formData.headerText.length}/60 characters
                  </p>
                </div>
              )}

              {['image', 'video', 'document'].includes(formData.headerType) && (
                <div className="mt-3">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full"
                    >
                      <Upload className="mr-2 h-4 w-4" />
                      Choose {formData.headerType} file
                    </Button>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    onChange={handleFileChange}
                    accept={
                      formData.headerType === 'image' ? 'image/*' :
                      formData.headerType === 'video' ? 'video/*' :
                      '*/*'
                    }
                    className="hidden"
                  />
                  {formData.headerFile && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Selected: {formData.headerFile.name}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div>
              <Label htmlFor="footer">Template Footer (Optional)</Label>
              <Input
                id="footer"
                value={formData.footer}
                onChange={(e) => setFormData(prev => ({ ...prev, footer: e.target.value }))}
                placeholder="Optional footer text..."
                maxLength={60}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {formData.footer.length}/60 characters
              </p>
            </div>
          </div>

          {/* Right Column - Body & Buttons */}
          <div className="space-y-6">
            {/* Template Body */}
            <div>
              <Label>Template Body *</Label>
              <div className="relative">
                <Textarea
                  ref={textareaRef}
                  value={formData.body}
                  onChange={(e) => setFormData(prev => ({ ...prev, body: e.target.value }))}
                  className="resize-none"
                  rows={6}
                  placeholder="Type your message here. Use {{1}}, {{2}}, etc. for variables or click 'Add Variable' button."
                  maxLength={1024}
                />
              </div>
              
              <div className="flex items-center justify-between mt-2">
                <Button
                  type="button"
                  onClick={handleAddVariable}
                  size="sm"
                  className="flex items-center gap-2"
                >
                  <Plus size={16} />
                  Add Variable
                </Button>
                
                {!bodyValidation.isValid && (
                  <Button
                    type="button"
                    onClick={autoFixVariables}
                    size="sm"
                    variant="outline"
                    className="flex items-center gap-2"
                  >
                    <RotateCcw size={16} />
                    Auto-fix Variables
                  </Button>
                )}
              </div>

              <p className="text-xs text-muted-foreground mt-1">
                {formData.body.length}/1024 characters
              </p>

              {/* Validation Messages */}
              {!bodyValidation.isValid && bodyValidation.issues && bodyValidation.issues.length > 0 && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg mt-2">
                  <AlertTriangle size={20} className="text-red-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-red-800 font-medium">Variable Issues Found:</p>
                    <ul className="text-red-700 text-sm mt-1 space-y-1">
                      {bodyValidation.issues.map((issue, index) => (
                        <li key={index}>• {issue}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Variables Summary */}
              {bodyValidation.uniqueVariables && bodyValidation.uniqueVariables.length > 0 && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg mt-2">
                  <p className="text-blue-800 font-medium mb-2">
                    Unique Variables: {bodyValidation.uniqueVariables.length} | Total Usage: {bodyValidation.variables ? bodyValidation.variables.length : 0}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {bodyValidation.uniqueVariables.map((varNum) => {
                      const count = bodyValidation.variables ? bodyValidation.variables.filter(v => v === varNum).length : 0;
                      return (
                        <span
                          key={varNum}
                          className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm font-mono border relative"
                        >
                          {`{{${varNum}}}`}
                          {count > 1 && (
                            <span className="absolute -top-1 -right-1 bg-green-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                              {count}
                            </span>
                          )}
                        </span>
                      );
                    })}
                  </div>
                  {bodyValidation.variables && bodyValidation.variables.length > bodyValidation.uniqueVariables.length && (
                    <p className="text-blue-700 text-sm mt-2">
                      ✓ Some variables are used multiple times (this is allowed)
                    </p>
                  )}
                </div>
              )}

              {/* Preview */}
              <div className="mt-4">
                <Label className="text-sm font-medium">Preview</Label>
                <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg min-h-[100px] mt-1">
                  <div className="text-gray-800 leading-relaxed">
                    {renderPreview()}
                  </div>
                </div>
              </div>
            </div>

            {/* Button Configuration */}
            {formData.buttonType === 'buttons' && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Button Configuration</CardTitle>
                  <CardDescription>Configure the buttons for your template</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Copy Code */}
                  <div className="flex items-start space-x-3">
                    <Checkbox
                      checked={buttonConfigs.copyCode.enabled}
                      onCheckedChange={(checked) => 
                        setButtonConfigs(prev => ({ 
                          ...prev, 
                          copyCode: { ...prev.copyCode, enabled: !!checked }
                        }))
                      }
                    />
                    <div className="flex-1 space-y-2">
                      <Label>Copy Code</Label>
                      {buttonConfigs.copyCode.enabled && (
                        <Input
                          value={buttonConfigs.copyCode.text}
                          onChange={(e) => 
                            setButtonConfigs(prev => ({ 
                              ...prev, 
                              copyCode: { ...prev.copyCode, text: e.target.value }
                            }))
                          }
                          placeholder="Copy code text"
                        />
                      )}
                    </div>
                  </div>

                  {/* URL */}
                  <div className="flex items-start space-x-3">
                    <Checkbox
                      checked={buttonConfigs.url.enabled}
                      onCheckedChange={(checked) => 
                        setButtonConfigs(prev => ({ 
                          ...prev, 
                          url: { ...prev.url, enabled: !!checked }
                        }))
                      }
                    />
                    <div className="flex-1 space-y-2">
                      <Label>URL</Label>
                      {buttonConfigs.url.enabled && (
                        <>
                          <Input
                            value={buttonConfigs.url.text}
                            onChange={(e) => 
                              setButtonConfigs(prev => ({ 
                                ...prev, 
                                url: { ...prev.url, text: e.target.value }
                              }))
                            }
                            placeholder="URL button text"
                          />
                          <Input
                            value={buttonConfigs.url.link}
                            onChange={(e) => 
                              setButtonConfigs(prev => ({ 
                                ...prev, 
                                url: { ...prev.url, link: e.target.value }
                              }))
                            }
                            placeholder="https://example.com"
                          />
                        </>
                      )}
                    </div>
                  </div>

                  {/* Quick Reply */}
                  <div className="flex items-start space-x-3">
                    <Checkbox
                      checked={buttonConfigs.quickReply.enabled}
                      onCheckedChange={(checked) => 
                        setButtonConfigs(prev => ({ 
                          ...prev, 
                          quickReply: { ...prev.quickReply, enabled: !!checked }
                        }))
                      }
                    />
                    <div className="flex-1 space-y-2">
                      <Label>Quick Reply</Label>
                      {buttonConfigs.quickReply.enabled && (
                        <Input
                          value={buttonConfigs.quickReply.text}
                          onChange={(e) => 
                            setButtonConfigs(prev => ({ 
                              ...prev, 
                              quickReply: { ...prev.quickReply, text: e.target.value }
                            }))
                          }
                          placeholder="Quick reply text"
                        />
                      )}
                    </div>
                  </div>

                  {/* Call */}
                  <div className="flex items-start space-x-3">
                    <Checkbox
                      checked={buttonConfigs.call.enabled}
                      onCheckedChange={(checked) => 
                        setButtonConfigs(prev => ({ 
                          ...prev, 
                          call: { ...prev.call, enabled: !!checked }
                        }))
                      }
                    />
                    <div className="flex-1 space-y-2">
                      <Label>Call</Label>
                      {buttonConfigs.call.enabled && (
                        <Input
                          value={buttonConfigs.call.phoneNumber}
                          onChange={(e) => 
                            setButtonConfigs(prev => ({ 
                              ...prev, 
                              call: { ...prev.call, phoneNumber: e.target.value }
                            }))
                          }
                          placeholder="+1234567890"
                        />
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Progress indicator during submission */}
        {isSubmitting && submitProgress && (
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-blue-800">{submitProgress}</span>
            </div>
          </div>
        )}

        <DialogFooter className="mt-6">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={!isFormValid() || isSubmitting}
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting ? 'Creating...' : 'Create Template'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}