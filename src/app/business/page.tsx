// app/business/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Building2, ChevronRight, Loader2, Plus, Users, Crown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Logo } from '@/components/logo';

interface BusinessMembership {
  businessId: string;
  businessName: string;
  memberCount: number;
  isOwnBusiness: boolean;
}

export default function BusinessListPage() {
  const [user] = useAuthState(auth);
  const router = useRouter();
  const [businesses, setBusinesses] = useState<BusinessMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'My Businesses';
  }, []);

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

  if (loading) {
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
            <Button variant="outline" size="sm" disabled>
              <Plus className="h-4 w-4 mr-2" />
              Create Business
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="max-w-6xl mx-auto">
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
                <Button variant="outline" disabled>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Business
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {businesses.map((business) => (
                <Card
                  key={business.businessId}
                  className={`hover:shadow-lg transition-all duration-200 cursor-pointer group ${
                    business.isOwnBusiness ? 'border-primary/50 bg-primary/5' : ''
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
                <strong className="text-foreground">Tip:</strong> Your personal business (where your user ID matches the business ID) is always displayed first and highlighted.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}