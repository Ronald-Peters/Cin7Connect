import sgMail from '@sendgrid/mail';

interface EmailConfig {
  apiKey: string;
  fromEmail: string;
  supportEmail: string;
}

interface QuoteEmailData {
  customerName: string;
  customerEmail: string;
  quoteId: string;
  erpSaleId?: string;
  totalAmount: number;
  items: Array<{
    sku: string;
    name: string;
    quantity: number;
    price: number;
  }>;
  location: string;
}

export class EmailService {
  private config: EmailConfig;
  
  constructor() {
    this.config = {
      apiKey: process.env.SENDGRID_API_KEY || '',
      fromEmail: process.env.FROM_EMAIL || 'noreply@reiviloindustrial.co.za',
      supportEmail: process.env.SUPPORT_EMAIL || 'support@reiviloindustrial.co.za'
    };

    if (this.config.apiKey) {
      sgMail.setApiKey(this.config.apiKey);
    }
  }

  async sendQuoteConfirmation(quoteData: QuoteEmailData): Promise<void> {
    if (!this.config.apiKey) {
      console.warn('SendGrid API key not configured, skipping email');
      return;
    }

    const itemsHtml = quoteData.items.map(item => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${item.name}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${item.sku}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: center;">${item.quantity}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right;">R${item.price.toFixed(2)}</td>
      </tr>
    `).join('');

    const emailHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Quote Confirmation - Reivilo Industrial</title>
    </head>
    <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #1e3a8a; margin-bottom: 10px;">Reivilo Industrial</h1>
          <p style="color: #64748b; margin: 0;">45 Years of Excellence in Industrial Solutions</p>
        </div>

        <h2 style="color: #1e3a8a; border-bottom: 2px solid #1e3a8a; padding-bottom: 10px;">Quote Confirmation</h2>
        
        <p>Dear ${quoteData.customerName},</p>
        
        <p>Thank you for your quote request. We've received your order and our team will process it shortly.</p>
        
        <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #1e3a8a;">Quote Details</h3>
          <p><strong>Quote ID:</strong> ${quoteData.quoteId}</p>
          ${quoteData.erpSaleId ? `<p><strong>Reference:</strong> ${quoteData.erpSaleId}</p>` : ''}
          <p><strong>Delivery Location:</strong> ${quoteData.location}</p>
          <p><strong>Total Amount:</strong> R${quoteData.totalAmount.toFixed(2)} ZAR</p>
        </div>

        <h3 style="color: #1e3a8a;">Items Requested</h3>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <thead>
            <tr style="background-color: #1e3a8a; color: white;">
              <th style="padding: 12px; text-align: left;">Product</th>
              <th style="padding: 12px; text-align: left;">SKU</th>
              <th style="padding: 12px; text-align: center;">Qty</th>
              <th style="padding: 12px; text-align: right;">Price</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;">
          <h4 style="margin-top: 0; color: #92400e;">What's Next?</h4>
          <ul style="margin: 10px 0; padding-left: 20px;">
            <li>Our sales team will review your quote within 4 business hours</li>
            <li>You'll receive pricing confirmation and availability updates</li>
            <li>We'll coordinate delivery to your ${quoteData.location} location</li>
          </ul>
        </div>

        <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
          <p style="color: #64748b; margin: 5px 0;">Questions about your quote?</p>
          <p style="margin: 5px 0;">
            <a href="mailto:${this.config.supportEmail}" style="color: #1e3a8a;">Contact our sales team</a>
          </p>
          
          <div style="margin-top: 20px; font-size: 12px; color: #9ca3af;">
            <p>Reivilo Industrial (Pty) Ltd | Est. 1980</p>
            <p>Leading supplier of industrial tires and equipment across South Africa</p>
          </div>
        </div>
      </div>
    </body>
    </html>`;

    const msg = {
      to: quoteData.customerEmail,
      from: this.config.fromEmail,
      subject: `Quote Confirmation #${quoteData.quoteId} - Reivilo Industrial`,
      html: emailHtml
    };

    try {
      await sgMail.send(msg);
      console.log(`Quote confirmation email sent to ${quoteData.customerEmail}`);
    } catch (error) {
      console.error('SendGrid email error:', error);
      throw new Error('Failed to send confirmation email');
    }
  }

  async sendAdminNotification(quoteData: QuoteEmailData): Promise<void> {
    if (!this.config.apiKey) {
      console.warn('SendGrid API key not configured, skipping admin notification');
      return;
    }

    const msg = {
      to: this.config.supportEmail,
      from: this.config.fromEmail,
      subject: `New B2B Quote #${quoteData.quoteId} - ${quoteData.customerName}`,
      html: `
        <h2>New B2B Quote Received</h2>
        <p><strong>Customer:</strong> ${quoteData.customerName} (${quoteData.customerEmail})</p>
        <p><strong>Quote ID:</strong> ${quoteData.quoteId}</p>
        <p><strong>Location:</strong> ${quoteData.location}</p>
        <p><strong>Total Amount:</strong> R${quoteData.totalAmount.toFixed(2)}</p>
        <p><strong>Items:</strong> ${quoteData.items.length} products</p>
        <p>Please review in the admin portal.</p>
      `
    };

    try {
      await sgMail.send(msg);
      console.log('Admin notification email sent');
    } catch (error) {
      console.error('Failed to send admin notification:', error);
    }
  }
}

export const emailService = new EmailService();