import axios from "axios";

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM; // e.g. whatsapp:+14155238886

// whatsappService.js - ensure proper formatting
export async function sendWhatsAppText(to, message) {
  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;

    // Ensure proper format (should already be handled by the calling code)
    const formattedTo = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;

    const payload = new URLSearchParams({
      From: TWILIO_WHATSAPP_FROM,
      To: formattedTo,
      Body: message,
    }).toString();

    const res = await axios.post(url, payload, {
      auth: {
        username: TWILIO_ACCOUNT_SID,
        password: TWILIO_AUTH_TOKEN,
      },
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    console.log("✅ WhatsApp message sent to:", formattedTo);
    return true;
  } catch (err) {
    console.error("❌ Failed to send WhatsApp to:", to, err.response?.data || err.message);
    return false;
  }
}