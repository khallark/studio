
'use client';

import React, { useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Logo } from '@/components/logo';

export default function PrivacyPolicyPage() {
  useEffect(() => {
    document.title = "Privacy Policy - Majime";
  }, []);

  return (
    <main className="bg-secondary/50 py-12 md:py-20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl">
        <Card>
          <CardHeader className="text-center space-y-4">
            <Logo className="justify-center" />
            <CardTitle className="text-3xl md:text-4xl font-headline">Privacy Policy</CardTitle>
            <p className="text-sm text-muted-foreground">Last Updated: July 26, 2024</p>
          </CardHeader>
          <CardContent className="prose prose-sm md:prose-base max-w-none mx-auto text-foreground/90">
            <h2>Introduction</h2>
            <p>
              Welcome to Majime ("we," "our," or "us"). We are committed to protecting your privacy and handling your data in an open and transparent manner. This Privacy Policy explains how we collect, use, process, and disclose your information across the Majime application, which provides a unified dashboard for managing your Shopify store(s) ("Service").
            </p>
            <p>
              By connecting your Shopify store and using our Service, you agree to the collection and use of information in accordance with this policy.
            </p>

            <h2>1. Information We Collect</h2>
            <p>To provide our Service, we collect information from several sources:</p>
            <h4>a. Information You Provide to Us:</h4>
            <ul>
              <li><strong>Account Information:</strong> When you sign up, we collect your name, email address, and password or authenticate you via Google.</li>
              <li><strong>Integration Credentials:</strong> To connect third-party services, you provide us with API keys, email addresses, and passwords for services like Delhivery, Shiprocket, Xpressbees, and Interakt. We store these credentials securely to maintain the integrations.</li>
              <li><strong>Store Details:</strong> You may provide company addresses and primary contact details for your store within our settings.</li>
            </ul>

            <h4>b. Information from Your Shopify Store:</h4>
            <p>When you connect your Shopify store, we access and store the following data via the Shopify API:</p>
            <ul>
              <li><strong>Orders:</strong> Customer details (name, email, phone, shipping/billing address), products purchased, prices, discounts, and payment status.</li>
              <li><strong>Products:</strong> Details about the products in your store.</li>
              <li><strong>Customers:</strong> Information about your customers related to their orders.</li>
            </ul>
            <p>This data is essential for the core functionality of the Majime dashboard, allowing you to view, manage, and process your orders.</p>

            <h4>c. Information We Collect Automatically:</h4>
            <ul>
              <li><strong>Log Data:</strong> Our servers automatically record information ("Log Data") created by your use of the Service. This may include your IP address, browser type, operating system, and the dates and times of your access.</li>
              <li><strong>Session Information:</strong> For features like our one-click checkout, we create temporary sessions that may be linked to your IP address and cart details to facilitate the checkout process.</li>
            </ul>
            
            <h2>2. How We Use Your Information</h2>
            <p>We use the information we collect for the following purposes:</p>
            <ul>
              <li><strong>To Provide and Maintain the Service:</strong> To display your orders, facilitate shipment processing, manage communications, and provide a unified dashboard experience.</li>
              <li><strong>To Facilitate Integrations:</strong> To connect with third-party services like courier and communication platforms on your behalf using the credentials you provide.</li>
              <li><strong>To Improve Our Service:</strong> To analyze usage patterns, identify areas for improvement, and develop new features.</li>
              <li><strong>To Communicate With You:</strong> To send you service-related notifications, updates, or respond to your support requests.</li>
            </ul>

            <h2>3. Data Sharing and Third-Party Services</h2>
            <p>We do not sell your data. We only share information with third parties as necessary to provide the Service:</p>
            <ul>
              <li><strong>Shopify:</strong> We continuously sync data with your Shopify store to keep your dashboard up-to-date.</li>
              <li><strong>Courier Services (Delhivery, Shiprocket, Xpressbees):</strong> When you create a shipment or book a return, we send necessary order and customer details (like name, address, phone number, and product information) to the respective courier API.</li>
              <li><strong>Communication Services (Interakt):</strong> When you manage WhatsApp templates or send messages, we interact with the Interakt API using your provided credentials.</li>
              <li><strong>Firebase:</strong> We use Google Firebase for backend services, including authentication, database (Firestore), and file storage. Your data is stored within our Firebase project, managed under Google's security infrastructure.</li>
            </ul>

            <h2>4. Data Security</h2>
            <p>We take the security of your data seriously. We implement robust measures to protect your information from unauthorized access, alteration, disclosure, or destruction. These measures include:</p>
            <ul>
              <li>Using secure connections (HTTPS) for all data transmission.</li>
              <li>Storing sensitive credentials in a secure manner within our Firestore database, which is protected by Firebase Security Rules.</li>
              <li>Authenticating all API requests to our backend to ensure only authorized users can access or modify data.</li>
            </ul>

            <h2>5. Data Retention</h2>
            <p>We retain your information as long as your account is active or as needed to provide you with the Service. If you choose to disconnect your Shopify store or delete your account, we will remove your associated data from our active databases in accordance with our data retention policies, though some data may be retained in backups for a limited period.</p>
            
            <h2>6. Your Rights</h2>
            <p>You have rights over your personal information. You can:</p>
            <ul>
                <li>Access and review the information you have provided to us.</li>
                <li>Edit your store details and integration settings at any time.</li>
                <li>Disconnect your Shopify store, which will stop all further data synchronization from that store.</li>
            </ul>

            <h2>7. Children's Privacy</h2>
            <p>Our Service is not directed to individuals under the age of 18. We do not knowingly collect personal information from children. If we become aware that a child has provided us with personal information, we will take steps to delete such information.</p>

            <h2>8. Changes to This Privacy Policy</h2>
            <p>We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last Updated" date. You are advised to review this Privacy Policy periodically for any changes.</p>

            <h2>9. Contact Us</h2>
            <p>If you have any questions about this Privacy Policy, please contact us at <a href="mailto:support@majime.in">support@majime.in</a>.</p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
