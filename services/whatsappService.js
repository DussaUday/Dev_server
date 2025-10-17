// whatsappService.js
import { Client } from "whatsapp-web.js";
import qrcode from "qrcode-terminal";
import qr from 'qrcode';

let client;
let isReady = false;
let currentQR = null; // Store current QR code
const readyCallbacks = [];

// Initialize client (should be called once in your server startup)
export function initWhatsApp() {
  client = new Client();

  client.on("qr", async (qrCode) => {
    console.log("📱 WhatsApp QR Code Generated!");
    currentQR = qrCode; // Store the QR code
    
    // Method 1: Terminal QR (for local development)
    console.log("🔸 Terminal QR Code:");
    qrcode.generate(qrCode, { small: true });
    
    // Method 2: QR Code as URL (for Render logs)
    console.log("🔸 QR Code URL (Copy and open in browser):");
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrCode)}`;
    console.log(qrUrl);
    
    // Method 3: Text-based QR for Render logs
    console.log("🔸 Text-based QR (for Render logs):");
    await generateTextQR(qrCode);
    
    // Method 4: Direct authentication string
    console.log("🔸 Quick Connect:");
    console.log(`1. Open WhatsApp on your phone`);
    console.log(`2. Tap Menu → Linked Devices → Link a Device`);
    console.log(`3. Scan the QR code above or use the URL`);
  });

  client.on("ready", () => {
    console.log("✅ WhatsApp client is ready and authenticated!");
    isReady = true;
    currentQR = null; // Clear QR after successful authentication
    // Execute all pending callbacks
    readyCallbacks.forEach(callback => callback());
    readyCallbacks.length = 0;
  });

  client.on("authenticated", () => {
    console.log("✅ WhatsApp authentication successful!");
    currentQR = null;
  });

  client.on("auth_failure", (error) => {
    console.error("❌ WhatsApp authentication failed:", error.message);
    currentQR = null;
  });

  client.on("disconnected", (reason) => {
    console.log("❌ WhatsApp client disconnected:", reason);
    isReady = false;
    currentQR = null;
  });

  client.on("change_state", (state) => {
    console.log(`🔸 WhatsApp state changed: ${state}`);
  });

  client.initialize();
}

// Generate text-based QR code for Render logs
async function generateTextQR(qrCode) {
  try {
    // Create a simple text representation
    const qrText = `QR Code: ${qrCode.substring(0, 50)}...`;
    console.log(qrText);
    
    // Alternative: Try to generate ASCII QR
    const qrDataUrl = await qr.toString(qrCode, { type: 'terminal', small: true });
    console.log("Scan this QR code with WhatsApp:");
    console.log(qrDataUrl);
  } catch (error) {
    console.log("QR Code generated. Use the URL above to view it.");
  }
}

// Wait for client to be ready
function waitForReady() {
  return new Promise((resolve, reject) => {
    if (isReady) {
      resolve();
    } else {
      const timeout = setTimeout(() => {
        reject(new Error("WhatsApp client not ready within 30 seconds"));
      }, 30000);
      
      readyCallbacks.push(() => {
        clearTimeout(timeout);
        resolve();
      });
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

    console.log(`📤 Sending WhatsApp to: ${formattedTo}`);
    const result = await client.sendMessage(formattedTo, message);
    console.log("✅ WhatsApp message sent to:", formattedTo);
    return { success: true, messageId: result.id._serialized };
  } catch (err) {
    console.error("❌ Failed to send WhatsApp to:", to, err.message);
    return { success: false, error: err.message };
  }
}

// Get client status and QR code
export function getWhatsAppStatus() {
  const status = {
    isReady,
    isConnected: isReady,
    hasQR: !!currentQR,
    qrUrl: currentQR ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(currentQR)}` : null,
    authenticationRequired: !isReady && !currentQR
  };

  // Log status for Render logs
  if (!isReady && currentQR) {
    console.log("🔸 WhatsApp Status: Waiting for QR scan");
    console.log("🔸 QR URL:", status.qrUrl);
  } else if (isReady) {
    console.log("🔸 WhatsApp Status: Connected and ready");
  }

  return status;
}

// Get current QR code for API responses
export function getCurrentQR() {
  return currentQR;
}

// Generate QR code URL for easy scanning
export function getQRCodeURL() {
  if (!currentQR) return null;
  
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(currentQR)}`;
  console.log("📱 QR Code URL (for scanning):", qrUrl);
  return qrUrl;
}
