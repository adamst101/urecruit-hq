// src/pages/PrivacyPolicy.jsx
import React from "react";
import { useNavigate } from "react-router-dom";

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&display=swap');`;
const EFFECTIVE_DATE = "March 1, 2026";
const COMPANY = "URecruitHQ";
const CONTACT_EMAIL = "support@urecruithq.com";
const SITE = "urecruithq.com";

export default function PrivacyPolicy() {
  const nav = useNavigate();

  return (
    <div style={{ background: "#0a0e1a", color: "#f9fafb", minHeight: "100vh", fontFamily: "'DM Sans', Inter, system-ui, sans-serif" }}>
      <style>{FONTS}</style>

      {/* Nav */}
      <nav style={{ background: "#ffffff", borderBottom: "1px solid #e5e7eb", padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <button
          onClick={() => nav("/Home")}
          style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 18, fontWeight: 800 }}
        >
          <span style={{ color: "#111827" }}>URecruit</span>
          <span style={{ color: "#e8a020" }}>HQ</span>
        </button>
        <button
          onClick={() => nav(-1)}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "#6b7280", fontFamily: "'DM Sans', sans-serif" }}
        >
          ← Back
        </button>
      </nav>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "60px 24px 80px" }}>
        {/* Header */}
        <div style={{ marginBottom: 48 }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 14, letterSpacing: 3, color: "#e8a020", textTransform: "uppercase", marginBottom: 12 }}>
            Legal
          </div>
          <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(40px, 6vw, 64px)", color: "#f9fafb", margin: "0 0 16px", lineHeight: 1 }}>
            PRIVACY POLICY
          </h1>
          <p style={{ fontSize: 14, color: "#6b7280", margin: 0 }}>
            Effective Date: {EFFECTIVE_DATE}
          </p>
        </div>

        <Section>
          <p>
            {COMPANY} ("we," "us," or "our") operates the website located at {SITE} (the "Site") and provides the URecruitHQ service (the "Service"). This Privacy Policy explains what information we collect, how we use it, and your rights regarding that information.
          </p>
          <p>
            By using the Service, you agree to the collection and use of information in accordance with this Policy.
          </p>
        </Section>

        <Section title="1. Information We Collect">
          <p><strong style={{ color: "#f9fafb" }}>Information you provide directly:</strong></p>
          <ul>
            <li><strong>Account information:</strong> Email address, name, and password when you create an account.</li>
            <li><strong>Athlete profile:</strong> Athlete name, graduation year, sport, home city and state, and parent/guardian contact information (first name, last name, phone number).</li>
            <li><strong>Payment information:</strong> Billing is handled entirely by Stripe, Inc. We do not receive or store your payment card number. We may receive a transaction confirmation, the last four digits of your card, and billing zip code from Stripe for record-keeping.</li>
            <li><strong>Communications:</strong> If you contact us by email, we retain that correspondence.</li>
          </ul>

          <p style={{ marginTop: 16 }}><strong style={{ color: "#f9fafb" }}>Information collected automatically:</strong></p>
          <ul>
            <li><strong>Usage data:</strong> Pages visited, features used, session duration, and general interaction patterns within the Service.</li>
            <li><strong>Device and browser information:</strong> Browser type, operating system, and device type, collected for compatibility and security purposes.</li>
            <li><strong>IP address:</strong> Collected for security monitoring and fraud prevention. We do not use IP addresses to identify you by name.</li>
          </ul>
        </Section>

        <Section title="2. How We Use Your Information">
          <p>We use the information we collect to:</p>
          <ul>
            <li>Create and manage your account and athlete profiles.</li>
            <li>Provide access to camp listings, conflict detection, and scheduling tools.</li>
            <li>Process your Season Pass purchase and maintain records of your entitlement.</li>
            <li>Send you service-related emails, including camp alerts and monthly camp agendas you have subscribed to.</li>
            <li>Respond to your support requests.</li>
            <li>Improve the Service by analyzing how it is used.</li>
            <li>Detect and prevent fraudulent activity or abuse.</li>
            <li>Comply with legal obligations.</li>
          </ul>
          <p>
            We do not use your information for targeted advertising. We do not sell, rent, or share your personal information with third parties for their marketing purposes.
          </p>
        </Section>

        <Section title="3. We Never Sell Your Data">
          <p>
            We will never sell, rent, trade, or otherwise transfer your personal information to outside parties for commercial purposes. Your data is used solely to provide and improve the Service.
          </p>
        </Section>

        <Section title="4. Email Communications">
          <p>
            By creating an account, you may receive transactional emails related to your account and purchases. If you opt in, you may also receive:
          </p>
          <ul>
            <li><strong>Monthly Camp Agenda:</strong> A curated list of upcoming camps sent at the start of each month.</li>
            <li><strong>Camp Week Alerts:</strong> A prep reminder sent 7 days before camps on your calendar.</li>
          </ul>
          <p>
            You can opt out of non-transactional emails at any time through your Account settings or by contacting us at {CONTACT_EMAIL}. Transactional emails (such as purchase receipts) cannot be opted out of while you have an active account.
          </p>
        </Section>

        <Section title="5. How We Share Information">
          <p>We share your information only in the following limited circumstances:</p>
          <ul>
            <li>
              <strong>Service providers:</strong> We use trusted third-party services that process data on our behalf, including:
              <ul style={{ marginTop: 8 }}>
                <li><strong>Stripe</strong> — payment processing</li>
                <li><strong>Supabase / base44</strong> — database hosting and authentication infrastructure</li>
              </ul>
              These providers are contractually bound to protect your data and may not use it for their own purposes.
            </li>
            <li style={{ marginTop: 12 }}>
              <strong>Legal requirements:</strong> We may disclose your information if required by law, court order, or governmental authority, or if we believe disclosure is necessary to protect the rights, property, or safety of {COMPANY}, our users, or the public.
            </li>
            <li style={{ marginTop: 12 }}>
              <strong>Business transfers:</strong> In the event of a merger, acquisition, or sale of all or a portion of our assets, your information may be transferred as part of that transaction. We will notify you via email and/or a prominent notice on the Site before your information is transferred and becomes subject to a different privacy policy.
            </li>
          </ul>
        </Section>

        <Section title="6. Data Retention">
          <p>
            We retain your personal information for as long as your account is active or as needed to provide you with the Service. If you delete your account, we will delete or anonymize your personal information within 30 days, except where we are required by law to retain it or where it is necessary for legitimate business purposes such as fraud prevention.
          </p>
        </Section>

        <Section title="7. Data Security">
          <p>
            We take reasonable technical and organizational measures to protect your information from unauthorized access, loss, misuse, or alteration. These measures include encrypted data transmission (HTTPS), access controls, and regular security reviews.
          </p>
          <p>
            However, no method of transmission over the internet or electronic storage is 100% secure. While we strive to use commercially acceptable means to protect your information, we cannot guarantee absolute security.
          </p>
        </Section>

        <Section title="8. Children's Privacy">
          <p>
            The Service is intended for use by parents and guardians on behalf of student athletes. We do not knowingly collect personal information directly from children under the age of 13. Athlete profile information (such as name and graduation year) is entered by parents or guardians, not by the minor athlete directly.
          </p>
          <p>
            If you believe we have inadvertently collected personal information from a child under 13 without parental consent, please contact us at {CONTACT_EMAIL} and we will delete it promptly.
          </p>
        </Section>

        <Section title="9. Your Rights and Choices">
          <p>Depending on where you reside, you may have the following rights regarding your personal information:</p>
          <ul>
            <li><strong>Access:</strong> Request a copy of the personal information we hold about you.</li>
            <li><strong>Correction:</strong> Request that we correct inaccurate or incomplete information.</li>
            <li><strong>Deletion:</strong> Request that we delete your personal information, subject to legal requirements.</li>
            <li><strong>Portability:</strong> Request a machine-readable copy of your data where technically feasible.</li>
            <li><strong>Opt-out of emails:</strong> Unsubscribe from non-transactional marketing emails at any time.</li>
          </ul>
          <p>
            To exercise any of these rights, contact us at <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "#e8a020", textDecoration: "none" }}>{CONTACT_EMAIL}</a>. We will respond within 30 days.
          </p>
        </Section>

        <Section title="10. California Residents (CCPA)">
          <p>
            If you are a California resident, you have additional rights under the California Consumer Privacy Act (CCPA), including the right to know what personal information we collect, the right to delete your personal information, and the right to opt out of the sale of your personal information. We do not sell personal information. To exercise your rights, contact us at {CONTACT_EMAIL}.
          </p>
        </Section>

        <Section title="11. Cookies and Tracking">
          <p>
            We use session cookies and similar technologies to keep you logged in and to understand how the Service is used. We do not use third-party advertising cookies or tracking pixels. You can configure your browser to refuse cookies, though some features of the Service may not function correctly without them.
          </p>
        </Section>

        <Section title="12. Third-Party Links">
          <p>
            The Service contains links to third-party websites, including school athletic pages and camp registration platforms. This Privacy Policy applies only to our Service. We encourage you to review the privacy policies of any third-party sites you visit.
          </p>
        </Section>

        <Section title="13. Changes to This Policy">
          <p>
            We may update this Privacy Policy from time to time. When we do, we will update the effective date at the top of this page. If we make material changes, we will notify you by email or by a prominent notice within the Service. Your continued use of the Service after changes are posted constitutes your acceptance of the updated Policy.
          </p>
        </Section>

        <Section title="14. Contact Us">
          <p>
            If you have any questions, concerns, or requests regarding this Privacy Policy or our data practices, please contact us at:
          </p>
          <p>
            <strong style={{ color: "#f9fafb" }}>{COMPANY}</strong><br />
            <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "#e8a020", textDecoration: "none" }}>{CONTACT_EMAIL}</a>
          </p>
        </Section>
      </div>

      <footer style={{ borderTop: "1px solid #1f2937", padding: "24px", textAlign: "center" }}>
        <p style={{ fontSize: 13, color: "#4b5563", margin: "0 0 8px" }}>
          © 2026 URecruitHQ · Independent planning tool · Not affiliated with any school or camp program
        </p>
        <div style={{ display: "flex", justifyContent: "center", gap: 20 }}>
          <button onClick={() => nav("/TermsOfService")} style={{ background: "none", border: "none", fontSize: 13, color: "#6b7280", cursor: "pointer" }}>Terms of Service</button>
          <button onClick={() => nav("/PrivacyPolicy")} style={{ background: "none", border: "none", fontSize: 13, color: "#e8a020", cursor: "pointer" }}>Privacy Policy</button>
        </div>
      </footer>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 40 }}>
      {title && (
        <h2 style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 24,
          color: "#f9fafb",
          letterSpacing: 1,
          margin: "0 0 16px",
          paddingBottom: 10,
          borderBottom: "1px solid #1f2937",
        }}>
          {title}
        </h2>
      )}
      <div style={{ fontSize: 15, color: "#9ca3af", lineHeight: 1.8 }}>
        {children}
      </div>
    </div>
  );
}
