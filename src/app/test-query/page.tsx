'use client';

import { useQuery } from '@tanstack/react-query';

export default function TestQueryPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['test'],
    queryFn: async () => {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      return { message: '🎉 TanStack Query is working!' };
    },
  });

  if (isLoading) return <div className="p-8">Loading...</div>;
  if (error) return <div className="p-8">Error: {error.message}</div>;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">TanStack Query Test</h1>
      <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
        {data?.message}
      </div>
      <p className="mt-4 text-sm text-gray-600">
        If you see the success message above, TanStack Query is installed correctly!
      </p>
      <p className="mt-2 text-sm text-gray-600">
        Look at the bottom-right corner - you should see a small TanStack Query devtools icon.
      </p>
    </div>
  );
}