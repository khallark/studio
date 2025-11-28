// app/business/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Building2, ChevronRight, Loader2, Users, Crown, Sparkles, ArrowRight, Package, TrendingUp, Zap, Contact } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Logo } from '@/components/logo';
import { doc, getDoc } from 'firebase/firestore';

const SUPER_ADMIN_ID = process.env.NEXT_PUBLIC_SUPER_ADMIN_ID;
const SHARED_STORE_ID = process.env.NEXT_PUBLIC_SHARED_STORE_ID;

interface BusinessMembership {
  businessId: string;
  businessName: string;
  memberCount: number;
  isOwnBusiness: boolean;
}

export default function BusinessListPage() {
  const [user, loadingAuth] = useAuthState(auth);
  const router = useRouter();
  const [businesses, setBusinesses] = useState<BusinessMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showJoinMajime, setShowJoinMajime] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);

  useEffect(() => {
    document.title = 'My Businesses';
  }, []);

  // Check if user should see Join Majime promotion
  useEffect(() => {
    const checkUserAccess = async () => {
      if (!user) {
        setShowJoinMajime(false);
        setCheckingAccess(false);
        return;
      }

      try {
        // Check if user is super admin
        if (user.uid === SUPER_ADMIN_ID) {
          setShowJoinMajime(false);
          setCheckingAccess(false);
          return;
        }

        // Get user document to check stores
        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
          const userData = userDocSnap.data();
          const userStores = userData.stores || [];

          // Check if user has the shared store
          if (userStores.includes(SHARED_STORE_ID)) {
            setShowJoinMajime(false);
          } else {
            setShowJoinMajime(true);
          }
        } else {
          setShowJoinMajime(true);
        }
      } catch (error) {
        console.error('Error checking user access:', error);
        setShowJoinMajime(true);
      } finally {
        setCheckingAccess(false);
      }
    };

    checkUserAccess();
  }, [user]);

  // Redirect to login if user is not logged in
  useEffect(() => {
    if (!loadingAuth && !user) {
      router.push('/login?redirect=/business');
    }
  }, [loadingAuth, user, router]);

  useEffect(() => {
    if (!user) return;

    const fetchBusinesses = async () => {
      try {
        setLoading(true);
        setError(null);

        const idToken = await user.getIdToken();

        const response = await fetch('/api/business/list', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${idToken}`,
          },
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to fetch businesses');
        }

        const data = await response.json();
        setBusinesses(data.businesses || []);
      } catch (error) {
        console.error('Error fetching businesses:', error);
        setError(error instanceof Error ? error.message : 'Failed to load businesses');
      } finally {
        setLoading(false);
      }
    };

    fetchBusinesses();
  }, [user]);

  // Show loading while checking auth
  if (loadingAuth) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Checking authentication...</p>
      </div>
    );
  }

  // Don't render if not authenticated (will redirect)
  if (!user) {
    return null;
  }

  if (loading || checkingAccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Loading your businesses...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background">
        <div className="text-center space-y-4 max-w-md">
          <div className="rounded-full bg-destructive/10 p-4 w-16 h-16 mx-auto flex items-center justify-center">
            <Building2 className="h-8 w-8 text-destructive" />
          </div>
          <h2 className="text-2xl font-semibold">Failed to Load Businesses</h2>
          <p className="text-muted-foreground">{error}</p>
          <Button onClick={() => window.location.reload()}>
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Logo />
              <div className="h-8 w-px bg-border" />
              <h1 className="text-xl font-semibold text-foreground">Businesses</h1>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="max-w-6xl mx-auto">
          {/* Join Majime Promotional Banner */}
          {showJoinMajime && (
            <Card className="mb-8 border-2 border-primary/30 bg-gradient-to-br from-primary/5 via-primary/10 to-primary/5 shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden relative">
              <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-primary/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

              <CardHeader className="relative pb-4">
                <div className="flex items-start gap-4">
                  <div className="rounded-xl bg-primary p-3 shadow-lg">
                    <Sparkles className="h-8 w-8 text-primary-foreground" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <CardTitle className="text-2xl font-bold">Join MAJIME's own business</CardTitle>
                      <Badge className="bg-primary/20 text-primary border-primary/30 font-semibold">
                        Exclusive Access
                      </Badge>
                    </div>
                    <CardDescription className="text-base">
                      Don't have experience to sell on own? Sell your products at majime!
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="relative space-y-6">
                {/* Features Grid */}
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="flex items-start gap-3 p-4 rounded-lg bg-background/60 backdrop-blur-sm border border-primary/20">
                    <div className="rounded-lg bg-primary/10 p-2 mt-1">
                      <Package className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-sm mb-1">Let us sell your products</h4>
                      <p className="text-xs text-muted-foreground">Once you feel like yourself, sell it yourself, by creating a store</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-4 rounded-lg bg-background/60 backdrop-blur-sm border border-primary/20">
                    <div className="rounded-lg bg-primary/10 p-2 mt-1">
                      <Zap className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-sm mb-1">All orders on a single Dashboard</h4>
                      <p className="text-xs text-muted-foreground">Manage all your orders from one powerful dashboard (MAJIME's too!)</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-4 rounded-lg bg-background/60 backdrop-blur-sm border border-primary/20">
                    <div className="rounded-lg bg-primary/10 p-2 mt-1">
                      <Contact className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-sm mb-1">Contact us</h4>
                      <p className="text-xs text-muted-foreground">If there are any queries regarding the joining process, contact us!</p>
                    </div>
                  </div>
                </div>

                {/* CTA Section */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-6 rounded-xl bg-background/60 backdrop-blur-sm border border-primary/20">
                  <div>
                    <h4 className="font-semibold text-lg mb-1">Ready to get started?</h4>
                    <p className="text-sm text-muted-foreground">Join MAJIME today and transform your business operations</p>
                  </div>
                  <Button
                    size="lg"
                    onClick={() => router.push('/join-majime')}
                    className="shadow-lg hover:shadow-xl transition-all duration-300 gap-2 group whitespace-nowrap"
                  >
                    Join MAJIME Now
                    <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Page Title */}
          <div className="mb-8">
            <h2 className="text-3xl font-bold tracking-tight text-foreground mb-2">
              Your Businesses
            </h2>
            <p className="text-muted-foreground">
              Select a business to manage orders, settings, and team members.
            </p>
          </div>

          {/* Business Grid */}
          {businesses.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <div className="rounded-full bg-muted p-4 mb-4">
                  <Building2 className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">No businesses found</h3>
                <p className="text-sm text-muted-foreground text-center max-w-sm mb-4">
                  You don't have access to any businesses yet. Contact your administrator or create a new business.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {businesses.map((business) => (
                <Card
                  key={business.businessId}
                  className={`hover:shadow-lg transition-all duration-200 cursor-pointer group ${business.isOwnBusiness ? 'border-primary/50 bg-primary/5' : ''
                    }`}
                  onClick={() => router.push(`/business/${business.businessId}/dashboard`)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="rounded-lg bg-primary/10 p-2 shrink-0">
                          <Building2 className="h-5 w-5 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <CardTitle className="text-lg truncate mb-1">
                            {business.businessName}
                          </CardTitle>
                          <CardDescription className="text-xs">
                            ID: {business.businessId.slice(0, 8)}...
                          </CardDescription>
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground group-hover:translate-x-1 transition-all shrink-0" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Users className="h-4 w-4" />
                        <span>
                          {business.memberCount}{' '}
                          {business.memberCount === 1 ? 'member' : 'members'}
                        </span>
                      </div>
                      {business.isOwnBusiness && (
                        <Badge className="bg-primary/10 text-primary hover:bg-primary/20 border-primary/20">
                          <Crown className="h-3 w-3 mr-1" />
                          Your Business
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Info Section */}
          {businesses.length > 0 && (
            <div className="mt-8 p-4 rounded-lg border bg-muted/50">
              <p className="text-sm text-muted-foreground">
                <strong className="text-foreground">Tip:</strong> Your business always displays first and is highlighted.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}