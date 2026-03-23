// src/pages/TermsOfService.jsx
import React from "react";
import { useNavigate } from "react-router-dom";

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&display=swap');`;
const EFFECTIVE_DATE = "March 1, 2026";
const COMPANY = "URecruitHQ";
const CONTACT_EMAIL = "support@urecruithq.com";
const SITE = "urecruithq.com";

export default function TermsOfService() {
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
            TERMS OF SERVICE
          </h1>
          <p style={{ fontSize: 14, color: "#6b7280", margin: 0 }}>
            Effective Date: {EFFECTIVE_DATE}
          </p>
        </div>

        <Section>
          <p>
            Welcome to {COMPANY}. By accessing or using our website located at {SITE} (the "Site") or any services provided by {COMPANY} (collectively, the "Service"), you agree to be bound by these Terms of Service ("Terms"). Please read them carefully.
          </p>
          <p>
            If you do not agree to these Terms, do not use the Service.
          </p>
        </Section>

        <Section title="1. Who We Are">
          <p>
            {COMPANY} is an independent platform that aggregates publicly available college football camp information to help recruiting families plan their camp schedules. We are not affiliated with, endorsed by, or in partnership with any college, university, athletic program, or camp operator.
          </p>
        </Section>

        <Section title="2. Eligibility">
          <p>
            You must be at least 13 years old to use the Service. If you are under 18, you represent that a parent or legal guardian has reviewed and agreed to these Terms on your behalf. By using the Service, you represent and warrant that you meet these requirements.
          </p>
        </Section>

        <Section title="3. Account Registration">
          <p>
            To access certain features of the Service, you must create an account. You agree to:
          </p>
          <ul>
            <li>Provide accurate, current, and complete information during registration.</li>
            <li>Maintain the security of your password and accept responsibility for all activity under your account.</li>
            <li>Notify us immediately at {CONTACT_EMAIL} if you suspect any unauthorized use of your account.</li>
          </ul>
          <p>
            We reserve the right to suspend or terminate accounts that violate these Terms or that we reasonably believe are being used fraudulently.
          </p>
        </Section>

        <Section title="4. Season Pass and Payment">
          <p>
            Access to paid features of the Service requires the purchase of a Season Pass. By purchasing a Season Pass, you agree to the following:
          </p>
          <ul>
            <li><strong>One-Time Payment.</strong> The Season Pass is a one-time payment for access during a single identified season. It does not automatically renew.</li>
            <li><strong>No Refunds (with Exception).</strong> All purchases are final. However, if you are not satisfied with the Service for any reason, you may contact us at {CONTACT_EMAIL} within 14 days of purchase and we will issue a full refund at our discretion.</li>
            <li><strong>Price Changes.</strong> We reserve the right to change pricing for future seasons. The price at the time of your purchase governs your transaction.</li>
            <li><strong>Stripe.</strong> Payments are processed by Stripe, Inc. By making a purchase, you also agree to Stripe's terms of service. We do not store your payment card information.</li>
          </ul>
        </Section>

        <Section title="5. Permitted Use">
          <p>
            The Service is provided for personal, non-commercial use by recruiting families and athletes. You agree not to:
          </p>
          <ul>
            <li>Reproduce, distribute, or resell any content from the Service.</li>
            <li>Scrape, crawl, or use automated tools to access or copy data from the Service.</li>
            <li>Use the Service to build a competing product or service.</li>
            <li>Attempt to gain unauthorized access to any part of the Service or its infrastructure.</li>
            <li>Use the Service in any way that violates applicable law.</li>
          </ul>
        </Section>

        <Section title="6. Accuracy of Camp Information">
          <p>
            We make every effort to keep camp information accurate and up to date, including weekly verification from official school athletic pages. However:
          </p>
          <ul>
            <li>Camp details (dates, locations, prices, availability) are subject to change by the host institution without notice.</li>
            <li>We do not guarantee the accuracy, completeness, or timeliness of any camp listing.</li>
            <li>You are responsible for verifying camp details directly with the hosting institution before registering or making travel arrangements.</li>
          </ul>
          <p>
            {COMPANY} is not responsible for any loss, cost, or inconvenience arising from reliance on camp information provided through the Service.
          </p>
        </Section>

        <Section title="7. Intellectual Property">
          <p>
            All content, features, and functionality of the Service — including but not limited to text, graphics, logos, software, and data compilations — are the property of {COMPANY} or its licensors and are protected by applicable intellectual property laws.
          </p>
          <p>
            You are granted a limited, non-exclusive, non-transferable license to access and use the Service for its intended personal purpose. No other rights are granted.
          </p>
        </Section>

        <Section title="8. Third-Party Links and Services">
          <p>
            The Service may contain links to third-party websites, including school athletic pages and camp registration platforms (such as Ryzer). These links are provided for convenience only. We do not control, endorse, or assume responsibility for any third-party content, products, or services. Your use of third-party services is governed by their respective terms and privacy policies.
          </p>
        </Section>

        <Section title="9. Disclaimers">
          <p>
            THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR FREE OF VIRUSES OR OTHER HARMFUL COMPONENTS.
          </p>
        </Section>

        <Section title="10. Limitation of Liability">
          <p>
            TO THE FULLEST EXTENT PERMITTED BY LAW, {COMPANY.toUpperCase()} AND ITS OFFICERS, DIRECTORS, EMPLOYEES, AND AGENTS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES — INCLUDING LOST PROFITS, TRAVEL COSTS, OR MISSED OPPORTUNITIES — ARISING OUT OF OR RELATED TO YOUR USE OF THE SERVICE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
          </p>
          <p>
            IN NO EVENT SHALL OUR TOTAL LIABILITY TO YOU FOR ALL CLAIMS EXCEED THE AMOUNT YOU PAID TO US IN THE TWELVE MONTHS PRECEDING THE CLAIM.
          </p>
        </Section>

        <Section title="11. Indemnification">
          <p>
            You agree to indemnify and hold harmless {COMPANY} and its affiliates, officers, and employees from any claims, damages, losses, or expenses (including reasonable attorney's fees) arising out of your use of the Service, your violation of these Terms, or your violation of any rights of another party.
          </p>
        </Section>

        <Section title="12. Termination">
          <p>
            We reserve the right to suspend or terminate your access to the Service at any time, with or without notice, for any reason, including violation of these Terms. Upon termination, your right to use the Service ceases immediately. Provisions that by their nature should survive termination will do so.
          </p>
        </Section>

        <Section title="13. Changes to These Terms">
          <p>
            We may update these Terms from time to time. When we do, we will update the effective date at the top of this page. Your continued use of the Service after changes are posted constitutes your acceptance of the updated Terms. We encourage you to review this page periodically.
          </p>
        </Section>

        <Section title="14. Governing Law">
          <p>
            These Terms are governed by the laws of the United States and the state in which {COMPANY} is incorporated, without regard to conflict of law principles. Any disputes shall be resolved in the courts of competent jurisdiction in that state.
          </p>
        </Section>

        <Section title="15. Contact Us">
          <p>
            If you have any questions about these Terms, please contact us at:
          </p>
          <p>
            <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "#e8a020", textDecoration: "none" }}>{CONTACT_EMAIL}</a>
          </p>
        </Section>
      </div>

      <footer style={{ borderTop: "1px solid #1f2937", padding: "24px", textAlign: "center" }}>
        <p style={{ fontSize: 13, color: "#4b5563", margin: "0 0 8px" }}>
          © 2026 URecruitHQ · Independent planning tool · Not affiliated with any school or camp program
        </p>
        <div style={{ display: "flex", justifyContent: "center", gap: 20 }}>
          <button onClick={() => nav("/TermsOfService")} style={{ background: "none", border: "none", fontSize: 13, color: "#e8a020", cursor: "pointer" }}>Terms of Service</button>
          <button onClick={() => nav("/PrivacyPolicy")} style={{ background: "none", border: "none", fontSize: 13, color: "#6b7280", cursor: "pointer" }}>Privacy Policy</button>
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
