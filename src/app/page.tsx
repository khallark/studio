'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { ArrowRight, LogOut } from 'lucide-react';
import { Logo } from '@/components/logo';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { auth } from '@/lib/firebase';
import { useAuthState } from 'react-firebase-hooks/auth';
import { signOut } from 'firebase/auth';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useRouter } from 'next/navigation';


export default function Home() {
  const [user, loading, error] = useAuthState(auth);
  const router = useRouter();

  const handleLogout = async () => {
    await signOut(auth);
    router.push('/');
  };
  
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <header className="container mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
        <Logo />
        <nav className="flex items-center gap-2 sm:gap-4">
          {loading ? (
             <div className="h-10 w-24 bg-muted rounded-md animate-pulse" />
          ) : user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2">
                   <Avatar className="h-8 w-8">
                     <AvatarImage src={user.photoURL || "https://placehold.co/32x32.png"} alt={user.displayName || "User"} data-ai-hint="user avatar" />
                     <AvatarFallback>{user.displayName?.charAt(0) || user.email?.charAt(0) || 'U'}</AvatarFallback>
                  </Avatar>
                  <span>{user.displayName || user.email}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{user.displayName}</p>
                    <p className="text-xs leading-none text-muted-foreground">
                      {user.email}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                 <DropdownMenuItem asChild>
                  <Link href="/dashboard">Dashboard</Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Button variant="ghost" asChild>
                <Link href="/login">Log In</Link>
              </Button>
              <Button asChild>
                <Link href="/signup">Sign Up</Link>
              </Button>
            </>
          )}
        </nav>
      </header>
      <main className="flex-grow">
        <section className="container mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-32">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="space-y-6 text-center md:text-left">
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold font-headline text-primary">
                All your Shopify orders, in one place.
              </h1>
              <p className="text-lg text-muted-foreground">
                OrderFlow brings all your Shopify data into a single, powerful dashboard. Stop switching tabs and start making smarter decisions.
              </p>
              <Button size="lg" asChild>
                <Link href="/signup">
                  Get Started for Free
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
            </div>
            <div className="flex justify-center">
              <Image
                src="https://placehold.co/600x400.png"
                alt="Dashboard screenshot"
                width={600}
                height={400}
                className="rounded-xl shadow-2xl"
                data-ai-hint="dashboard analytics"
              />
            </div>
          </div>
        </section>

        <section className="bg-secondary/50 py-20 md:py-24">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto space-y-4">
              <h2 className="text-3xl md:text-4xl font-bold font-headline">Features to streamline your workflow</h2>
              <p className="text-lg text-muted-foreground">
                Everything you need to manage your e-commerce business efficiently.
              </p>
            </div>
            <div className="mt-12 grid md:grid-cols-3 gap-8">
              <Card>
                <CardHeader>
                  <CardTitle className="font-headline text-xl">Unified Dashboard</CardTitle>
                </CardHeader>
                <CardContent>
                  <p>See all your orders from multiple stores in one view.</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="font-headline text-xl">Real-time Analytics</CardTitle>
                </CardHeader>
                <CardContent>
                  <p>Gain valuable insights with up-to-the-minute sales data.</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="font-headline text-xl">Easy Integration</CardTitle>
                </CardHeader>
                <CardContent>
                  <p>Connect your Shopify store in just a few clicks.</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      </main>

      <footer className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 text-center text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} OrderFlow. All rights reserved.</p>
      </footer>
    </div>
  );
}
