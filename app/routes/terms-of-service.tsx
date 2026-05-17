import { LegalDocument, type LegalSection } from "../components/LegalDocument";

const UPDATED_AT = "May 17, 2026";

const intro = [
  'These Terms of Service ("Terms") govern your access to and use of tradelog, a day trading journal for recording trades, reviewing performance, and sharing selected snapshots.',
  "By accessing or using the service, you agree to these Terms and the Privacy Policy. If you do not agree, do not use the service.",
];

const sections: LegalSection[] = [
  {
    title: "Use of the Service",
    body: [
      "We grant you a limited, non-exclusive, non-transferable, revocable license to use the service for personal trade journaling, review, and analysis, subject to these Terms.",
    ],
  },
  {
    title: "Eligibility",
    body: [
      "You must be the age of majority in your province, state, or country of residence to use the service. The service is not intended for minors.",
    ],
  },
  {
    title: "Accounts",
    body: [
      "Some features require Google sign-in. You are responsible for maintaining access to your account, protecting your credentials, and all activity that occurs under your account.",
      "You agree to provide accurate account information and to notify us if you believe your account has been accessed without authorization.",
    ],
  },
  {
    title: "Your Data and Share Links",
    body: [
      "You are responsible for the trade records, notes, account labels, and other information you enter into the service.",
      "If you create a share link, anyone with access to that link may be able to view the selected snapshot unless the link is restricted or expires. Review shared content carefully before distributing a link.",
      "You are responsible for managing and revoking share links. Deleting or expiring a share link may prevent future access, but we cannot control copies, screenshots, exports, or other records created by people who previously accessed it.",
    ],
  },
  {
    title: "No Financial Advice",
    body: [
      "The service is provided for record-keeping and informational purposes only. It does not provide financial, investment, tax, legal, or trading advice.",
      "The service is not a broker, dealer, investment adviser, portfolio manager, marketplace, exchange, or trading platform. We do not recommend securities, strategies, trades, or account allocations.",
      "You are solely responsible for your trading decisions, tax reporting, and verification of any calculations or information before relying on them.",
    ],
  },
  {
    title: "Calculation Limitations",
    body: [
      "Performance summaries, profit and loss calculations, currency conversions, fees, and tax-related views may be incomplete, delayed, inaccurate, or based on user-entered data. You are responsible for verifying all records before relying on them.",
    ],
  },
  {
    title: "Prohibited Conduct",
    items: [
      "Using the service for unlawful, abusive, fraudulent, or unauthorized purposes.",
      "Attempting to access another user's account, data, systems, or share links without authorization.",
      "Interfering with, disrupting, scraping, reverse engineering, overloading, or probing the service or related infrastructure.",
      "Uploading malicious code or attempting to bypass security, authentication, rate limits, or access controls.",
      "Copying, reselling, sublicensing, or commercially exploiting the service without our written permission.",
      "Misrepresenting your identity, affiliation, or authorization to use the service.",
    ],
  },
  {
    title: "Availability and Changes",
    body: [
      "We may change, suspend, or discontinue any part of the service at any time. We are not responsible for losses caused by service interruptions, unavailable features, data entry errors, or incorrect assumptions based on displayed information.",
    ],
  },
  {
    title: "Intellectual Property",
    body: [
      "The service, software, interface, design, text, graphics, logos, and related materials are owned by us or our licensors and are protected by intellectual property laws.",
      "These Terms do not transfer any ownership rights to you. You retain responsibility for the trade journal content you enter.",
    ],
  },
  {
    title: "Third-Party Services",
    body: [
      "The service relies on third-party services, including Google authentication, Amazon Web Services (AWS) cloud infrastructure, and Neon managed PostgreSQL database infrastructure.",
      "We remain responsible for our configuration and use of those services and for personal information under our control. These providers operate their own systems and services under their own terms, privacy, and security practices.",
      "Your use of the service may involve data being processed by these providers as necessary to operate authentication, hosting, storage, database, logging, networking, and application infrastructure.",
      "Personal information may be stored or processed in Canada, the United States, or other locations where our service providers operate.",
    ],
  },
  {
    title: "Termination",
    body: [
      "We may suspend or terminate access to the service at any time, including if you violate these Terms or create risk for the service or other users. You may stop using the service at any time.",
    ],
  },
  {
    title: "Disclaimer of Warranties",
    body: [
      'The service is provided "as is" and "as available." To the maximum extent permitted by law, we disclaim all warranties, express or implied, including warranties of merchantability, fitness for a particular purpose, non-infringement, accuracy, reliability, availability, and security.',
    ],
  },
  {
    title: "Limitation of Liability",
    body: [
      "To the maximum extent permitted by law, tradelog and its affiliates, employees, contractors, suppliers, and licensors will not be liable for indirect, incidental, special, consequential, punitive, or exemplary damages, or for lost profits, lost data, loss of goodwill, trading losses, tax consequences, or business interruption arising from or related to your use of the service.",
      "To the maximum extent permitted by law, our total liability for any claim related to the service will not exceed $99.00 CAD.",
    ],
  },
  {
    title: "Indemnification",
    body: [
      "You agree to defend, indemnify, and hold harmless tradelog and its affiliates, employees, contractors, suppliers, and licensors from claims, damages, liabilities, costs, and expenses arising from your use of the service, your data, your share links, your violation of these Terms, or your violation of law or third-party rights.",
    ],
  },
  {
    title: "Governing Law",
    body: [
      "These Terms are governed by the laws of the Province of British Columbia and the federal laws of Canada applicable there, without regard to conflict of law principles.",
    ],
  },
  {
    title: "Changes to These Terms",
    body: [
      'We may update these Terms from time to time. When we do, we will update the "Last Updated" date above. Continued use of the service after changes become effective means you accept the revised Terms.',
    ],
  },
  {
    title: "Contact",
    body: ["Questions about these Terms can be sent to camcreativesolutions@gmail.com."],
  },
];

export function meta() {
  return [
    { title: "Terms of Service | tradelog" },
    { name: "description", content: "Terms of Service for the tradelog day trading journal." },
  ];
}

export default function TermsOfService() {
  return (
    <LegalDocument
      title="Terms of Service"
      updatedAt={UPDATED_AT}
      intro={intro}
      sections={sections}
    />
  );
}
