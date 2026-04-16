const express = require('express');

const router = express.Router();

const paypalBase =
  process.env.PAYPAL_MODE === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';

const getClientBaseUrl = (req) =>
  process.env.CLIENT_URL ||
  process.env.FRONTEND_URL ||
  req.get('origin') ||
  'http://localhost:3000';

const getAccessToken = async () => {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Missing PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET in server .env.');
  }

  const encodedCredentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const tokenResponse = await fetch(`${paypalBase}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${encodedCredentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!tokenResponse.ok) {
    const errorBody = await tokenResponse.text();
    throw new Error(`PayPal auth failed: ${errorBody}`);
  }

  const tokenJson = await tokenResponse.json();
  return tokenJson.access_token;
};

router.post('/create-order', async (req, res) => {
  const { productId, productName, amount, currency = 'USD' } = req.body;

  if (!productId || !productName || !amount || Number(amount) <= 0) {
    return res.status(400).json({
      success: false,
      message: 'Invalid product payload.',
    });
  }

  try {
    const accessToken = await getAccessToken();
    const baseUrl = getClientBaseUrl(req);

    const orderResponse = await fetch(`${paypalBase}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: productId,
            description: productName,
            amount: {
              currency_code: currency.toUpperCase(),
              value: Number(amount).toFixed(2),
            },
          },
        ],
        application_context: {
          return_url: `${baseUrl}/payment-result?gateway=paypal&status=approved`,
          cancel_url: `${baseUrl}/payment-result?gateway=paypal&status=cancelled`,
          user_action: 'PAY_NOW',
        },
      }),
    });

    const orderJson = await orderResponse.json();

    if (!orderResponse.ok) {
      return res.status(500).json({
        success: false,
        message: orderJson.message || 'Failed to create PayPal order.',
      });
    }

    const approveLink = orderJson.links?.find((link) => link.rel === 'approve')?.href;

    if (!approveLink) {
      return res.status(500).json({
        success: false,
        message: 'PayPal approve URL is missing from response.',
      });
    }

    return res.json({
      success: true,
      orderId: orderJson.id,
      approveUrl: approveLink,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'PayPal order creation failed.',
    });
  }
});

router.post('/capture-order', async (req, res) => {
  const { orderId } = req.body;

  if (!orderId) {
    return res.status(400).json({
      success: false,
      message: 'orderId is required to capture a PayPal order.',
    });
  }

  try {
    const accessToken = await getAccessToken();

    const captureResponse = await fetch(`${paypalBase}/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    const captureJson = await captureResponse.json();

    if (!captureResponse.ok) {
      return res.status(500).json({
        success: false,
        message: captureJson.message || 'Failed to capture PayPal order.',
      });
    }

    const purchaseUnit = captureJson.purchase_units?.[0];
    const capture = purchaseUnit?.payments?.captures?.[0];

    return res.json({
      success: captureJson.status === 'COMPLETED',
      paymentMethod: 'PayPal',
      status: captureJson.status,
      transactionId: capture?.id || captureJson.id,
      orderId: captureJson.id,
      amount: capture?.amount?.value || null,
      currency: capture?.amount?.currency_code || 'USD',
      message:
        captureJson.status === 'COMPLETED'
          ? 'PayPal payment captured successfully.'
          : `PayPal order status: ${captureJson.status}`,
      raw: captureJson,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'PayPal capture failed.',
    });
  }
});

module.exports = router;
