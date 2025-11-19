import nodemailer from "nodemailer";
import type { Order, Product } from "payload_app";

// Check each environment variable separately and log the status
const ZOHO_EMAIL = "admin@100mg.tw";
// const ZOHO_PASSWORD = "2d6bwLQHCucP";
const ZOHO_PASSWORD = "@account6564";
const ADMIN_EMAIL = "admin@100mg.tw";

console.log("Email Configuration Status:");
console.log("ZOHO_EMAIL:", ZOHO_EMAIL ? "✓ Found" : "✗ Missing");
console.log("ZOHO_PASSWORD:", ZOHO_PASSWORD ? "✓ Found" : "✗ Missing");
console.log("ADMIN_EMAIL:", ADMIN_EMAIL ? "✓ Found" : "✗ Missing");

// Create Nodemailer transporter using Zoho SMTP
const transporter = nodemailer.createTransport({
  host: "smtp.zoho.com",
  port: 465,
  secure: true,
  auth: {
    user: ZOHO_EMAIL,
    pass: ZOHO_PASSWORD,
  },
});

// // Create Nodemailer transporter using Zoho SMTP
// const transporter = nodemailer.createTransport({
//   host: 'smtp.zoho.com',
//   port: 465,
//   secure: true, // use SSL
//   auth: {
//     user: process.env.ZOHO_EMAIL,
//     pass: process.env.ZOHO_PASSWORD,
//   },
// });

export async function sendOrderConfirmationEmail(
  order: Order,
  products: Product[],
) {
  const itemsList = order.cartItems
    .map((item) => {
      const product = products.find(
        (p) => p.id === (item.product as Product).id,
      );
      return `
        - ${product?.title} (Quantity: ${item.quantity})
        Price: $${item.priceAtPurchase} x ${item.quantity} = $${item.priceAtPurchase * item.quantity}
      `;
    })
    .join("\n");

  const customerEmailContent = `
Hi ${order.name},

感謝您的訂購! 我們很高興地確認您的訂單已成功下單.

訂單詳情:
-----------------------------
訂單 編號: ${order.id}
訂單 日期: ${new Date(order.orderDate).toLocaleString()}

訂購商品:
${itemsList}

總金額: $${order.totalAmount}

運送資訊:
-----------------------------
姓名: ${order.name}
地址: ${order.address}
電話: ${order.phone}
Email: ${order.email}

付款方式: 貨到付款
訂單狀態: ${order.status}

${order.note ? `\nOrder Note: ${order.note}` : ""}

如果您對訂單有任何疑問, 請與我們聯絡.

感謝您的惠顧!
`;

  const adminEmailContent = `
訂單確認信!

訂單細節:
-----------------------------
訂單 編號: ${order.id}
訂單 日期: ${new Date(order.orderDate).toLocaleString()}

客戶 資料:
-----------------------------
姓名: ${order.name}
Email: ${order.email}
電話: ${order.phone}
地址: ${order.address}
${order.note ? `Note: ${order.note}` : ""}

訂購商品:
${itemsList}

總金額: $${order.totalAmount}
支付方式: 貨到付款
訂單狀態: ${order.status}
`;

  // Send email to customer
  await transporter.sendMail({
    from: ZOHO_EMAIL,
    to: order.email,
    subject: `訂單確認信 - 訂單編號 #${order.id}`,
    text: customerEmailContent,
  });

  // Send email to admin
  await transporter.sendMail({
    from: ZOHO_EMAIL,
    to: ADMIN_EMAIL,
    subject: `新訂單 #${order.id} Received`,
    text: adminEmailContent,
  });
}

export async function sendContactFormEmail(contactData: {
  name: string;
  email: string;
  message: string;
}) {
  const { name, email, message } = contactData;

  const customerEmailContent = `
親愛的 ${name},

感謝您聯絡我們！我們已收到您的訊息，會儘快回覆您。

您的訊息內容：
-----------------------------
訊息: ${message}

我們會盡快處理您的詢問並回覆您。

謝謝！
必利勁藥局團隊
  `;

  const adminEmailContent = `
新的聯絡表單提交！

客戶資料：
-----------------------------
姓名: ${name}
Email: ${email}

訊息內容：
-----------------------------
${message}

提交時間: ${new Date().toLocaleString()}
  `;

  // Send confirmation email to customer
  await transporter.sendMail({
    from: ZOHO_EMAIL,
    to: email,
    subject: `訊息確認 - 我們已收到您的訊息`,
    text: customerEmailContent,
  });

  // Send notification email to admin
  await transporter.sendMail({
    from: ZOHO_EMAIL,
    to: ADMIN_EMAIL,
    subject: `新聯絡表單提交`,
    text: adminEmailContent,
  });
}
