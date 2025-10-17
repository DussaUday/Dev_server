// whatsappService.js
import { Client } from "whatsapp-web.js";
import qrcode from "qrcode-terminal";

let client;
let isReady = false;
const readyCallbacks = [];

// Initialize client (should be called once in your server startup)
export function initWhatsApp() {
  client = new Client();

  client.on("qr", (qr) => {
    console.log("📱 Scan this QR with your WhatsApp app:");
    qrcode.generate(qr, { small: true });
  });

  client.on("ready", () => {
    console.log("✅ WhatsApp client is ready!");
    isReady = true;
    // Execute all pending callbacks
    readyCallbacks.forEach(callback => callback());
    readyCallbacks.length = 0;
  });

  client.on("auth_failure", () => {
    console.error("❌ WhatsApp authentication failed");
  });

  client.on("disconnected", (reason) => {
    console.log("❌ WhatsApp client disconnected:", reason);
    isReady = false;
  });

  client.initialize();
}

// Wait for client to be ready
function waitForReady() {
  return new Promise((resolve) => {
    if (isReady) {
      resolve();
    } else {
      readyCallbacks.push(resolve);
    }
  });
}

// Send a WhatsApp text
export async function sendWhatsAppText(to, message) {
  try {
    if (!client) throw new Error("WhatsApp client not initialized");
    
    // Wait for client to be ready
    await waitForReady();

    // Format number (must include country code, no +, then add @c.us)
    const formattedTo = to.replace(/[^0-9]/g, "") + "@c.us";

    const result = await client.sendMessage(formattedTo, message);
    console.log("✅ WhatsApp message sent to:", formattedTo);
    return { success: true, messageId: result.id._serialized };
  } catch (err) {
    console.error("❌ Failed to send WhatsApp to:", to, err.message);
    return { success: false, error: err.message };
  }
}

// Get client status
export function getWhatsAppStatus() {
  return {
    isReady,
    isConnected: isReady
  };
}
