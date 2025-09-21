
'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Lightbulb, AlertTriangle } from 'lucide-react';

interface WhatsAppBodyEditorProps {
  value: string;
  onChange: (value: string) => void;
  onValidationChange: (isValid: boolean) => void;
  characterLimit?: number;
}

const parseVariables = (text: string): number[] => {
  const matches = text.match(/\{\{(\d+)\}\}/g) || [];
  return matches.map(v => parseInt(v.replace(/[{}]/g, ''), 10));
};

export function WhatsAppBodyEditor({
  value,
  onChange,
  onValidationChange,
  characterLimit = 1024,
}: WhatsAppBodyEditorProps) {
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const validate = useCallback((text: string) => {
    const variables = parseVariables(text);
    if (variables.length > 0) {
      const maxVar = Math.max(...variables);
      const expectedVars = Array.from({ length: maxVar }, (_, i) => i + 1);
      const missing = expectedVars.filter(v => !variables.includes(v));

      if (missing.length > 0) {
        setError(`Missing variables: ${missing.join(', ')}. Variables must be sequential.`);
        onValidationChange(false);
        return false;
      }

      if (new Set(variables).size !== variables.length) {
        setError('Duplicate variables found. Each variable number must be unique.');
        onValidationChange(false);
        return false;
      }
    }

    if (text.length > characterLimit) {
        setError(`Character limit of ${characterLimit} exceeded.`);
        onValidationChange(false);
        return false;
    }
    
    setError(null);
    onValidationChange(true);
    return true;
  }, [characterLimit, onValidationChange]);

  useEffect(() => {
    validate(value);
  }, [value, validate]);

  const addVariable = () => {
    const existingVars = parseVariables(value);
    const nextVarNumber = existingVars.length > 0 ? Math.max(...existingVars) + 1 : 1;
    const variable = `{{${nextVarNumber}}}`;
    const textarea = textareaRef.current;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newValue = value.substring(0, start) + variable + value.substring(end);
      onChange(newValue);
      
      // Move cursor after the inserted variable
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + variable.length;
        textarea.focus();
      }, 0);
    }
  };
  
  const fixVariables = () => {
    let varIndex = 1;
    const fixedValue = value.replace(/\{\{(\d+)\}\}/g, () => `{{${varIndex++}}}`);
    onChange(fixedValue);
  };
  
  const renderPreview = () => {
    const parts = value.split(/(\{\{\d+\}\})/g).filter(Boolean);
    return parts.map((part, index) => {
        if (/\{\{(\d+)\}\}/.test(part)) {
            return <Badge key={index} variant="secondary" className="font-mono">{part}</Badge>;
        }
        return <span key={index}>{part}</span>;
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-2">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Enter your message body here... e.g. Hi {{1}}, your order has been confirmed."
          className="min-h-[120px] font-mono text-sm"
        />
        <div className="flex justify-between items-center text-xs text-muted-foreground">
          <Button type="button" variant="outline" size="sm" onClick={addVariable}>
            + Add Variable
          </Button>
          <span>{value.length} / {characterLimit}</span>
        </div>
      </div>
      
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Validation Error</AlertTitle>
          <AlertDescription>
            {error}
            <Button variant="link" size="sm" className="p-0 h-auto ml-2" onClick={fixVariables}>
                Click here to auto-fix variable sequence.
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div>
        <h4 className="font-medium text-sm mb-2">Live Preview</h4>
        <div className="p-4 rounded-md border bg-muted min-h-[80px] text-sm whitespace-pre-wrap">
            {renderPreview()}
        </div>
      </div>

       <Alert>
         <Lightbulb className="h-4 w-4" />
         <AlertTitle>What are variables?</AlertTitle>
         <AlertDescription>
           Variables (like <code>{'{{1}}'}</code>) are placeholders that will be replaced with dynamic information when the message is sent. They must start from <code>{'{{1}}'}</code> and be sequential.
         </AlertDescription>
       </Alert>
    </div>
  );
}
