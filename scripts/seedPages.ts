import 'dotenv/config';
import mongoose from 'mongoose';
import Page from '../src/models/Page';
import type { IPage } from '../src/types';

/**
 * Seeds the seven default CMS pages.
 *
 * Default pages (all pre-published so they are immediately visible to
 * the public GET /pages/:slug endpoint):
 *   - about
 *   - services
 *   - contact
 *   - privacy
 *   - terms
 *   - shipping
 *   - refund
 *
 * The script is idempotent: for each slug it either inserts a new page
 * or updates the existing page's content (preserving `publishedAt` when
 * the page was already published).
 *
 * Run with: `npx ts-node scripts/seedPages.ts`
 */

type SeedPage = Omit<IPage, '_id' | 'createdAt' | 'updatedAt' | 'publishedAt' | 'updatedBy'>;

const DEFAULT_PAGES: SeedPage[] = [
  {
    slug: 'about',
    title: 'About Crystal Agencies',
    content: `\
<h1>About Crystal Agencies</h1>
<p>Founded with a vision to deliver exceptional products and services, Crystal Agencies has grown to become a trusted partner for businesses and consumers alike.</p>
<p>Our mission is to provide high-quality products backed by outstanding customer service, building long-term relationships with every client we serve.</p>
<h2>Our Values</h2>
<ul>
  <li><strong>Integrity</strong> — We operate with transparency and honesty in everything we do.</li>
  <li><strong>Excellence</strong> — We pursue the highest standards of quality.</li>
  <li><strong>Customer Focus</strong> — Your success is our priority.</li>
  <li><strong>Innovation</strong> — We continuously improve our offerings and processes.</li>
</ul>
<p>Thank you for choosing Crystal Agencies. We look forward to serving you.</p>`,
    metaDescription:
      'Learn about Crystal Agencies — our history, mission, values, and commitment to delivering exceptional products and service.',
    metaKeywords: 'crystal agencies, about us, company, mission, values, history',
    published: true,
  },
  {
    slug: 'services',
    title: 'Our Services',
    content: `\
<h1>Our Services</h1>
<p>Crystal Agencies offers a comprehensive suite of services tailored to meet the needs of both B2B and B2C customers.</p>
<h2>Wholesale & B2B Supply</h2>
<ul>
  <li>Bulk product procurement with competitive pricing tiers</li>
  <li>Custom MOQ arrangements for established partners</li>
  <li>Direct RFQ handling with rapid quotation turnaround</li>
  <li>Dedicated account management</li>
</ul>
<h2>Retail & B2C Fulfilment</h2>
<ul>
  <li>Fast nationwide shipping on all in-stock items</li>
  <li>Multiple payment options including COD, card, and wallet</li>
  <li>Easy returns and refunds policy</li>
  <li>Full order tracking and status notifications</li>
</ul>
<h2>Customer Support</h2>
<ul>
  <li>Knowledgeable support team available during business hours</li>
  <li>Post-sales assistance and product guidance</li>
  <li>Warranty and return processing</li>
</ul>
<p>Contact us today to discuss how we can help your business grow.</p>`,
    metaDescription:
      'Explore Crystal Agencies services — wholesale & B2B supply, retail fulfilment, bulk pricing, customer support, and dedicated account management.',
    metaKeywords: 'services, wholesale, b2b, retail, bulk pricing, rfq, customer support, account management',
    published: true,
  },
  {
    slug: 'contact',
    title: 'Contact Us',
    content: `\
<h1>Contact Crystal Agencies</h1>
<p>We'd love to hear from you. Reach out using any of the channels below and our team will respond as quickly as possible.</p>
<h2>Get in Touch</h2>
<ul>
  <li><strong>Email:</strong> info@crystalagencies.example.com</li>
  <li><strong>Phone:</strong> +1 (555) 010-1234</li>
  <li><strong>WhatsApp / SMS:</strong> +1 (555) 010-5678</li>
</ul>
<h2>Business Hours</h2>
<ul>
  <li>Monday – Friday: 9:00 AM – 6:00 PM</li>
  <li>Saturday: 10:00 AM – 3:00 PM</li>
  <li>Sunday: Closed</li>
</ul>
<h2>Office Address</h2>
<address>
  Crystal Agencies HQ<br />
  123 Commerce Avenue, Suite 400<br />
  Industrial District<br />
  Cityville, ST 10001
</address>
<h2>Wholesale / B2B Enquiries</h2>
<p>For bulk orders, quotations, or corporate account enquiries, please email <strong>sales@crystalagencies.example.com</strong> or submit an RFQ through our portal.</p>`,
    metaDescription:
      'Contact Crystal Agencies — email, phone, WhatsApp, office address, business hours and B2B sales contacts for wholesale & RFQ enquiries.',
    metaKeywords: 'contact us, email, phone, address, business hours, wholesale, rfq, crystal agencies',
    published: true,
  },
  {
    slug: 'privacy',
    title: 'Privacy Policy',
    content: `\
<h1>Privacy Policy</h1>
<p><em>Last updated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</em></p>
<p>Crystal Agencies ("we", "our", "us") respects your privacy. This policy explains how we collect, use, and protect your personal information.</p>
<h2>Information We Collect</h2>
<ul>
  <li>Account details: name, email, phone, password hash, role</li>
  <li>Order and RFQ details: shipping address, payment method, items purchased</li>
  <li>Communication records: emails, tickets, and call notes</li>
  <li>Technical data: IP address, device info, and cookies for site operation</li>
</ul>
<h2>How We Use Your Information</h2>
<ul>
  <li>To fulfil orders, process payments and deliver quotations</li>
  <li>To communicate order updates, promotions (where opted in), and customer support replies</li>
  <li>To improve our website, products and customer experience</li>
  <li>To comply with legal and accounting obligations</li>
</ul>
<h2>Data Retention & Rights</h2>
<ul>
  <li>We retain data only as long as required by law or for legitimate business purposes</li>
  <li>You may request access, correction, or deletion of your personal data</li>
  <li>To exercise your rights, email privacy@crystalagencies.example.com</li>
</ul>
<h2>Security</h2>
<p>We use industry-standard safeguards including encrypted connections, secure password hashing, and access controls to protect your data.</p>
<h2>Contact</h2>
<p>Privacy concerns? Email privacy@crystalagencies.example.com.</p>`,
    metaDescription:
      'Crystal Agencies privacy policy — how we collect, use, retain and protect your personal data and your rights regarding your information.',
    metaKeywords: 'privacy policy, data protection, personal data, gdpr, cookies, user rights, crystal agencies',
    published: true,
  },
  {
    slug: 'terms',
    title: 'Terms & Conditions',
    content: `\
<h1>Terms & Conditions</h1>
<p><em>Last updated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</em></p>
<p>These terms govern your use of the Crystal Agencies website and services. By placing an order or registering an account, you agree to these terms.</p>
<h2>Orders & Payments</h2>
<ul>
  <li>All prices are listed in the store currency and are subject to applicable taxes</li>
  <li>We accept card, wallet, bank transfer, and COD (where available)</li>
  <li>Orders are not binding until confirmed by Crystal Agencies</li>
  <li>We reserve the right to cancel or refuse any order at our discretion</li>
</ul>
<h2>B2B & Quotations</h2>
<ul>
  <li>Quotations are valid for 30 days from the date issued unless otherwise stated</li>
  <li>MOQ and bulk-price tiers apply as agreed in writing</li>
  <li>Accepted quotations generate a binding order upon written confirmation</li>
</ul>
<h2>Delivery & Risk</h2>
<ul>
  <li>Delivery times are estimates only; we are not liable for carrier delays</li>
  <li>Risk of loss passes to you on delivery (or dispatch for customer pick-up)</li>
  <li>Inspect shipments on arrival and report any damage within 48 hours</li>
</ul>
<h2>Warranties & Disclaimers</h2>
<ul>
  <li>Products are covered by the manufacturer's warranty (where applicable)</li>
  <li>Our liability is limited to the value of the goods in question</li>
  <li>The site is provided "as is" without warranties of any kind, to the fullest extent permitted by law</li>
</ul>
<h2>Intellectual Property</h2>
<p>All content on this site (images, text, logos) is the property of Crystal Agencies or its licensors and may not be reproduced without prior written consent.</p>
<h2>Law & Jurisdiction</h2>
<p>These terms are governed by the laws of the applicable jurisdiction. Disputes are subject to the exclusive jurisdiction of the courts in Cityville.</p>`,
    metaDescription:
      'Crystal Agencies terms and conditions — orders, payments, B2B quotations, delivery, warranties, liability, intellectual property and applicable law.',
    metaKeywords: 'terms and conditions, terms of service, orders, payment, delivery, warranty, liability, b2b, quotation',
    published: true,
  },
  {
    slug: 'shipping',
    title: 'Shipping & Delivery Policy',
    content: `\
<h1>Shipping & Delivery Policy</h1>
<p><em>Last updated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</em></p>
<h2>Shipping Methods</h2>
<table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse;">
  <thead>
    <tr><th>Method</th><th>Estimated Delivery</th><th>Fee</th></tr>
  </thead>
  <tbody>
    <tr><td>Standard</td><td>5 – 7 business days</td><td>Flat rate (free above minimum order)</td></tr>
    <tr><td>Express</td><td>2 – 3 business days</td><td>Calculated at checkout</td></tr>
    <tr><td>Pick-up</td><td>Same day (during business hours)</td><td>Free</td></tr>
  </tbody>
</table>
<h2>Processing Time</h2>
<ul>
  <li>In-stock items usually ship within 1 – 2 business days of order confirmation</li>
  <li>Custom or bulk orders may require additional lead time; quoted individually</li>
  <li>Orders placed on weekends or public holidays are processed the next business day</li>
</ul>
<h2>Tracking</h2>
<p>Once your order ships you will receive an email with a tracking number and a link to follow the delivery progress online.</p>
<h2>International & Remote Locations</h2>
<p>International and remote-area shipments may require additional fees and delivery days. An estimate will be provided at checkout or via quotation.</p>
<h2>Delivery Issues</h2>
<ul>
  <li>If your shipment is late by more than 3 business days beyond the estimate, please contact support</li>
  <li>Report damage, wrong items, or missing parts within 48 hours of delivery; keep all packaging</li>
  <li>Failed deliveries due to incorrect address are the responsibility of the purchaser</li>
</ul>`,
    metaDescription:
      'Crystal Agencies shipping and delivery policy — methods, fees, processing times, tracking, and what to do if your order is late, damaged or incorrect.',
    metaKeywords: 'shipping, delivery, courier, tracking, express, pick up, processing time, international shipping',
    published: true,
  },
  {
    slug: 'refund',
    title: 'Returns, Refunds & Cancellations',
    content: `\
<h1>Returns, Refunds & Cancellations Policy</h1>
<p><em>Last updated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</em></p>
<h2>Cancellations</h2>
<ul>
  <li><strong>Pending orders:</strong> You may cancel a pending order at any time before it is shipped by contacting support</li>
  <li><strong>Already shipped / delivered:</strong> Cannot be cancelled; follow the returns process below</li>
  <li>Cancelled orders are refunded to the original payment method within 3 – 5 business days</li>
</ul>
<h2>Eligibility for Returns</h2>
<p>Items may be returned within <strong>14 calendar days</strong> of delivery if all of the following are true:</p>
<ul>
  <li>The item is unused and in its original packaging</li>
  <li>Tags, labels and seals are intact</li>
  <li>The item is not custom-made, perishable, or marked non-returnable</li>
  <li>You have the original receipt or order number</li>
</ul>
<h2>How to Request a Return</h2>
<ol>
  <li>Email support@crystalagencies.example.com with your order number and reason for return</li>
  <li>Our team will review and reply within 2 business days with a return authorization (RA) number</li>
  <li>Ship the item(s) back with the RA number clearly visible on the parcel</li>
  <li>Once received and inspected, we will process your refund or exchange</li>
</ol>
<h2>Refunds</h2>
<ul>
  <li>Refunds are issued to the original payment method</li>
  <li>Please allow 5 – 10 business days for the refund to appear in your account</li>
  <li>Original shipping charges are non-refundable unless the return is due to our error</li>
</ul>
<h2>Damaged or Defective Items</h2>
<p>Report any damaged, defective, or incorrect items within <strong>48 hours</strong> of delivery along with photos. We will cover the cost of return shipping and send a replacement or issue a full refund at your option.</p>
<h2>Exceptions</h2>
<ul>
  <li>Custom / made-to-order items cannot be returned unless defective</li>
  <li>Sale / clearance items may be final sale where indicated</li>
</ul>
<p>For assistance, contact support@crystalagencies.example.com.</p>`,
    metaDescription:
      'Crystal Agencies returns, refunds, and cancellations policy — eligibility, steps, timelines, damaged goods, and how refunds are processed.',
    metaKeywords: 'returns, refunds, cancellations, exchange, warranty, defective, order cancellation, 14 day return',
    published: true,
  },
];

async function main(): Promise<void> {
  const defaultDevUri = 'mongodb://localhost:27017/crystal-agencies';
  const uri =
    process.env.MONGODB_URI ??
    process.env.MONGO_URI ??
    (process.env.NODE_ENV !== 'production' ? defaultDevUri : undefined);
  if (!uri) {
    throw new Error(
      'MONGODB_URI environment variable must be set to run the seed script.',
    );
  }

  await mongoose.connect(uri);
  console.log(`[SEED-PAGES] Connected to MongoDB — ${mongoose.connection.host}`);

  let inserted = 0;
  let updated = 0;
  const touchedSlugs: string[] = [];

  const now = new Date();
  for (const seed of DEFAULT_PAGES) {
    const existing = await Page.findOne({ slug: seed.slug }).exec();
    if (existing) {
      const wasPublished = existing.published;
      existing.title = seed.title;
      existing.content = seed.content;
      existing.metaDescription = seed.metaDescription;
      existing.metaKeywords = seed.metaKeywords;
      existing.published = seed.published;
      if (seed.published && !wasPublished) {
        existing.publishedAt = now;
      } else if (!seed.published) {
        existing.publishedAt = null;
      }
      await existing.save();
      updated++;
    } else {
      await Page.create({
        ...seed,
        publishedAt: seed.published ? now : null,
      } as IPage);
      inserted++;
    }
    touchedSlugs.push(seed.slug);
  }

  console.log(
    `[SEED-PAGES] Upserted ${touchedSlugs.length} default pages ` +
      `(${inserted} inserted, ${updated} updated in place): ${touchedSlugs.join(', ')}.`,
  );

  await mongoose.disconnect();
  console.log('[SEED-PAGES] Done. Disconnected from MongoDB.');
  process.exit(0);
}

main().catch((err) => {
  console.error('[SEED-PAGES] Fatal error while seeding pages:', err);
  try {
    mongoose.disconnect().catch(() => void 0);
  } catch {
    /* ignore */
  }
  process.exit(1);
});
