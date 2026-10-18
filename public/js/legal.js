// Legal documents. Business details and the rental, site and cancellation rules come from Admin → Settings,
// so these pages always match what guests agree to at checkout. Have a Florida attorney review before going live.
(() => {
  const EFFECTIVE = 'October 18, 2026';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const contactBlock = S => `<address class="legal-contact">
    <strong>${esc(S.business_name || 'STAYCAMPRV LLC')}</strong><br>${esc(S.address)}<br>
    Phone: <a href="tel:${esc(S.phone)}">${esc(S.phone)}</a><br>Email: <a href="mailto:${esc(S.email)}">${esc(S.email)}</a></address>`;

  const docs = [
    {
      slug: 'terms', title: 'Terms of Service', short: 'Terms',
      summary: 'The agreement that applies when you use this website, book an RV or RV site, or inquire about an RV or lot for sale.',
      sections: S => {
        const biz = esc(S.business_name || 'STAYCAMPRV LLC');
        return [
          ['About these terms', `<p>These Terms of Service (“Terms”) are an agreement between you and ${biz} (“we,” “us,” “our”). They apply when you use our website, make a reservation for an RV rental or RV site, chat with us, or contact us about an RV or RV lot for sale. By using the website or making a booking you agree to these Terms, our <a href="/legal/privacy">Privacy Policy</a> and our <a href="/legal/cancellation">Cancellation & Refund Policy</a>. If you do not agree, please do not use the website.</p>
            <p>You must be at least 18 years old to make a booking. RV renters must also meet the driver requirements below.</p>`],
          ['Reservations and pricing', `<p>Prices shown on the website are calculated at the time you request a booking and include the nightly, weekly or monthly rate, any add-ons you select, applicable cleaning or preparation fees, and applicable taxes. The refundable security deposit for RV rentals is shown separately and is collected at pickup.</p>
            <p>A booking request is not confirmed until we confirm it. If payment is taken online, your booking is confirmed when payment is received. If you choose to pay at check-in, your dates are held as “pending” until our team confirms them. We may decline or cancel a booking that contains a pricing error, that violates these Terms, or that we cannot fulfill; if we do, we will refund any amount you paid for it.</p>
            <p>You are responsible for giving us accurate information. Your confirmation code (for example, SC-7KQ2MX) and email address let you view, pay for or cancel your booking under “Manage Booking.” Keep them private.</p>`],
          ['RV rental terms', `<p>${esc(S.rental_policy)}</p>
            <p>Pickup is at ${esc(S.rv_pickup_time)} and return is by ${esc(S.rv_return_time)} unless we agree otherwise in writing. The renter named on the booking is responsible for the RV during the rental, including traffic and parking violations, tolls, fuel, propane, and damage not covered by the damage protection plan (if purchased). A separate written rental agreement and vehicle condition report may be signed at pickup; if it conflicts with these Terms, the signed rental agreement controls for that rental.</p>
            <p>RVs may only be driven by approved drivers listed at pickup, may not be used for any illegal purpose, commercial hauling, off-road driving, or travel outside the United States, and may not be sublet.</p>`],
          ['RV site rules', `<p>${esc(S.site_policy)}</p>
            <p>Check-in begins at ${esc(S.check_in_time)} and check-out is by ${esc(S.check_out_time)}. Your site is a license to occupy the space for the dates booked; it does not create a tenancy. Stays of 30 nights or longer may be subject to additional written terms. We may ask a guest to leave, without refund, for conduct that endangers people or property or that seriously disturbs other guests, and we may relocate a reservation to a comparable site when necessary.</p>`],
          ['Cancellations and refunds', `<p>${esc(S.cancellation_policy)}</p><p>See the full <a href="/legal/cancellation">Cancellation & Refund Policy</a>.</p>`],
          ['RV and RV lot sales', `<p>Listings for RVs and RV lots are for information only and are not an offer that can be accepted online. Prices exclude tax, title, tag, registration and any dealer or closing fees unless stated. Every listing is subject to prior sale, inspection, and a separate written purchase agreement. Photos marked as representative may not show the exact unit.</p>
            <p>Payment estimates and the payment calculator are illustrations only. They are not a credit offer or a commitment to lend; actual rates and terms depend on credit approval and the lender. For RV lots, you should review the deed, survey, title commitment, and any HOA or community documents before buying.</p>`],
          ['Your use of the website and chat', `<p>You agree not to misuse the website or live chat, including by submitting false bookings, attempting to access accounts or data that are not yours, interfering with the website’s operation, sending spam or abusive messages, or scraping content. Live chat replies and instant answers are provided for convenience; the confirmed details of your booking and any signed agreement control.</p>`],
          ['Content and photos', `<p>The website’s design, text, logo and our own photos belong to ${biz} or its licensors. Some photos are licensed stock images used to illustrate our services. You may view and print pages for personal use but may not copy or reuse content commercially without permission.</p>`],
          ['Disclaimers', `<p>We work to keep availability, pricing and listing details accurate, but the website is provided “as is” and may contain errors or be unavailable at times. To the fullest extent permitted by law, we disclaim implied warranties for the website itself. Nothing in these Terms limits any warranty that applies to a vehicle or lot under a separate written agreement, or any right you have that cannot be waived under applicable law.</p>`],
          ['Limitation of liability', `<p>To the fullest extent permitted by law, ${biz} is not liable for indirect, incidental, special or consequential damages arising from your use of the website, and our total liability for any claim relating to a booking is limited to the amount you paid for that booking. This does not limit liability for our gross negligence, willful misconduct, or anything else that cannot be limited under Florida law.</p>`],
          ['Indemnity', `<p>You agree to indemnify ${biz} against claims, losses and costs (including reasonable attorneys’ fees) arising from your breach of these Terms, your misuse of an RV or site, or the acts of anyone in your party, except to the extent caused by our own negligence or misconduct.</p>`],
          ['Governing law and disputes', `<p>These Terms are governed by the laws of the State of Florida, without regard to conflict-of-law rules. Before filing a claim, please contact us so we can try to resolve it informally. Any dispute that is not resolved will be brought in the state or federal courts located in the county of our principal place of business in Florida, and you and we consent to that jurisdiction, except that either party may bring an individual claim in small claims court where eligible.</p>`],
          ['Changes to these terms', `<p>We may update these Terms from time to time. The “Effective” date above shows when they last changed. The Terms in effect when you made a booking apply to that booking.</p>`],
          ['Contact us', contactBlock(S)]
        ];
      }
    },
    {
      slug: 'privacy', title: 'Privacy Policy', short: 'Privacy',
      summary: 'What information we collect, how we use it, who we share it with, and the choices you have.',
      sections: S => {
        const biz = esc(S.business_name || 'STAYCAMPRV LLC');
        return [
          ['Overview', `<p>This Privacy Policy explains how ${biz} collects, uses and protects personal information when you use our website, book with us, chat with us, or contact us. <strong>We do not sell your personal information, and we do not use advertising or analytics trackers on this website.</strong></p>`],
          ['Information we collect', `<ul>
            <li><strong>Booking information:</strong> your name, email, phone number, travel dates, number of guests, RV or rig details (length and type), add-ons, notes you give us, and booking and payment status.</li>
            <li><strong>Inquiries and messages:</strong> information you submit through the contact form, sales inquiry, offer, tour or financing request forms, such as your name, email, phone, offer amount, preferred date and message.</li>
            <li><strong>Live chat:</strong> your name, email, optional phone number, chat topic, whether you asked for a call back, the page you started the chat from, and the messages exchanged with our team.</li>
            <li><strong>Payment information:</strong> if online payment is available, card payments are processed by Stripe. Your card number is entered on Stripe’s secure page and is never sent to or stored on our servers. We receive the payment status and amount.</li>
            <li><strong>Technical information:</strong> like most websites, our server receives your IP address and basic request information when you visit. We use it to operate and secure the website (for example, to limit repeated form submissions).</li>
            <li><strong>At pickup or check-in:</strong> we may ask to see a driver’s license, proof of insurance and vehicle details to complete your rental or stay.</li></ul>`],
          ['How we use your information', `<ul>
            <li>To take, confirm, manage and support your booking, and to collect payment and security deposits.</li>
            <li>To answer your questions by chat, email or phone, including calling you back when you ask us to.</li>
            <li>To respond to sales inquiries, offers, tours and financing requests.</li>
            <li>To operate, secure and improve the website and our services, prevent fraud, and keep records required by law (such as tax records).</li>
            <li>To enforce our terms and protect the safety of guests, staff and property.</li></ul>
            <p>We contact you about your booking or request. We do not send marketing messages unless you ask to receive them.</p>`],
          ['How we share information', `<p>We share personal information only as needed to provide our services:</p><ul>
            <li><strong>Payment processing:</strong> Stripe, Inc. processes online card payments under its own privacy policy.</li>
            <li><strong>Lenders:</strong> if you submit a financing request, we may share the details you provide with a lender you choose to work with.</li>
            <li><strong>Service providers</strong> that host or support our website and systems, bound to protect the information.</li>
            <li><strong>Legal and safety:</strong> when required by law, to respond to legal process, or to protect rights, property or safety, including insurers and authorities after an accident, theft or damage to an RV.</li>
            <li><strong>Business transfer:</strong> as part of a sale or reorganization of our business, subject to this policy.</li></ul>
            <p>Our website loads fonts from Google Fonts, which means your browser connects to Google’s servers and shares your IP address with Google. The “Open in Maps” link takes you to Google Maps only if you click it.</p>`],
          ['Cookies and browser storage', `<p>We use only what the website needs to work:</p><ul>
            <li><strong>Live chat</strong> stores a random chat code in your browser’s local storage so you can return to your conversation. Choosing “End chat” removes it.</li>
            <li><strong>Manage Booking</strong> keeps your booking email in session storage until you close the tab, so you don’t have to re-enter it.</li>
            <li><strong>Staff sign-in</strong> uses one secure cookie for employees signed in to the back office. Guests do not receive cookies.</li></ul>
            <p>We do not use advertising, tracking or analytics cookies, so there is no cookie banner.</p>`],
          ['How long we keep information', `<p>We keep booking and payment records for as long as needed to provide the service and to meet tax, accounting and legal requirements, generally up to seven years. Chat transcripts, inquiries and messages are kept as long as needed to handle your request and follow up, and are then deleted or archived. You can ask us to delete information we are not required to keep.</p>`],
          ['Security', `<p>We protect personal information with measures such as encrypted connections (HTTPS), hashed staff passwords, access limited to authorized staff, and processing card payments only through Stripe. No method of transmission or storage is completely secure, so we cannot guarantee absolute security. Please keep your confirmation code private.</p>`],
          ['Your choices and rights', `<p>You can ask us to access, correct or delete your personal information, or ask questions about how we use it, by contacting us below. We will verify your request (for example, by confirming your booking code and email) and respond within a reasonable time, and within any period required by applicable law. Depending on where you live, you may have additional rights under your state’s privacy law; we will honor those rights where they apply. We will not discriminate against you for exercising a privacy right.</p>`],
          ['Children', `<p>Our website and services are intended for adults. We do not knowingly collect personal information from children under 13. If you believe a child has given us information, please contact us and we will delete it.</p>`],
          ['Changes to this policy', `<p>We may update this Privacy Policy as our services change. The “Effective” date above shows when it last changed. If we make a significant change, we will post a notice on the website.</p>`],
          ['Contact us', `<p>For privacy questions or requests, contact:</p>${contactBlock(S)}`]
        ];
      }
    },
    {
      slug: 'cancellation', title: 'Cancellation & Refund Policy', short: 'Cancellations',
      summary: 'How to cancel or change a booking, how refunds work, and how security deposits are handled.',
      sections: S => [
        ['Our cancellation policy', `<p class="legal-callout">${esc(S.cancellation_policy)}</p><p>This policy applies to both RV rentals and RV site reservations unless your booking confirmation says otherwise.</p>`],
        ['How to cancel', `<p>You can cancel online up to your arrival or pickup date: go to <a href="/manage">Manage Booking</a>, enter your confirmation code and email, and choose “Cancel booking.” You can also cancel by phone at <a href="tel:${esc(S.phone)}">${esc(S.phone)}</a> or by email at <a href="mailto:${esc(S.email)}">${esc(S.email)}</a>. The time we receive your cancellation determines which refund tier applies.</p>`],
        ['Changing dates', `<p>To change dates, RV or site, use “Request a change” on your booking page or contact us. Changes depend on availability and may change the price. A change that shortens your stay inside a non-refundable window is treated as a partial cancellation.</p>`],
        ['Refunds', `<ul><li>Refunds are issued to the original payment method. For card payments, allow 5–7 business days after we process the refund for it to appear, depending on your bank.</li>
          <li>Taxes are refunded in proportion to the refunded amount.</li>
          <li>Add-ons that have already been delivered or used (for example, delivery and setup) are not refundable.</li>
          <li>No refund is given for early departure, late arrival, or no-shows unless required by this policy or by law.</li></ul>`],
        ['Weather and closures', `<p>If we close the resort or cannot provide your RV or site because of a hurricane, named storm, government order or other emergency, you will receive a full refund for the affected nights, or a credit if you prefer.</p>`],
        ['Security deposits (RV rentals)', `<p>The refundable security deposit is collected at pickup and returned within 7 days after the RV is returned and inspected, minus any charges allowed under the rental terms, such as damage not covered by protection, excess mileage, missing items, fuel or propane, cleaning beyond normal use, or smoking. We will give you an itemized list of any deductions.</p>`],
        ['If we cancel', `<p>If we must cancel your booking (for example, because an RV is unexpectedly out of service), we will offer a comparable alternative if one is available or give you a full refund.</p>`],
        ['Questions', contactBlock(S)]
      ]
    },
    {
      slug: 'accessibility', title: 'Accessibility Statement', short: 'Accessibility',
      summary: 'Our commitment to making our website and resort usable for everyone.',
      sections: S => [
        ['Our commitment', `<p>${esc(S.business_name || 'STAYCAMPRV LLC')} wants everyone to be able to plan and book a trip with us. We aim for this website to meet the Web Content Accessibility Guidelines (WCAG) 2.1, Level AA.</p>`],
        ['What we do', `<ul><li>Pages are built with clear headings, labeled form fields and descriptive link text.</li>
          <li>The site can be used with a keyboard, including the booking calendar, menus, photo gallery and live chat.</li>
          <li>Text and controls are designed for readable color contrast and work when zoomed to 200%.</li>
          <li>The layout adapts to phones and tablets, and animations are reduced when your device asks for reduced motion.</li></ul>`],
        ['Known limitations', `<p>Some photos and third-party content may not yet have full descriptions, and older PDFs or documents we send by email may not be fully accessible. We are working to improve these.</p>`],
        ['At the resort', `<p>If you need an accessible site, help with RV orientation, or other accommodations during your stay, tell us when you book or contact us, and we will do our best to help.</p>`],
        ['Feedback and help', `<p>If something on this website is hard to use, or you would like help making a booking, please contact us. We will respond and help you complete your booking by phone or email.</p>${contactBlock(S)}`]
      ]
    }
  ];

  const slugify = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  window.RFLegal = {
    effective: EFFECTIVE,
    docs: docs.map(({ slug, title, short, summary }) => ({ slug, title, short, summary })),
    render(slug, S) {
      const doc = docs.find(d => d.slug === slug) || docs[0];
      const sections = doc.sections(S).map(([h, body]) => ({ id: slugify(h), h, body }));
      return { ...doc, sections };
    }
  };
})();
