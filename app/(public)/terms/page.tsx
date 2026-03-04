export const metadata = {
  title: "Terms & Conditions — Eagle Eyes",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-16 px-4">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow p-8 md:p-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Terms &amp; Conditions
        </h1>
        <p className="text-sm text-gray-500 mb-8">
          Effective Date: March 4, 2026
        </p>

        <p className="text-gray-700 leading-relaxed mb-6">
          These Terms &amp; Conditions (&quot;Terms&quot;) govern your use of the Eagle
          Eyes building-monitoring platform operated by Street Smart Buildings
          LLC (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;). By accessing or using the platform you
          agree to be bound by these Terms.
        </p>

        <Section title="1. The Service">
          <p>
            Eagle Eyes is a facility communication and monitoring platform that
            collects sensor and equipment data from your buildings, provides
            real-time dashboards, analytics, and delivers operational alerts to
            help you manage your facilities effectively.
          </p>
        </Section>

        <Section title="2. SMS Alert Program">
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Program name:</strong> Eagle Eyes Alerts
            </li>
            <li>
              <strong>Purpose:</strong> Operational notifications only —
              equipment faults, threshold breaches, and system status updates.
              No marketing messages are sent.
            </li>
            <li>
              <strong>Message frequency:</strong> Varies based on alert
              conditions at your monitored sites.
            </li>
            <li>
              <strong>Message &amp; data rates may apply.</strong> Contact your
              carrier for details.
            </li>
            <li>
              <strong>Opt-out:</strong> Reply <strong>STOP</strong> to any
              message to unsubscribe from SMS alerts.
            </li>
            <li>
              <strong>Help:</strong> Reply <strong>HELP</strong> to any message,
              or email{" "}
              <a
                href="mailto:james.parke@streetsmartbuildings.com"
                className="text-green-700 font-semibold hover:underline"
              >
                james.parke@streetsmartbuildings.com
              </a>
              .
            </li>
          </ul>
        </Section>

        <Section title="3. Account Responsibilities">
          <p>
            You are responsible for maintaining the confidentiality of your
            account credentials and for all activity under your account. You
            agree to provide accurate and current information during
            registration.
          </p>
        </Section>

        <Section title="4. Acceptable Use">
          <p>
            You agree not to misuse the platform, interfere with its operation,
            or attempt to access data belonging to other organizations. We
            reserve the right to suspend accounts that violate these Terms.
          </p>
        </Section>

        <Section title="5. Intellectual Property">
          <p>
            All content, software, and trademarks associated with Eagle Eyes and
            Street Smart Buildings are the property of Street Smart Buildings
            LLC. You may not reproduce or redistribute platform content without
            written permission.
          </p>
        </Section>

        <Section title="6. Limitation of Liability">
          <p>
            The platform is provided &quot;as is.&quot; To the fullest extent permitted by
            law, Street Smart Buildings LLC shall not be liable for any
            indirect, incidental, or consequential damages arising from your use
            of the platform.
          </p>
        </Section>

        <Section title="7. Changes to These Terms">
          <p>
            We may revise these Terms at any time. Material changes will be
            communicated via the platform or email. Continued use after changes
            constitutes acceptance of the updated Terms.
          </p>
        </Section>

        <Section title="8. Contact Us" last>
          <p>
            Questions about these Terms? Contact us at{" "}
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
