import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Zap } from 'lucide-react';

export default function Dashboard() {
  return (
    <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
      <div className="flex items-center">
        <h1 className="font-headline font-semibold text-lg md:text-2xl">Dashboard</h1>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Revenue
            </CardTitle>
            <span className="text-muted-foreground">$</span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">$0.00</div>
            <p className="text-xs text-muted-foreground">
              Connect your store to see data
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sales</CardTitle>
            <span className="text-muted-foreground">📦</span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
             <p className="text-xs text-muted-foreground">
              Connect your store to see data
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">New Customers</CardTitle>
             <span className="text-muted-foreground">😊</span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">+0</div>
             <p className="text-xs text-muted-foreground">
              Connect your store to see data
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Orders</CardTitle>
             <span className="text-muted-foreground">🚚</span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
             <p className="text-xs text-muted-foreground">
              Connect your store to see data
            </p>
          </CardContent>
        </Card>
      </div>
      <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm min-h-[400px]">
        <div className="flex flex-col items-center gap-2 text-center p-4">
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
             <Zap className="h-10 w-10 text-primary" />
          </div>
          <h3 className="text-2xl font-bold tracking-tight font-headline">
            Connect your Shopify store
          </h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            You have not connected any stores yet. Connect your store to start seeing your orders and analytics.
          </p>
          <Button className="mt-4">Connect Store</Button>
        </div>
      </div>
    </main>
  );
}
