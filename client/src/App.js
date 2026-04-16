import './App.css';
import axios from 'axios';
import { useEffect, useMemo, useState } from 'react';

const FALLBACK_PRODUCT_IMAGE = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500">
    <rect width="800" height="500" fill="#0f172a" />
    <rect x="70" y="90" width="660" height="320" rx="24" fill="#1e293b" stroke="#334155" stroke-width="4"/>
    <rect x="140" y="180" width="300" height="120" rx="18" fill="#334155"/>
    <rect x="470" y="160" width="180" height="140" rx="14" fill="#475569"/>
    <text x="400" y="390" text-anchor="middle" fill="#cbd5e1" font-family="Arial, sans-serif" font-size="30">Furniture Image</text>
  </svg>`
)}`;

const buildProductPlaceholder = (label, background = '#1e293b') =>
  `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600" viewBox="0 0 900 600">
      <rect width="900" height="600" fill="${background}" />
      <rect x="70" y="70" width="760" height="460" rx="22" fill="#0f172a" stroke="#334155" stroke-width="4"/>
      <text x="450" y="315" text-anchor="middle" fill="#e2e8f0" font-family="Arial, sans-serif" font-size="46">${label}</text>
    </svg>`
  )}`;

function App() {
  const [authUser, setAuthUser] = useState(() => {
    const savedUser = localStorage.getItem('furnicraft_auth_user');
    return savedUser ? JSON.parse(savedUser) : null;
  });
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({
    name: '',
    email: '',
    password: '',
  });
  const [products, setProducts] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [activeCategory, setActiveCategory] = useState('All');
  const [cartItems, setCartItems] = useState([]);
  const [wishlistItems, setWishlistItems] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('furnicraft_wishlist') || '[]');
      return Array.isArray(stored) ? stored : [];
    } catch (error) {
      return [];
    }
  });
  const [newProduct, setNewProduct] = useState({
    name: '',
    category: 'Custom',
    description: '',
    price: '',
    image: '',
    imageFileName: '',
    galleryText: '',
  });
  const [selectedImageByProduct, setSelectedImageByProduct] = useState({});
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [selectedGateway, setSelectedGateway] = useState('stripe');
  const [loading, setLoading] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [paymentResult, setPaymentResult] = useState(null);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [error, setError] = useState('');
  const [pathName, setPathName] = useState(window.location.pathname);

  const apiBaseUrl = useMemo(() => {
    return process.env.REACT_APP_API_URL || 'http://localhost:5000';
  }, []);

  const queryParams = useMemo(() => new URLSearchParams(window.location.search), [pathName]);
  const isResultPage = pathName.startsWith('/payment-result');
  const gatewayParam = queryParams.get('gateway');
  const statusParam = queryParams.get('status');
  const stripeSessionId = queryParams.get('session_id');
  const paypalOrderToken = queryParams.get('token');
  const categories = useMemo(
    () => ['All', ...new Set(products.map((product) => product.category).filter(Boolean))],
    [products]
  );
  const filteredProducts = useMemo(() => {
    if (activeCategory === 'All') {
      return products;
    }
    return products.filter((product) => product.category === activeCategory);
  }, [activeCategory, products]);
  const cartCount = useMemo(
    () => cartItems.reduce((total, item) => total + item.quantity, 0),
    [cartItems]
  );
  const wishlistCount = useMemo(() => wishlistItems.length, [wishlistItems]);
  const cartTotal = useMemo(
    () => cartItems.reduce((total, item) => total + item.price * item.quantity, 0),
    [cartItems]
  );
  const discountAmount = useMemo(() => {
    if (!appliedCoupon) return 0;
    if (appliedCoupon.type === 'percent') return Number((cartTotal * appliedCoupon.value / 100).toFixed(2));
    return Math.min(cartTotal, appliedCoupon.value);
  }, [appliedCoupon, cartTotal]);
  const payableTotal = useMemo(
    () => Number(Math.max(0, cartTotal - discountAmount).toFixed(2)),
    [cartTotal, discountAmount]
  );

  const resolveProductImage = (product) => {
    if (!product) return FALLBACK_PRODUCT_IMAGE;
    if (product.image && (product.image.startsWith('http') || product.image.startsWith('data:image'))) {
      return product.image;
    }
    return buildProductPlaceholder(product.name || 'Furniture');
  };

  const getProductGallery = (product) => {
    if (!product) return [];
    const gallery = Array.isArray(product.gallery) ? product.gallery.filter(Boolean) : [];
    const mainImage = resolveProductImage(product);
    return gallery.length > 0 ? gallery : [mainImage];
  };

  useEffect(() => {
    const fetchProducts = async () => {
      if (isResultPage) {
        return;
      }

      setLoadingProducts(true);
      setError('');

      try {
        const response = await axios.get(`${apiBaseUrl}/api/products`);
        const list = (response.data?.products || []).map((product) => ({
          ...product,
          image: resolveProductImage(product),
        }));
        setProducts(list);
        setActiveCategory('All');
        if (list.length > 0) {
          setSelectedProduct(list[0]);
        }
      } catch (requestError) {
        setError(
          requestError.response?.data?.message ||
            'Unable to load products. Make sure backend is running on port 5000.'
        );
      } finally {
        setLoadingProducts(false);
      }
    };

    fetchProducts();
  }, [apiBaseUrl, isResultPage]);

  useEffect(() => {
    if (!isResultPage) {
      return;
    }

    const fetchResult = async () => {
      setLoading(true);
      setError('');

      try {
        if (gatewayParam === 'stripe') {
          if (statusParam !== 'success' || !stripeSessionId) {
            setPaymentResult({
              success: false,
              paymentMethod: 'Stripe',
              status: statusParam || 'cancelled',
              message: 'Stripe payment was cancelled.',
            });
            return;
          }

          const response = await axios.get(`${apiBaseUrl}/api/stripe/session/${stripeSessionId}`);
          setPaymentResult(response.data);
          setShowSuccessDialog(Boolean(response.data?.success));
          return;
        }

        if (gatewayParam === 'paypal') {
          if (statusParam === 'cancelled' || !paypalOrderToken) {
            setPaymentResult({
              success: false,
              paymentMethod: 'PayPal',
              status: statusParam || 'cancelled',
              message: 'PayPal payment was cancelled.',
            });
            return;
          }

          const response = await axios.post(`${apiBaseUrl}/api/paypal/capture-order`, {
            orderId: paypalOrderToken,
          });
          setPaymentResult(response.data);
          setShowSuccessDialog(Boolean(response.data?.success));
          return;
        }

        setError('Unknown payment result route.');
      } catch (requestError) {
        setError(
          requestError.response?.data?.message ||
            'Unable to verify payment result. Please check backend logs.'
        );
      } finally {
        setLoading(false);
      }
    };

    fetchResult();
  }, [
    apiBaseUrl,
    gatewayParam,
    isResultPage,
    paypalOrderToken,
    statusParam,
    stripeSessionId,
  ]);

  const goBackToCheckout = () => {
    window.history.pushState({}, '', '/');
    setPathName('/');
    setPaymentResult(null);
    setShowSuccessDialog(false);
    setError('');
  };

  const onCategoryChange = (category) => {
    setActiveCategory(category);
    if (category === 'All') {
      if (products.length > 0) {
        setSelectedProduct(products[0]);
      }
      return;
    }
    const firstProductInCategory = products.find((product) => product.category === category);
    if (firstProductInCategory) {
      setSelectedProduct(firstProductInCategory);
    }
  };

  const handlePayment = async () => {
    const checkoutTarget =
      cartItems.length > 0
        ? {
            productId: 'cart-bundle',
            productName: `Cart Checkout (${cartCount} items)`,
            amount: Number(payableTotal.toFixed(2)),
          }
        : selectedProduct
          ? {
              productId: selectedProduct.id,
              productName: selectedProduct.name,
              amount: Number(selectedProduct.price),
            }
          : null;

    if (!checkoutTarget) {
      setError('Please add a product to cart or select one product first.');
      return;
    }

    setLoading(true);
    setPaymentResult(null);
    setError('');

    try {
      if (selectedGateway === 'stripe') {
        const response = await axios.post(`${apiBaseUrl}/api/stripe/create-checkout-session`, {
          productId: checkoutTarget.productId,
          productName: checkoutTarget.productName,
          amount: checkoutTarget.amount,
          currency: 'USD',
        });

        if (!response.data?.checkoutUrl) {
          throw new Error('Stripe checkout URL is missing.');
        }

        window.location.href = response.data.checkoutUrl;
        return;
      }

      const response = await axios.post(`${apiBaseUrl}/api/paypal/create-order`, {
        productId: checkoutTarget.productId,
        productName: checkoutTarget.productName,
        amount: checkoutTarget.amount,
        currency: 'USD',
      });

      if (!response.data?.approveUrl) {
        throw new Error('PayPal approval URL is missing.');
      }

      window.location.href = response.data.approveUrl;
    } catch (requestError) {
      setError(
        requestError.response?.data?.message || requestError.message || 'Unable to start payment flow.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleImageError = (event) => {
    const image = event.currentTarget;
    const label = image.dataset.label || 'Furniture';
    image.onerror = null;
    image.src = buildProductPlaceholder(label);
  };

  const addToCart = (product) => {
    setCartItems((currentItems) => {
      const existing = currentItems.find((item) => item.id === product.id);
      if (existing) {
        return currentItems.map((item) =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [
        ...currentItems,
        {
          id: product.id,
          name: product.name,
          category: product.category,
          price: Number(product.price),
          image: product.image,
          quantity: 1,
        },
      ];
    });
  };

  const removeFromCart = (productId) => {
    setCartItems((currentItems) =>
      currentItems
        .map((item) => (item.id === productId ? { ...item, quantity: item.quantity - 1 } : item))
        .filter((item) => item.quantity > 0)
    );
  };

  const discardFromCart = (productId) => {
    setCartItems((currentItems) => currentItems.filter((item) => item.id !== productId));
  };

  const discardCart = () => {
    setCartItems([]);
    setAppliedCoupon(null);
    setCouponCode('');
  };

  const addToWishlist = (product) => {
    setWishlistItems((current) => {
      if (current.some((item) => item.id === product.id)) return current;
      const updated = [
        ...current,
        {
          id: product.id,
          name: product.name,
          category: product.category,
          price: Number(product.price),
          image: product.image,
        },
      ];
      localStorage.setItem('furnicraft_wishlist', JSON.stringify(updated));
      return updated;
    });
  };

  const removeFromWishlist = (productId) => {
    setWishlistItems((current) => {
      const updated = current.filter((item) => item.id !== productId);
      localStorage.setItem('furnicraft_wishlist', JSON.stringify(updated));
      return updated;
    });
  };

  const isInWishlist = (productId) => wishlistItems.some((item) => item.id === productId);

  const toggleWishlist = (product) => {
    if (isInWishlist(product.id)) {
      removeFromWishlist(product.id);
      return;
    }
    addToWishlist(product);
  };

  const onNewProductChange = (event) => {
    const { name, value } = event.target;
    setNewProduct((current) => ({ ...current, [name]: value }));
  };

  const applyCoupon = () => {
    const code = couponCode.trim().toUpperCase();
    const coupons = {
      SAVE10: { type: 'percent', value: 10, label: '10% OFF' },
      FURNI20: { type: 'fixed', value: 20, label: '$20 OFF' },
      MEGA25: { type: 'percent', value: 25, label: '25% OFF' },
    };

    if (!coupons[code]) {
      setError('Invalid coupon code.');
      return;
    }

    setAppliedCoupon({ code, ...coupons[code] });
    setError('');
  };

  const onNewProductImageFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please upload a valid image file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const fileDataUrl = typeof reader.result === 'string' ? reader.result : '';
      setNewProduct((current) => ({
        ...current,
        image: fileDataUrl,
        imageFileName: file.name,
      }));
      setError('');
    };
    reader.readAsDataURL(file);
  };

  const addManualProduct = async (event) => {
    event.preventDefault();
    if (!newProduct.name || !newProduct.price || !newProduct.category) {
      setError('Please fill product name, category, and price.');
      return;
    }

    try {
      const additionalGallery = newProduct.galleryText
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);

      const payload = {
        name: newProduct.name.trim(),
        category: newProduct.category.trim(),
        description: newProduct.description.trim() || 'Custom furniture product.',
        price: Number(newProduct.price),
        image: newProduct.image.trim() || buildProductPlaceholder(newProduct.name.trim() || 'Custom'),
        gallery: additionalGallery,
      };

      const response = await axios.post(`${apiBaseUrl}/api/products`, payload);
      const createdProduct = {
        ...response.data.product,
        image: resolveProductImage(response.data.product),
      };

      setProducts((current) => [createdProduct, ...current]);
      setSelectedProduct(createdProduct);
      setActiveCategory('All');
      setNewProduct({
        name: '',
        category: 'Custom',
        description: '',
        price: '',
        image: '',
        imageFileName: '',
        galleryText: '',
      });
      setError('');
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          'Unable to save product in backend. Ensure MongoDB is running.'
      );
    }
  };

  const onAuthFormChange = (event) => {
    const { name, value } = event.target;
    setAuthForm((current) => ({ ...current, [name]: value }));
  };

  const onAuthSubmit = (event) => {
    event.preventDefault();
    const email = authForm.email.trim().toLowerCase();
    const password = authForm.password.trim();

    if (!email || !password) {
      setError('Please enter email and password.');
      return;
    }

    const users = JSON.parse(localStorage.getItem('furnicraft_users') || '[]');

    if (authMode === 'register') {
      if (users.some((user) => user.email === email)) {
        setError('This email is already registered. Please login.');
        return;
      }
      const newUser = {
        name: authForm.name.trim() || 'Customer',
        email,
        password,
      };
      const updatedUsers = [...users, newUser];
      localStorage.setItem('furnicraft_users', JSON.stringify(updatedUsers));
      localStorage.setItem('furnicraft_auth_user', JSON.stringify({ name: newUser.name, email }));
      setAuthUser({ name: newUser.name, email });
      setError('');
      return;
    }

    const existingUser = users.find((user) => user.email === email && user.password === password);
    if (!existingUser) {
      setError('Invalid credentials. Please register first or try again.');
      return;
    }

    localStorage.setItem(
      'furnicraft_auth_user',
      JSON.stringify({ name: existingUser.name, email: existingUser.email })
    );
    setAuthUser({ name: existingUser.name, email: existingUser.email });
    setError('');
  };

  const logout = () => {
    localStorage.removeItem('furnicraft_auth_user');
    setAuthUser(null);
    setCartItems([]);
    setPaymentResult(null);
    setShowSuccessDialog(false);
    setError('');
  };

  if (!authUser) {
    return (
      <div className="App">
        <main className="auth-page">
          <section className="auth-card">
            <h1>FurniCraft Login</h1>
            <p className="subtitle">Sign in to browse, add to cart, and checkout.</p>
            <div className="auth-tabs">
              <button
                type="button"
                className={authMode === 'login' ? 'active' : ''}
                onClick={() => setAuthMode('login')}
              >
                Login
              </button>
              <button
                type="button"
                className={authMode === 'register' ? 'active' : ''}
                onClick={() => setAuthMode('register')}
              >
                Register
              </button>
            </div>
            <form className="auth-form" onSubmit={onAuthSubmit}>
              {authMode === 'register' && (
                <input
                  name="name"
                  placeholder="Full name"
                  value={authForm.name}
                  onChange={onAuthFormChange}
                />
              )}
              <input
                name="email"
                placeholder="Email"
                type="email"
                value={authForm.email}
                onChange={onAuthFormChange}
              />
              <input
                name="password"
                placeholder="Password"
                type="password"
                value={authForm.password}
                onChange={onAuthFormChange}
              />
              <button className="pay-btn" type="submit">
                {authMode === 'login' ? 'Login' : 'Create Account'}
              </button>
            </form>
            {error && <p className="error">{error}</p>}
          </section>
        </main>
      </div>
    );
  }

  if (isResultPage) {
    return (
      <div className="App">
        <header className="top-nav">
          <div className="brand">FurniCraft</div>
        </header>
        <main className="payment-page">
          <section className="payment-card">
            <h1>Payment Result</h1>
            <p className="subtitle">Status fetched from the payment gateway response.</p>

            {loading && <p>Verifying payment...</p>}

            {paymentResult && (
              <div className={paymentResult.success ? 'success-box' : 'error-box'}>
                <p className={paymentResult.success ? 'success' : 'error'}>
                  {paymentResult.message || 'Payment result received.'}
                </p>
                <p>Method: {paymentResult.paymentMethod || gatewayParam || '-'}</p>
                <p>Status: {paymentResult.status || '-'}</p>
                <p>Transaction ID: {paymentResult.transactionId || '-'}</p>
                {paymentResult.amount && (
                  <p>
                    Amount: {paymentResult.amount} {paymentResult.currency || 'USD'}
                  </p>
                )}
              </div>
            )}

            {error && <p className="error">{error}</p>}

            <button className="pay-btn" onClick={goBackToCheckout} type="button">
              Back to Checkout
            </button>
          </section>
        </main>
        {showSuccessDialog && paymentResult?.success && (
          <div className="dialog-backdrop" onClick={() => setShowSuccessDialog(false)}>
            <div className="dialog-card" onClick={(event) => event.stopPropagation()}>
              <h3>Payment Successful</h3>
              <p>{paymentResult.message}</p>
              <p>Transaction ID: {paymentResult.transactionId}</p>
              <button className="pay-btn" type="button" onClick={() => setShowSuccessDialog(false)}>
                OK
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="App">
      <header className="top-nav">
        <div className="brand">FurniCraft</div>
        <nav className="nav-links">
          <button className="nav-link active" type="button">
            Shop
          </button>
          <button className="nav-link" type="button">
            Categories
          </button>
          <button className="nav-link" type="button">
            Checkout
          </button>
        </nav>
        <div className="cart-pill">
          Cart: <strong>{cartCount}</strong>
        </div>
        <div className="wishlist-pill">
          Wishlist: <strong>{wishlistCount}</strong>
        </div>
        <div className="user-pill">
          {authUser.name}
          <button type="button" onClick={logout}>
            Logout
          </button>
        </div>
      </header>
      <main className="payment-page">
        <section className="store-shell">
          <section className="hero-banner">
            <div>
              <h1>Modern Furniture for Every Space</h1>
              <p className="subtitle">
                Browse curated categories, pick your product, and complete payment using Stripe or PayPal.
              </p>
            </div>
            <button className="hero-cta" type="button" onClick={() => window.scrollTo({ top: 300, behavior: 'smooth' })}>
              Explore Collection
            </button>
          </section>

          <div className="store-grid">
            <section className="payment-card catalog-panel">
              <h2>Add Product Manually</h2>
              <form className="manual-form" onSubmit={addManualProduct}>
                <input
                  name="name"
                  placeholder="Product name"
                  value={newProduct.name}
                  onChange={onNewProductChange}
                />
                <input
                  name="category"
                  placeholder="Category"
                  value={newProduct.category}
                  onChange={onNewProductChange}
                />
                <input
                  name="price"
                  placeholder="Price"
                  type="number"
                  step="0.01"
                  min="1"
                  value={newProduct.price}
                  onChange={onNewProductChange}
                />
                <input
                  name="image"
                  placeholder="Image URL (optional)"
                  value={newProduct.image}
                  onChange={onNewProductChange}
                />
                <div className="file-upload-wrap">
                  <label htmlFor="product-image-file" className="file-upload-label">
                    Upload image file
                  </label>
                  <input
                    id="product-image-file"
                    type="file"
                    accept="image/*"
                    onChange={onNewProductImageFile}
                  />
                  {newProduct.imageFileName && (
                    <p className="upload-file-name">Selected: {newProduct.imageFileName}</p>
                  )}
                </div>
                <input
                  name="description"
                  placeholder="Description (optional)"
                  value={newProduct.description}
                  onChange={onNewProductChange}
                />
                <input
                  name="galleryText"
                  placeholder="Extra image URLs (comma-separated, optional)"
                  value={newProduct.galleryText}
                  onChange={onNewProductChange}
                />
                <button className="hero-cta" type="submit">
                  Add Product
                </button>
              </form>

              <h2>Categories</h2>
              <div className="category-row">
                {categories.map((category) => (
                  <button
                    key={category}
                    className={`category-chip ${activeCategory === category ? 'active' : ''}`}
                    onClick={() => onCategoryChange(category)}
                    type="button"
                  >
                    {category}
                  </button>
                ))}
              </div>

              <h2>Products</h2>
              {loadingProducts ? (
                <p>Loading products...</p>
              ) : filteredProducts.length === 0 ? (
                <p>No products found in this category.</p>
              ) : (
                <div className="products-grid">
                  {filteredProducts.map((product) => (
                    <div
                      key={product.id}
                      className={`product-card ${selectedProduct?.id === product.id ? 'selected' : ''}`}
                    >
                      <img
                        className="product-image"
                        src={resolveProductImage(product)}
                        alt={product.name}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        data-label={product.name}
                        onError={handleImageError}
                      />
                      <strong>{product.name}</strong>
                      <small>{product.category}</small>
                      <span>{product.description}</span>
                      <em>${product.price.toFixed(2)}</em>
                      <div className="product-actions">
                        <button
                          className="view-btn"
                          type="button"
                          onClick={() => setSelectedProduct(product)}
                        >
                          View
                        </button>
                        <button
                          className="add-btn"
                          type="button"
                          onClick={() => addToCart(product)}
                        >
                          Add to Cart
                        </button>
                        <button
                          className={`wish-btn ${isInWishlist(product.id) ? 'active' : ''}`}
                          type="button"
                          onClick={() => toggleWishlist(product)}
                        >
                          {isInWishlist(product.id) ? '♥' : '♡'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <aside className="payment-card checkout-panel">
              <h2>Wishlist</h2>
              {wishlistItems.length === 0 ? (
                <p className="empty-cart">No wishlist items yet.</p>
              ) : (
                <div className="wishlist-list">
                  {wishlistItems.map((item) => (
                    <div className="wishlist-item" key={item.id}>
                      <img
                        className="cart-thumb"
                        src={resolveProductImage(item)}
                        alt={item.name}
                        referrerPolicy="no-referrer"
                        data-label={item.name}
                        onError={handleImageError}
                      />
                      <div>
                        <p>{item.name}</p>
                        <p>${item.price.toFixed(2)}</p>
                      </div>
                      <div className="wishlist-actions">
                        <button type="button" onClick={() => addToCart(item)}>
                          Add to Cart
                        </button>
                        <button type="button" onClick={() => removeFromWishlist(item.id)}>
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <h2>Cart & Checkout</h2>
              <p className="subtitle">View items, discard/remove, and pay.</p>

              {cartItems.length === 0 ? (
                <p className="empty-cart">No products in cart yet.</p>
              ) : (
                <div className="cart-list">
                  {cartItems.map((item) => (
                    <div className="cart-item" key={item.id}>
                      <img
                        className="cart-thumb"
                        src={resolveProductImage(item)}
                        alt={item.name}
                        referrerPolicy="no-referrer"
                        data-label={item.name}
                        onError={handleImageError}
                      />
                      <div>
                        <p>{item.name}</p>
                        <p>
                          Qty: {item.quantity} x ${item.price.toFixed(2)}
                        </p>
                      </div>
                      <div className="cart-actions">
                        <button type="button" onClick={() => removeFromCart(item.id)}>
                          -1
                        </button>
                        <button type="button" onClick={() => addToCart(item)}>
                          +1
                        </button>
                        <button type="button" onClick={() => discardFromCart(item.id)}>
                          Discard
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="cart-total">
                <p>Total Items: {cartCount}</p>
                <p>
                  Cart Total: <strong>${cartTotal.toFixed(2)}</strong>
                </p>
                <div className="coupon-row">
                  <input
                    value={couponCode}
                    onChange={(event) => setCouponCode(event.target.value)}
                    placeholder="Coupon code"
                  />
                  <button type="button" onClick={applyCoupon}>
                    Apply
                  </button>
                </div>
                {appliedCoupon && (
                  <p className="coupon-ok">
                    Coupon {appliedCoupon.code} applied ({appliedCoupon.label})
                  </p>
                )}
                <p>
                  Discount: <strong>-${discountAmount.toFixed(2)}</strong>
                </p>
                <p>
                  Final Total: <strong>${payableTotal.toFixed(2)}</strong>
                </p>
                <p className="cart-checkout-note">
                  Checkout will include all products currently in your cart.
                </p>
                {cartItems.length > 0 && (
                  <button className="discard-cart-btn" type="button" onClick={discardCart}>
                    Discard Cart
                  </button>
                )}
              </div>

              {selectedProduct && (
                <div className="checkout-summary">
                  {(() => {
                    const activeImage =
                      selectedImageByProduct[selectedProduct.id] || resolveProductImage(selectedProduct);
                    return (
                      <img
                        className="checkout-image"
                        src={activeImage}
                        alt={selectedProduct.name}
                        referrerPolicy="no-referrer"
                        data-label={selectedProduct.name}
                        onError={handleImageError}
                      />
                    );
                  })()}
                  <p>
                    Product: <strong>{selectedProduct.name}</strong>
                  </p>
                  <p>
                    Category: <strong>{selectedProduct.category}</strong>
                  </p>
                  <p>
                    Price: <strong>${selectedProduct.price.toFixed(2)}</strong>
                  </p>
                  <p>
                    Status: <strong>Viewed Product</strong>
                  </p>
                  <div className="gallery-strip">
                    {getProductGallery(selectedProduct).map((image, index) => (
                      <button
                        type="button"
                        key={`${selectedProduct.id}-${index}`}
                        className={`gallery-thumb-btn ${
                          (selectedImageByProduct[selectedProduct.id] || resolveProductImage(selectedProduct)) ===
                          image
                            ? 'active'
                            : ''
                        }`}
                        onClick={() =>
                          setSelectedImageByProduct((current) => ({ ...current, [selectedProduct.id]: image }))
                        }
                      >
                        <img
                          className="gallery-thumb"
                          src={image}
                          alt={`${selectedProduct.name} ${index + 1}`}
                          onError={handleImageError}
                          data-label={selectedProduct.name}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="gateway-switch">
                <button
                  className={selectedGateway === 'stripe' ? 'active' : ''}
                  onClick={() => setSelectedGateway('stripe')}
                  type="button"
                >
                  Stripe
                </button>
                <button
                  className={selectedGateway === 'paypal' ? 'active' : ''}
                  onClick={() => setSelectedGateway('paypal')}
                  type="button"
                >
                  PayPal
                </button>
              </div>

              <button
                className="pay-btn"
                onClick={handlePayment}
                type="button"
                disabled={loading}
              >
                {loading ? 'Processing...' : `Pay with ${selectedGateway === 'stripe' ? 'Stripe' : 'PayPal'}`}
              </button>

              <p className="endpoint">
                Stripe test card: <strong>4242 4242 4242 4242</strong> (future date, any CVC).
              </p>

              {paymentResult?.success && (
                <div className="success-box">
                  <p className="success">{paymentResult.message}</p>
                  <p>Payment status: {paymentResult.status}</p>
                  <p>Transaction ID: {paymentResult.transactionId}</p>
                  <p>Method: {paymentResult.paymentMethod}</p>
                </div>
              )}
              {error && <p className="error">{error}</p>}
            </aside>
          </div>
        </section>
      </main>
      {showSuccessDialog && paymentResult?.success && (
        <div className="dialog-backdrop" onClick={() => setShowSuccessDialog(false)}>
          <div className="dialog-card" onClick={(event) => event.stopPropagation()}>
            <h3>Payment Successful</h3>
            <p>{paymentResult.message}</p>
            <p>Transaction ID: {paymentResult.transactionId}</p>
            <button className="pay-btn" type="button" onClick={() => setShowSuccessDialog(false)}>
              Continue Shopping
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
