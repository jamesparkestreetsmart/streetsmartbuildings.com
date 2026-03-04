export const metadata = {
  title: "Privacy Policy — Eagle Eyes",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-16 px-4">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow p-8 md:p-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-500 mb-8">
          Effective Date: March 4, 2026
        </p>

        <p className="text-gray-700 leading-relaxed mb-6">
          Street Smart Buildings LLC (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) operates the
          Eagle Eyes building-monitoring platform. This Privacy Policy explains
          what information we collect, how we use it, and your choices regarding
          that information.
        </p>

        <Section title="1. Information We Collect">
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Account information</strong> — name, email address, phone
              number, and organization code provided during registration.
            </li>
            <li>
              <strong>Building &amp; sensor data</strong> — temperature,
              humidity, equipment status, and other readings transmitted by
              devices connected to the platform.
            </li>
            <li>
              <strong>Usage data</strong> — pages visited, features used,
              browser type, and IP address collected automatically when you
              interact with the platform.
            </li>
          </ul>
        </Section>

        <Section title="2. How We Use Your Information">
          <ul className="list-disc pl-5 space-y-1">
            <li>Operating and improving the Eagle Eyes platform.</li>
            <li>
              Sending operational alerts (e.g., equipment faults, threshold
              breaches) via SMS, email, or in-app notifications.
            </li>
            <li>
              Generating analytics, benchmarks, and reports for your buildings
              and equipment.
            </li>
            <li>Responding to support requests and account inquiries.</li>
          </ul>
        </Section>

        <Section title="3. SMS &amp; Phone Numbers">
          <p>
            If you provide a phone number, it is used <strong>only</strong> for
            operational alerts related to your monitored buildings and equipment.
            We do not use your phone number for marketing messages or share it
            with third parties for promotional purposes.
          </p>
        </Section>

        <Section title="4. Data Sharing">
          <p>
            We do <strong>not</strong> sell your personal information to third
            parties. We may share data only in the following circumstances:
          </p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>
              With service providers who assist in operating the platform (e.g.,
              hosting, SMS delivery), under strict confidentiality agreements.
            </li>
            <li>When required by law or to protect our legal rights.</li>
          </ul>
        </Section>

        <Section title="5. Data Security">
          <p>
            We use industry-standard security measures — including encryption in
            transit and at rest — to protect your information. However, no method
            of transmission over the Internet is 100&nbsp;% secure.
          </p>
        </Section>

        <Section title="6. Your Choices">
          <ul className="list-disc pl-5 space-y-1">
            <li>
              You may update or delete your account information by contacting us.
            </li>
            <li>
              You may opt out of SMS alerts at any time by replying{" "}
              <strong>STOP</strong> to any message.
            </li>
          </ul>
        </Section>

        <Section title="7. Changes to This Policy">
          <p>
            We may update this Privacy Policy from time to time. Material
            changes will be communicated via the platform or email.
          </p>
        </Section>

        <Section title="8. Contact Us" last>
          <p>
            If you have questions about this Privacy Policy, contact us at{" "}
            <a
              href="mailto:james.parke@streetsmartbuildings.com"
              className="text-green-700 font-semibold hover:underline"
            >
              james.parke@streetsmartbuildings.com
            </a>
            .
          </p>
        </Section>

        <BackLink />
      </div>
    </div>
  );
}

function Section({
  title,
  last,
  children,
}: {
  title: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={last ? "" : "mb-6"}>
      <h2 className="text-lg font-semibold text-gray-900 mb-2">{title}</h2>
      <div className="text-gray-700 leading-relaxed">{children}</div>
    </section>
  );
}

function BackLink() {
  return (
    <div className="mt-10 pt-6 border-t border-gray-200 text-center">
      <a href="/" className="text-green-700 font-semibold hover:underline text-sm">
        &larr; Back to Eagle Eyes
      </a>
    </div>
  );
}
