const express = require('express');
const Stripe = require('stripe');

const router = express.Router();

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

const toMinorAmount = (amount) => Math.round(Number(amount) * 100);

const getClientBaseUrl = (req) =>
  process.env.CLIENT_URL ||
  process.env.FRONTEND_URL ||
  req.get('origin') ||
  'http://localhost:3000';

router.post('/create-checkout-session', async (req, res) => {
  const { productId, productName, amount, currency = 'USD' } = req.body;

  if (!stripe) {
    return res.status(500).json({
      success: false,
      message: 'Missing STRIPE_SECRET_KEY in server .env.',
    });
  }

  if (!productId || !productName || !amount || Number(amount) <= 0) {
    return res.status(400).json({
      success: false,
      message: 'Invalid product payload.',
    });
  }

  try {
    const baseUrl = getClientBaseUrl(req);
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: currency.toLowerCase(),
            unit_amount: toMinorAmount(amount),
            product_data: {
              name: productName,
              metadata: {
                productId,
              },
            },
          },
        },
      ],
      success_url: `${baseUrl}/payment-result?gateway=stripe&status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/payment-result?gateway=stripe&status=cancelled`,
      metadata: {
        productId,
        productName,
      },
    });

    return res.json({
      success: true,
      checkoutUrl: session.url,
      sessionId: session.id,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to create Stripe Checkout session.',
    });
  }
});

router.get('/session/:sessionId', async (req, res) => {
  if (!stripe) {
    return res.status(500).json({
      success: false,
      message: 'Missing STRIPE_SECRET_KEY in server .env.',
    });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(req.params.sessionId, {
      expand: ['payment_intent'],
    });

    const status = session.payment_status;
    const paid = status === 'paid';
    const paymentIntentId =
      typeof session.payment_intent === 'object'
        ? session.payment_intent.id
        : session.payment_intent;

    return res.json({
      success: paid,
      paymentMethod: 'Stripe',
      status,
      transactionId: paymentIntentId || session.id,
      sessionId: session.id,
      amount: session.amount_total ? session.amount_total / 100 : 0,
      currency: session.currency ? session.currency.toUpperCase() : 'USD',
      message: paid ? 'Stripe payment captured successfully.' : 'Stripe payment is not completed yet.',
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch Stripe session status.',
    });
  }
});

module.exports = router;
