'use client';

import React, { useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Logo } from '@/components/logo';

export default function DeleteDataPage() {
  useEffect(() => {
    document.title = "Data Deletion Policy - Majime";
  }, []);

  return (
    <main className="bg-secondary/50 py-12 md:py-20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl">
        <Card>
          <CardHeader className="text-center space-y-4">
            <Logo className="justify-center" />
            <CardTitle className="text-3xl md:text-4xl font-headline">User Data Deletion Policy</CardTitle>
            <p className="text-sm text-muted-foreground">Last Updated: July 27, 2024</p>
          </CardHeader>
          <CardContent className="prose prose-sm md:prose-base max-w-none mx-auto text-foreground/90">
            <h2>Your Right to Data Deletion</h2>
            <p>
              At Majime, we respect your right to control your personal and business information. You can request the deletion of your user account and all associated data at any time. This policy outlines the process and scope of data deletion.
            </p>

            <h2>1. How to Request Data Deletion</h2>
            <p>
              To initiate the data deletion process, please send an email to our support team with the subject line "Account Data Deletion Request".
            </p>
            <ul>
              <li><strong>Email Address:</strong> <a href="mailto:support@majime.in">support@majime.in</a></li>
              <li><strong>Required Information:</strong> Please send the request from the email address associated with your Majime account. This is necessary for us to verify your identity and ownership of the account.</li>
            </ul>
            <p>
              Once we receive your request, we will send a confirmation email to verify that you wish to proceed with the permanent deletion of your account and data.
            </p>

            <h2>2. Scope of Data Deletion</h2>
            <p>Upon confirmation, we will permanently delete the following information from our active systems:</p>
            <ul>
              <li><strong>Your User Account:</strong> This includes your name, email address, and any other profile information stored in our `users` collection.</li>
              <li><strong>Shopify Store Data:</strong> All data imported from your connected Shopify store(s), including orders, products, and customer information, that is stored in your account's subcollections.</li>
              <li><strong>Integration Credentials:</strong> All API keys, passwords, and tokens you have provided for third-party integrations (e.g., Delhivery, Shiprocket, Xpressbees, Interakt).</li>
              <li><strong>Pickup Locations and Settings:</strong> Any custom pickup locations or settings you have configured within the app.</li>
              <li><strong>Activity Logs:</strong> All logs associated with your account, including user actions and webhook events.</li>
            </ul>
            <p>
              Please note that this action does <strong>not</strong> affect the data within your actual Shopify store or your accounts with any third-party services. It only removes the data stored within the Majime application.
            </p>

            <h2>3. What is Not Deleted</h2>
            <ul>
              <li><strong>Data in Your Shopify Store:</strong> Deleting your Majime account does not delete your Shopify store, orders, or customers from the Shopify platform.</li>
              <li><strong>Data in Third-Party Services:</strong> Your accounts and data with courier or communication services (like Delhivery or Interakt) will remain unaffected.</li>
              <li><strong>Anonymized Data:</strong> We may retain aggregated, anonymized data for analytical purposes, which cannot be used to identify you or your business.</li>
            </ul>

            <h2>4. Process and Timeframe</h2>
            <ul>
              <li><strong>Verification:</strong> We will verify your request within 3 business days.</li>
              <li><strong>Deletion:</strong> Once verified, your data will be permanently deleted from our production databases within 14 business days.</li>
              <li><strong>Backups:</strong> Data may remain in our secure, encrypted backups for up to 30 days after deletion from our live systems, after which it will be permanently purged.</li>
            </ul>
            
            <h2>5. Disconnecting Your Store (Alternative)</h2>
            <p>
              If you wish to stop using the service temporarily without deleting your historical data, you can simply disconnect your Shopify store from the "Apps & Integrations" settings page. This will stop all new data from being synced but will preserve your existing data within Majime for future use.
            </p>

            <h2>Contact Us</h2>
            <p>If you have any questions about our data deletion process, please contact us at <a href="mailto:support@majime.in">support@majime.in</a>.</p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
