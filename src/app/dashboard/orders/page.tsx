'use client';

import React, { useState, useEffect } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal } from 'lucide-react';

// This is a placeholder for the actual order data type from Firestore
interface Order {
  id: string;
  orderId: string;
  date: string;
  customerName: string;
  total: number;
  status: 'Fulfilled' | 'Unfulfilled' | 'Cancelled';
}

const sampleOrders: Order[] = [
  { id: '1', orderId: '#3210', date: '2023-10-22', customerName: 'Liam Johnson', total: 42.95, status: 'Fulfilled' },
  { id: '2', orderId: '#3209', date: '2023-10-21', customerName: 'Olivia Smith', total: 89.90, status: 'Unfulfilled' },
  { id: '3', orderId: '#3208', date: '2023-10-20', customerName: 'Noah Williams', total: 12.50, status: 'Fulfilled' },
  { id: '4', orderId: '#3207', date: '2023-10-19', customerName: 'Emma Brown', total: 25.00, status: 'Cancelled' },
  { id: '5', orderId: '#3206', date: '2023-10-18', customerName: 'Ava Jones', total: 150.00, status: 'Fulfilled' },
  { id: '6', orderId: '#3205', date: '2023-10-17', customerName: 'William Garcia', total: 59.99, status: 'Fulfilled' },
  { id: '7', orderId: '#3204', date: '2023-10-16', customerName: 'Sophia Miller', total: 75.25, status: 'Unfulfilled' },
  { id: '8', orderId: '#3203', date: '2023-10-15', customerName: 'James Davis', total: 99.99, status: 'Fulfilled' },
  { id: '9', orderId: '#3202', date: '2023-10-14', customerName: 'Isabella Rodriguez', total: 15.00, status: 'Cancelled' },
  { id: '10', orderId: '#3201', date: '2023-10-13', customerName: 'Logan Martinez', total: 34.50, status: 'Fulfilled' },
  { id: '11', orderId: '#3200', date: '2023-10-12', customerName: 'Mia Hernandez', total: 63.20, status: 'Unfulfilled' },
  { id: '12', orderId: '#3199', date: '2023-10-11', customerName: 'Benjamin Lopez', total: 45.00, status: 'Fulfilled' },
  { id: '13', orderId: '#3198', date: '2023-10-10', customerName: 'Charlotte Gonzalez', total: 22.80, status: 'Fulfilled' },
  { id: '14', orderId: '#3197', date: '2023-10-09', customerName: 'Elijah Wilson', total: 199.99, status: 'Cancelled' },
  { id: '15', orderId: '#3196', date: '2023-10-08', customerName: 'Amelia Anderson', total: 68.00, status: 'Fulfilled' },
  { id: '16', orderId: '#3195', date: '2023-10-07', customerName: 'Lucas Thomas', total: 7.99, status: 'Fulfilled' },
  { id: '17', orderId: '#3194', date: '2023-10-06', customerName: 'Harper Taylor', total: 49.95, status: 'Unfulfilled' },
  { id: '18', orderId: '#3193', date: '2023-10-05', customerName: 'Mason Moore', total: 110.00, status: 'Fulfilled' },
  { id: '19', orderId: '#3192', date: '2023-10-04', customerName: 'Evelyn Jackson', total: 5.50, status: 'Fulfilled' },
  { id: '20', orderId: '#3191', date: '2023-10-03', customerName: 'Logan White', total: 82.00, status: 'Cancelled' },
];


export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 50;

  useEffect(() => {
    // In a real application, you would fetch data from Firestore here.
    // For now, we're using sample data.
    setOrders(sampleOrders);
    setLoading(false);
  }, []);

  // Pagination logic
  const indexOfLastOrder = currentPage * rowsPerPage;
  const indexOfFirstOrder = indexOfLastOrder - rowsPerPage;
  const currentOrders = orders.slice(indexOfFirstOrder, indexOfLastOrder);

  const totalPages = Math.ceil(orders.length / rowsPerPage);

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
      <Card>
        <CardHeader>
          <CardTitle>Your Orders</CardTitle>
          <CardDescription>
            A list of all the orders from your connected stores.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center">
                    Loading orders...
                  </TableCell>
                </TableRow>
              ) : currentOrders.length > 0 ? (
                currentOrders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">{order.orderId}</TableCell>
                    <TableCell>{order.date}</TableCell>
                    <TableCell>{order.customerName}</TableCell>
                    <TableCell>
                      {order.total.toLocaleString('en-US', {
                        style: 'currency',
                        currency: 'USD',
                      })}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          order.status === 'Fulfilled'
                            ? 'default'
                            : order.status === 'Cancelled'
                            ? 'destructive'
                            : 'secondary'
                        }
                      >
                        {order.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button aria-haspopup="true" size="icon" variant="ghost">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Toggle menu</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuItem>View Details</DropdownMenuItem>
                          <DropdownMenuItem>Customer Details</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center h-24">
                    No orders found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
        <CardFooter>
          <div className="flex items-center justify-between w-full">
            <div className="text-xs text-muted-foreground">
              Showing{' '}
              <strong>
                {orders.length > 0 ? indexOfFirstOrder + 1 : 0}-
                {Math.min(indexOfLastOrder, orders.length)}
              </strong>{' '}
              of <strong>{orders.length}</strong> orders
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePreviousPage}
                disabled={currentPage === 1}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleNextPage}
                disabled={currentPage === totalPages || totalPages === 0}
              >
                Next
              </Button>
            </div>
          </div>
        </CardFooter>
      </Card>
    </main>
  );
}
