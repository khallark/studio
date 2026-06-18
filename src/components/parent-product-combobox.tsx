'use client';

import React, { useState } from 'react';
import { Check, ChevronsUpDown, Package2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { ParentProduct } from '@/types/warehouse';

interface ParentProductComboboxProps {
    parents: ParentProduct[];
    value: string | null;
    onChange: (id: string) => void;
    disabled?: boolean;
    error?: boolean;
    placeholder?: string;
}

export function ParentProductCombobox({
    parents,
    value,
    onChange,
    disabled,
    error,
    placeholder = 'Select parent product',
}: ParentProductComboboxProps) {
    const [open, setOpen] = useState(false);
    const selected = parents.find((p) => p.id === value) ?? null;

    return (
        <Popover open={open} onOpenChange={setOpen} modal={true}>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    disabled={disabled}
                    className={cn(
                        'w-full justify-between font-normal',
                        !selected && 'text-muted-foreground',
                        error && 'border-destructive'
                    )}
                >
                    <span className="flex items-center gap-2 truncate">
                        <Package2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">
                            {selected ? selected.name : placeholder}
                        </span>
                    </span>
                    <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="w-[--radix-popover-trigger-width] p-0 z-[100]"
                align="start"
                onOpenAutoFocus={(e) => e.preventDefault()}
                onCloseAutoFocus={(e) => e.preventDefault()}
                onFocusOutside={(e) => e.preventDefault()}
                onInteractOutside={(e) => e.preventDefault()}
            >
                <Command
                    filter={(itemValue, search) => {
                        const name = itemValue.split('__')[0];
                        return name.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
                    }}
                >
                    <CommandInput placeholder="Search parents..." />
                    <CommandList>
                        <CommandEmpty>No parent products found.</CommandEmpty>
                        <CommandGroup>
                            {parents.map((parent) => (
                                <CommandItem
                                    key={parent.id}
                                    value={`${parent.name}__${parent.id}`}
                                    onSelect={() => {
                                        onChange(parent.id);
                                        setOpen(false);
                                    }}
                                >
                                    <Check
                                        className={cn(
                                            'mr-2 h-4 w-4',
                                            value === parent.id ? 'opacity-100' : 'opacity-0'
                                        )}
                                    />
                                    <span className="truncate">{parent.name}</span>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}