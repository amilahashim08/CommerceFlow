# FurniCraft - MERN Payment E-commerce Demo

FurniCraft is a furniture e-commerce demo built with a React frontend and an Express backend.  
It supports:

- product catalog with categories
- manual product creation (URL or file upload image)
- multi-product cart
- Stripe Checkout payments
- PayPal order + capture payments
- payment verification result view
- basic local authentication (register/login/logout)

## Tech Stack

### Frontend (`client`)
- React (CRA / `react-scripts`)
- Axios
- CSS (responsive e-commerce layout)

### Backend (`server`)
- Node.js + Express
- Stripe SDK
- PayPal REST API integration
- dotenv
- Mongoose connection scaffold (app can run without MongoDB for demo mode)

## Project Structure

```text
mern-payment-app/
  client/
    src/
      App.js
      App.css
      index.js
  server/
    config/
      db.js
    models/
      Product.js
    routes/
      products.js
      stripe.js
      paypal.js
    index.js
    .env
  README.md
```

## Features Implemented

1. Product catalog by categories (`Living Room`, `Bedroom`, `Office`, etc.)
2. Manual product add form:
   - name/category/price/description
   - image URL or local image upload
3. Cart actions:
   - add item
   - increase/decrease quantity
   - discard one item
   - discard full cart
4. Multi-product checkout:
   - checks out cart total when cart has items
   - otherwise checks out selected single product
5. Stripe payment flow:
   - create checkout session
   - redirect to Stripe
   - verify session result
6. PayPal payment flow:
   - create order
   - approve and return
   - capture order and show status
7. Payment success dialog with transaction details
8. Basic auth (localStorage-based register/login/logout)
9. Responsive layout for desktop/tablet/mobile

## Environment Variables

Create/update `server/.env`:

```env
MONGO_URI=mongodb://localhost:27017/mern-payment-app
PORT=5000
CLIENT_URL=http://localhost:3000

# Stripe
STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxx

# PayPal
PAYPAL_MODE=sandbox
PAYPAL_CLIENT_ID=xxxxxxxxxxxxxxxxx
PAYPAL_CLIENT_SECRET=xxxxxxxxxxxxxxxxx
```

> If your frontend runs on another port (for example 3002), update `CLIENT_URL` accordingly.

## Installation

From project root:

```bash
# install frontend deps
cd client
npm install

# install backend deps
cd ../server
npm install
```

## Running the App

Open two terminals.

### Terminal 1 - Backend
```bash
cd server
npm run dev
```

### Terminal 2 - Frontend
```bash
cd client
npm run dev
```

Then open the frontend URL shown in terminal (usually `http://localhost:3000`).

## Payment Testing

### Stripe (Test Mode)
- Choose Stripe as payment method
- Use test card:
  - `4242 4242 4242 4242`
  - any future expiry
  - any CVC
- Verify in Stripe test dashboard:
  - <https://dashboard.stripe.com/test/payments>

### PayPal (Sandbox)
- Choose PayPal as payment method
- Approve payment with sandbox buyer account
- Verify in PayPal developer dashboard:
  - <https://developer.paypal.com/>

## API Routes

### Products
- `GET /api/products`

### Stripe
- `POST /api/stripe/create-checkout-session`
- `GET /api/stripe/session/:sessionId`

### PayPal
- `POST /api/paypal/create-order`
- `POST /api/paypal/capture-order`

## How a User Uses the System

1. Register/login on auth screen
2. Browse product categories
3. View product or add to cart
4. Add manual products if needed
5. Edit cart quantities / discard items
6. Choose Stripe or PayPal and pay
7. See payment result and success dialog with transaction ID

## Known Limitations (Current Demo Scope)

- Authentication is client-side localStorage only (not secure for production)
- Products are served from static route data
- Manual products are not persisted to backend DB
- No order history storage yet

## Recommended Next Improvements

1. Backend JWT auth with hashed passwords
2. Persist users/products/cart/orders in MongoDB
3. Admin dashboard for product management
4. Payment webhooks for stronger server-side confirmation
5. Cloud image storage (Cloudinary/S3)

## Troubleshooting

### "Missing STRIPE_SECRET_KEY in server .env"
- Ensure key exists in `server/.env`
- Restart backend after editing env

### "Missing PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET"
- Add sandbox credentials in `server/.env`
- Restart backend

### Images not loading
- Check internet connectivity
- Uploaded file images remain available in current browser session
- Fallback placeholder is automatically shown if URL fails

### Port conflicts
- If frontend port is changed, set matching `CLIENT_URL` in backend env

---

Built for learning/demo purposes with React + Express payment integrations.
