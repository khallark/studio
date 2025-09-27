import { db } from '@/lib/firebase-admin';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, CheckCircle } from 'lucide-react';

interface PageProps {
  params: {
    storeAlias: string;
  };
}

async function getServiceStatus(alias: string): Promise<{ enabled: boolean; storeName: string | null }> {
  try {
    const aliasRef = db.collection('store_aliases').doc(alias);
    const aliasDoc = await aliasRef.get();

    if (!aliasDoc.exists) {
      console.warn(`No store found for alias: ${alias}`);
      return { enabled: false, storeName: null };
    }

    const storeId = aliasDoc.data()?.mapped_store;
    if (!storeId) {
      console.warn(`Alias ${alias} exists but has no mapped store.`);
      return { enabled: false, storeName: null };
    }

    const accountRef = db.collection('accounts').doc(storeId);
    const accountDoc = await accountRef.get();

    if (!accountDoc.exists) {
      console.warn(`Mapped store with ID ${storeId} not found.`);
      return { enabled: false, storeName: null };
    }
    
    const accountData = accountDoc.data();
    const isEnabled = accountData?.customerServices?.bookReturnPage?.enabled === true;
    const storeName = accountData?.shopName || 'the store';
    
    return { enabled: isEnabled, storeName };

  } catch (error) {
    console.error(`Error validating service status for alias ${alias}:`, error);
    return { enabled: false, storeName: null };
  }
}

export default async function BookReturnPage({ params }: PageProps) {
  const { storeAlias } = params;
  const { enabled, storeName } = await getServiceStatus(storeAlias);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-lg text-center">
        {enabled ? (
          <>
            <CardHeader>
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 mb-4">
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
              <CardTitle>Return Service Available</CardTitle>
              <CardDescription>
                This service is enabled for {storeName}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Further functionality for booking a return will be implemented here.
              </p>
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader>
               <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 mb-4">
                <AlertCircle className="h-8 w-8 text-destructive" />
              </div>
              <CardTitle>Service Not Available</CardTitle>
              <CardDescription>
                The return booking service is not available for this store alias.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Please check the URL or contact the store owner for more information.
              </p>
            </CardContent>
          </>
        )}
      </Card>
    </main>
  );
}
