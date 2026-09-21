/**
 * Vercel Serverless Function: /api/send-order-email
 * Sends order confirmation emails via Resend.
 * API key is read from the RESEND_API_KEY environment variable — never hardcoded.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const ADMIN_EMAIL     = 'contact@gimmeemwah.com';
const FROM_NAME       = 'MWAH';
const FROM_ADDRESS    = 'orders@gimmeemwah.com';

module.exports = async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const API_KEY = process.env.RESEND_API_KEY;
  if (!API_KEY) {
    console.error('[MWAH Email] RESEND_API_KEY is not set.');
    return res.status(500).json({ error: 'Email service is not configured.' });
  }

  const { orderNum, info, cart, total, paymentMethod } = req.body || {};

  if (!info?.email || !cart?.length) {
    return res.status(400).json({ error: 'Missing required order fields.' });
  }

  const pm = paymentMethod || 'N/A';

  // ── Build Invoice HTML ─────────────────────────────────────
  function buildInvoiceHTML({ isAdmin }) {
    const itemRows = (cart || []).map(item => {
      const lineTotal = ((parseFloat(item.price) || 0) * (item.qty || 1)).toFixed(2);
      return `
        <tr>
          <td style="padding:12px 16px;border-bottom:1px solid #2a2a2a;color:#e8e8e8;font-size:0.9rem;">${item.name}</td>
          <td style="padding:12px 16px;border-bottom:1px solid #2a2a2a;color:#bbb;font-size:0.9rem;text-align:center;">${item.qty || 1}</td>
          <td style="padding:12px 16px;border-bottom:1px solid #2a2a2a;color:#bbb;font-size:0.9rem;text-align:right;">$${parseFloat(item.price || 0).toFixed(2)}</td>
          <td style="padding:12px 16px;border-bottom:1px solid #2a2a2a;color:#e75480;font-weight:700;font-size:0.9rem;text-align:right;">$${lineTotal}</td>
        </tr>`;
    }).join('');

    const greeting = isAdmin
      ? `<p style="color:#bbb;margin:0 0 8px;">A new order has been placed on <strong style="color:#e75480;">MWAH</strong>. Full details below.</p>`
      : `<p style="color:#bbb;margin:0 0 8px;">Hi <strong style="color:#fff;">${info.full_name}</strong>, thank you for your order! Here is your order confirmation and invoice.</p>
         <p style="color:#bbb;margin:0 0 24px;font-size:0.85rem;">We will send you payment instructions via email within a few minutes. Your order is confirmed once payment is received.</p>`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Order ${orderNum} | MWAH</title>
</head>
<body style="margin:0;padding:0;background:#0d0d0d;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d0d;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1a0a10,#0d0d0d);border-radius:16px 16px 0 0;padding:40px 40px 32px;text-align:center;border-bottom:1px solid #2a2a2a;">
              <p style="margin:0 0 4px;font-size:2rem;font-weight:900;letter-spacing:-0.03em;color:#fff;">MWAH 💋</p>
              <p style="margin:0;font-size:0.75rem;letter-spacing:0.2em;text-transform:uppercase;color:#e75480;">Cannabis Vape Pens Designed for Her</p>
            </td>
          </tr>

          <!-- Order Badge -->
          <tr>
            <td style="background:#111;padding:24px 40px;text-align:center;border-bottom:1px solid #2a2a2a;">
              <p style="margin:0 0 6px;font-size:0.7rem;letter-spacing:0.18em;text-transform:uppercase;color:#666;">Order Number</p>
              <p style="margin:0;font-size:1.4rem;font-weight:800;color:#e75480;letter-spacing:-0.02em;">${orderNum}</p>
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td style="background:#111;padding:28px 40px 8px;">
              ${greeting}
            </td>
          </tr>

          <!-- Items Table -->
          <tr>
            <td style="background:#111;padding:0 40px 28px;">
              <p style="margin:0 0 12px;font-size:0.7rem;letter-spacing:0.15em;text-transform:uppercase;color:#666;font-weight:700;">Items Ordered</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:10px;overflow:hidden;border:1px solid #2a2a2a;">
                <thead>
                  <tr style="background:#1a1a1a;">
                    <th style="padding:10px 16px;text-align:left;font-size:0.7rem;letter-spacing:0.1em;text-transform:uppercase;color:#666;font-weight:700;">Product</th>
                    <th style="padding:10px 16px;text-align:center;font-size:0.7rem;letter-spacing:0.1em;text-transform:uppercase;color:#666;font-weight:700;">Qty</th>
                    <th style="padding:10px 16px;text-align:right;font-size:0.7rem;letter-spacing:0.1em;text-transform:uppercase;color:#666;font-weight:700;">Unit Price</th>
                    <th style="padding:10px 16px;text-align:right;font-size:0.7rem;letter-spacing:0.1em;text-transform:uppercase;color:#666;font-weight:700;">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemRows}
                  <tr style="background:#1a1a1a;">
                    <td colspan="3" style="padding:14px 16px;font-size:0.85rem;font-weight:800;color:#fff;letter-spacing:0.04em;text-transform:uppercase;">Total</td>
                    <td style="padding:14px 16px;font-size:1.1rem;font-weight:900;color:#e75480;text-align:right;">$${parseFloat(total || 0).toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>

          <!-- Two Columns: Shipping + Payment -->
          <tr>
            <td style="background:#111;padding:0 40px 28px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <!-- Shipping -->
                  <td width="50%" valign="top" style="padding-right:12px;">
                    <p style="margin:0 0 12px;font-size:0.7rem;letter-spacing:0.15em;text-transform:uppercase;color:#666;font-weight:700;">Ship To</p>
                    <div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;padding:16px;">
                      <p style="margin:0 0 4px;color:#fff;font-weight:700;font-size:0.9rem;">${info.full_name}</p>
                      <p style="margin:0 0 2px;color:#bbb;font-size:0.82rem;">${info.email}</p>
                      <p style="margin:0 0 2px;color:#bbb;font-size:0.82rem;">${info.phone}</p>
                      <p style="margin:8px 0 0;color:#bbb;font-size:0.82rem;line-height:1.5;">${info.address}<br>${info.city}${info.state ? ', ' + info.state : ''}${info.zip ? ' ' + info.zip : ''}<br>${info.country}</p>
                      ${info.notes ? `<p style="margin:8px 0 0;color:#888;font-size:0.78rem;font-style:italic;">Note: ${info.notes}</p>` : ''}
                    </div>
                  </td>
                  <!-- Payment -->
                  <td width="50%" valign="top" style="padding-left:12px;">
                    <p style="margin:0 0 12px;font-size:0.7rem;letter-spacing:0.15em;text-transform:uppercase;color:#666;font-weight:700;">Payment Method</p>
                    <div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;padding:16px;">
                      <p style="margin:0 0 4px;color:#fff;font-weight:700;font-size:0.9rem;">${pm}</p>
                      <p style="margin:0;color:#888;font-size:0.8rem;line-height:1.5;">Payment instructions will be sent to your email. Your order ships once payment is confirmed.</p>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#0d0d0d;border-top:1px solid #2a2a2a;border-radius:0 0 16px 16px;padding:28px 40px;text-align:center;">
              <p style="margin:0 0 8px;color:#555;font-size:0.78rem;">Questions? Reach us at <a href="mailto:contact@gimmeemwah.com" style="color:#e75480;text-decoration:none;">contact@gimmeemwah.com</a></p>
              <p style="margin:0;color:#444;font-size:0.72rem;">&copy; ${new Date().getFullYear()} MWAH. All rights reserved. &nbsp;·&nbsp; <a href="https://gimmeemwah.com/privacy" style="color:#555;text-decoration:none;">Privacy Policy</a></p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  // ── Send via Resend ───────────────────────────────────────
  async function sendEmail({ to, subject, html }) {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${FROM_NAME} <${FROM_ADDRESS}>`,
        to,
        subject,
        html,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.message || `Resend error: ${response.status}`);
    }
    return response.json();
  }

  // ── Fire both emails ──────────────────────────────────────
  try {
    const [customerResult, adminResult] = await Promise.allSettled([
      // 1. Customer confirmation
      sendEmail({
        to: [info.email],
        subject: `Your MWAH Order Confirmation — ${orderNum} 💋`,
        html: buildInvoiceHTML({ isAdmin: false }),
      }),
      // 2. Admin notification
      sendEmail({
        to: [ADMIN_EMAIL],
        subject: `New Order Received — ${orderNum} ($${parseFloat(total || 0).toFixed(2)})`,
        html: buildInvoiceHTML({ isAdmin: true }),
      }),
    ]);

    const errors = [customerResult, adminResult]
      .filter(r => r.status === 'rejected')
      .map(r => r.reason?.message);

    if (errors.length === 2) {
      // Both failed
      return res.status(500).json({ error: 'Failed to send emails.', details: errors });
    }

    return res.status(200).json({
      success: true,
      customerSent: customerResult.status === 'fulfilled',
      adminSent:    adminResult.status === 'fulfilled',
    });
  } catch (err) {
    console.error('[MWAH Email] Unexpected error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
