import { LegalDocument, type LegalSection } from "../components/LegalDocument";

const UPDATED_AT = "May 17, 2026";

const intro = [
  'tradelog ("we," "us," or "our") provides a day trading journal for recording trades, reviewing profit and loss, and sharing selected snapshots. This Privacy Policy explains what information we collect, how we use it, and the choices available to you.',
  "By using the service, you agree to the collection and use of information described in this policy. If you do not agree, do not use the service.",
];

const sections: LegalSection[] = [
  {
    title: "Information We Collect",
    body: ["We collect only the information needed to operate and improve the trading journal."],
    items: [
      "Account information, including your Google account identifier, name, and email address when you sign in.",
      "Trade journal information you enter, including trades, account labels, notes, dates, prices, quantities, fees, margin settings, preferences, and generated performance summaries.",
      "Share link information when you create a public or restricted snapshot, including the selected trade data, generated link metadata, and optional expiration settings.",
      "Technical and usage information, such as IP address, browser type, device information, pages viewed, request times, and diagnostic logs.",
      "Session cookies and CSRF tokens used to authenticate browser requests and protect unsafe actions.",
      "Local storage data, including theme settings, cached preferences, and guest-mode trade data stored in your browser. Google sign-in tokens are not stored in local storage.",
    ],
  },
  {
    title: "How We Use Information",
    items: [
      "To authenticate users and provide access to account-based features.",
      "We use Google Sign-In only for authentication and account identification. We do not use Google account information for advertising, sale, or unrelated purposes.",
      "To store, display, update, and delete your trade journal records.",
      "To calculate statistics, summaries, calendar views, and shareable snapshots.",
      "To remember preferences such as theme, display mode, and table sorting.",
      "To monitor reliability, protect the service, troubleshoot issues, and improve the product.",
      "To respond to support requests or legal obligations.",
    ],
  },
  {
    title: "How We Share Information",
    body: [
      "We do not sell your personal information. We share information only as needed to provide the service, comply with law, or protect our rights.",
    ],
    items: [
      "Google services may process information for authentication and related account functionality. Google's privacy policy applies to Google's handling of that information.",
      "Amazon Web Services (AWS) provides hosting, compute, storage, networking, logging, and related cloud infrastructure used to operate the application and API. AWS may process data necessary to provide those services under its own privacy, security, and service terms.",
      "Neon provides the managed PostgreSQL database infrastructure used by the service. Neon may store and process account, journal, share link, and application data as needed to provide database services under its own privacy, security, and service terms.",
      "Personal information may be stored or processed in Canada, the United States, or other locations where our service providers operate.",
      "Information included in a share link may be visible to anyone who has access to that link, depending on the settings you choose.",
      "We may disclose information if required by law or if necessary to protect the security, rights, property, or safety of users, the service, or others.",
    ],
  },
  {
    title: "Third-Party Provider Responsibility",
    body: [
      "AWS and Neon are independent third-party service providers. We remain responsible for our configuration and use of those services and for personal information under our control. These providers operate their own systems and services under their own terms, privacy, and security practices.",
      "You can review AWS's Privacy Notice at https://aws.amazon.com/privacy/ and Neon's Privacy Policy at https://neon.com/privacy-guide.",
    ],
  },
  {
    title: "Financial and Brokerage Data",
    body: [
      "The service is a journal and analytics tool. We do not ask for brokerage credentials, we do not connect to brokerage accounts, and we do not execute or submit trades on your behalf.",
    ],
  },
  {
    title: "Security and Retention",
    body: [
      "We use reasonable administrative, technical, and organizational safeguards to protect information. No system can be guaranteed to be perfectly secure.",
      "If we become aware of a privacy or security incident involving personal information, we will assess and respond to it in accordance with applicable law, including any required notices to affected individuals or regulators.",
      "We retain account and journal information while your account is active or as needed to provide the service, comply with legal obligations, resolve disputes, prevent abuse, or enforce our terms.",
    ],
  },
  {
    title: "Your Choices",
    items: [
      "You may update or delete trade journal data through the application where supported.",
      "You may request access to personal information we hold about you and ask us to correct inaccurate or incomplete personal information, subject to applicable law.",
      "You may request account deletion or data assistance by contacting us.",
      "You may sign out to clear the browser session cookie, and you may clear browser local storage to remove guest-mode data and locally cached preferences from your device.",
      "You may stop using Google sign-in or revoke access through your Google account settings.",
    ],
  },
  {
    title: "Children and Minors",
    body: [
      "The service is not intended for minors. We do not knowingly collect personal information from children or minors where parental or guardian consent would be required by applicable law.",
    ],
  },
  {
    title: "Changes to This Policy",
    body: [
      'We may update this Privacy Policy from time to time. When we do, we will update the "Last Updated" date above. Continued use of the service after changes become effective means you accept the revised policy.',
    ],
  },
  {
    title: "Governing Law",
    body: [
      "This Privacy Policy is governed by the laws of the Province of British Columbia and the federal laws of Canada applicable there, without regard to conflict of law principles.",
    ],
  },
  {
    title: "Privacy Contact",
    body: [
      "Questions, access requests, correction requests, deletion requests, or privacy complaints can be sent to the Privacy Officer at camcreativesolutions@gmail.com.",
    ],
  },
];

export function meta() {
  return [
    { title: "Privacy Policy | tradelog" },
    { name: "description", content: "Privacy Policy for the tradelog day trading journal." },
  ];
}

export default function PrivacyPolicy() {
  return (
    <LegalDocument
      title="Privacy Policy"
      updatedAt={UPDATED_AT}
      intro={intro}
      sections={sections}
    />
  );
}
