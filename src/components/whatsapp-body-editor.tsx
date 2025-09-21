
'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Lightbulb, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from './ui/scroll-area';

interface ValidationResult {
  isValid: boolean;
  issues: string[];
}

interface WhatsAppBodyEditorProps {
  initialValue?: string;
  onTextChange: (text: string) => void;
  onValidationChange: (isValid: boolean) => void;
}

const MAX_CHARS = 1024;
const VARIABLE_REGEX = /\{\{(\d+)\}\}/g;

export const WhatsAppBodyEditor = ({ initialValue = '', onTextChange, onValidationChange }: WhatsAppBodyEditorProps) => {
  const [text, setText] = useState(initialValue);
  const [validationResult, setValidationResult] = useState<ValidationResult>({ isValid: true, issues: [] });
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const validate = useCallback((currentText: string) => {
    const issues: string[] = [];
    let isValid = true;

    if (currentText.length > MAX_CHARS) {
      issues.push(`Body is too long (>${MAX_CHARS} chars).`);
      isValid = false;
    }

    const matches = [...currentText.matchAll(VARIABLE_REGEX)];
    if (matches.length > 0) {
      const numbers = matches.map(m => parseInt(m[1], 10));
      const uniqueNumbers = [...new Set(numbers)].sort((a, b) => a - b);
      
      if (uniqueNumbers[0] !== 1) {
        issues.push('Variables must start from {{1}}.');
        isValid = false;
      }
      
      for (let i = 0; i < uniqueNumbers.length; i++) {
        if (uniqueNumbers[i] !== i + 1) {
          issues.push(`Missing variable {{${i + 1}}}. Variables must be sequential.`);
          isValid = false;
          break;
        }
      }
    }
    
    setValidationResult({ isValid, issues });
    onValidationChange(isValid);
  }, [onValidationChange]);

  useEffect(() => {
    validate(text);
  }, [text, validate]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setText(newText);
    onTextChange(newText);
  };

  const addVariable = () => {
    const cursorPosition = textareaRef.current?.selectionStart ?? text.length;
    const matches = [...text.matchAll(VARIABLE_REGEX)];
    const numbers = matches.map(m => parseInt(m[1], 10));
    const maxVar = numbers.length > 0 ? Math.max(...numbers) : 0;
    const newVar = `{{${maxVar + 1}}}`;
    
    const newText = text.slice(0, cursorPosition) + newVar + text.slice(cursorPosition);
    
    setText(newText);
    onTextChange(newText);
    
    setTimeout(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(cursorPosition + newVar.length, cursorPosition + newVar.length);
    }, 0);
  };

  const autoFixVariables = () => {
    let varCounter = 1;
    const varMap = new Map<number, number>();

    const fixedText = text.replace(VARIABLE_REGEX, (match, p1) => {
      const originalNum = parseInt(p1, 10);
      if (!varMap.has(originalNum)) {
        varMap.set(originalNum, varCounter++);
      }
      return `{{${varMap.get(originalNum)}}}`;
    });

    setText(fixedText);
    onTextChange(fixedText);
  };
  
  const previewContent = useMemo(() => {
    const parts = text.split(VARIABLE_REGEX);
    return parts.map((part, index) => {
      if (index % 2 === 1) {
        return <strong key={index} className="text-primary font-bold">{'{{'}{part}{'}}'}</strong>;
      }
      return <span key={index}>{part}</span>;
    });
  }, [text]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Editor Side */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <h4 className="font-medium">Body Content</h4>
            <Button type="button" variant="outline" size="sm" onClick={addVariable}>
              Add Variable
            </Button>
          </div>
          <Textarea
            ref={textareaRef}
            value={text}
            onChange={handleChange}
            placeholder="Type your message here. Use variables like {{1}} for dynamic content."
            className="h-48 resize-none font-mono text-sm"
            maxLength={MAX_CHARS + 50} // Allow some buffer
          />
          <div className={cn("text-xs text-right", text.length > MAX_CHARS ? "text-destructive" : "text-muted-foreground")}>
            {text.length} / {MAX_CHARS}
          </div>
        </div>
        
        {/* Preview Side */}
        <div className="space-y-2">
          <h4 className="font-medium">Preview</h4>
          <ScrollArea className="h-48 rounded-md border p-3 bg-muted/50">
             <div className="whitespace-pre-wrap text-sm">{previewContent}</div>
          </ScrollArea>
        </div>
      </div>
      
      {!validationResult.isValid ? (
        <Alert variant="destructive">
          <Lightbulb className="h-4 w-4" />
          <AlertTitle>Validation Issues Found</AlertTitle>
          <AlertDescription>
            <ul className="list-disc list-inside">
              {validationResult.issues.map((issue, i) => <li key={i}>{issue}</li>)}
            </ul>
             <Button type="button" variant="link" size="sm" className="p-0 h-auto mt-2" onClick={autoFixVariables}>
                Click here to auto-fix variable sequencing.
             </Button>
          </AlertDescription>
        </Alert>
      ) : (
         <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertTitle>Validation Passed</AlertTitle>
            <AlertDescription>
              Your template body is correctly formatted.
               <div className="text-xs text-muted-foreground mt-2">
                    Variables (like <code>{'{{1}}'}</code>) are placeholders that will be replaced with dynamic information. They must start from <code>{'{{1}}'}</code> and be sequential (e.g., <code>{'{{1}}'}</code>, <code>{'{{2}}'}</code>).
               </div>
            </AlertDescription>
        </Alert>
      )}
    </div>
  );
};
