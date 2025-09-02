
'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Logo } from '@/components/logo';

type Step = 'phone' | 'otp' | 'confirmed';

const indianPhoneNumberRegex = /^(?:\+91)?[6-9]\d{9}$/;

export default function CheckoutPage() {
  const [step, setStep] = useState<Step>('phone');
  const [direction, setDirection] = useState(1);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [sentOtp, setSentOtp] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const variants = {
    enter: (direction: number) => ({
      x: direction > 0 ? '100%' : '-100%',
      opacity: 0,
    }),
    center: {
      zIndex: 1,
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      zIndex: 0,
      x: direction < 0 ? '100%' : '-100%',
      opacity: 0,
    }),
  };

  const handlePhoneNumberSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!indianPhoneNumberRegex.test(phoneNumber)) {
      toast({
        title: 'Invalid Phone Number',
        description: 'Please enter a valid 10-digit Indian mobile number.',
        variant: 'destructive',
      });
      return;
    }
    setIsLoading(true);

    try {
      const response = await fetch('/api/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to send OTP');
      }
      setSentOtp(result.otp);
      setDirection(1);
      setStep('otp');
      toast({
        title: 'OTP Sent',
        description: `An OTP has been sent to ${phoneNumber} on WhatsApp.`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'An unknown error occurred.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleOtpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    // Simulate verification delay
    setTimeout(() => {
        if (otpInput === sentOtp) {
            setDirection(1);
            setStep('confirmed');
        } else {
            toast({
                title: 'Invalid OTP',
                description: 'The OTP you entered is incorrect. Please try again.',
                variant: 'destructive',
            });
        }
        setIsLoading(false);
    }, 500)
  };

  const handleBack = () => {
    setDirection(-1);
    setStep('phone');
    setSentOtp(null);
    setOtpInput('');
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-secondary/50 p-4">
      <Card className="mx-auto max-w-sm w-full overflow-hidden">
        <AnimatePresence initial={false} custom={direction}>
          {step === 'phone' && (
            <motion.div
              key="phone"
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ type: 'tween', ease: 'easeInOut', duration: 0.5 }}
            >
              <form onSubmit={handlePhoneNumberSubmit}>
                <CardHeader className="text-center space-y-2">
                   <Logo className="justify-center" />
                  <CardTitle className="text-2xl font-headline">Verify your number</CardTitle>
                  <CardDescription>Enter your phone number to receive a verification code on WhatsApp.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-2">
                    <Label htmlFor="phone">Phone Number</Label>
                    <div className="flex items-center">
                        <span className="flex h-10 items-center rounded-l-md border border-r-0 border-input bg-muted px-3 text-sm text-muted-foreground">
                            +91
                        </span>
                        <Input
                            id="phone"
                            type="tel"
                            placeholder="9876543210"
                            required
                            value={phoneNumber.replace('+91', '')}
                            onChange={(e) => setPhoneNumber(`+91${e.target.value.replace(/\D/g, '').slice(0, 10)}`)}
                            disabled={isLoading}
                            className="rounded-l-none"
                        />
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? <Loader2 className="animate-spin" /> : 'Send OTP'}
                  </Button>
                </CardContent>
              </form>
            </motion.div>
          )}

          {step === 'otp' && (
            <motion.div
              key="otp"
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ type: 'tween', ease: 'easeInOut', duration: 0.5 }}
            >
              <form onSubmit={handleOtpSubmit}>
                <CardHeader className="text-center space-y-2">
                  <Logo className="justify-center" />
                  <CardTitle className="text-2xl font-headline">Enter OTP</CardTitle>
                  <CardDescription>A 6-digit code was sent to {phoneNumber}.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-2">
                    <Label htmlFor="otp">Verification Code</Label>
                    <Input
                      id="otp"
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={otpInput}
                      onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, ''))}
                      required
                      disabled={isLoading}
                      className="text-center tracking-[0.5em] text-lg"
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? <Loader2 className="animate-spin" /> : 'Verify'}
                  </Button>
                   <Button type="button" variant="link" className="w-full text-sm" onClick={handleBack} disabled={isLoading}>
                     Use a different number
                  </Button>
                </CardContent>
              </form>
            </motion.div>
          )}

          {step === 'confirmed' && (
             <motion.div
                key="confirmed"
                custom={direction}
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ type: 'tween', ease: 'easeInOut', duration: 0.5 }}
             >
                <CardContent className="flex flex-col items-center justify-center space-y-4 text-center h-80">
                  <CheckCircle className="h-20 w-20 text-green-500" />
                  <h2 className="text-2xl font-bold font-headline">Verified!</h2>
                  <p className="text-muted-foreground">User Contact Tied to this session</p>
                </CardContent>
            </motion.div>
          )}

        </AnimatePresence>
      </Card>
    </div>
  );
}
