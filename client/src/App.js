import './App.css';
import axios from 'axios';
import { useEffect, useMemo, useState } from 'react';
import SalesAnalytics from './components/SalesAnalytics';

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

const CUSTOM_PRODUCTS_KEY = 'furnicraft_custom_products';
const AUTH_TOKEN_KEY = 'furnicraft_auth_token';
const AUTH_USER_KEY = 'furnicraft_auth_user';
const MAX_CUSTOM_PRODUCTS = 25;
const PENDING_CHECKOUT_KEY = 'furnicraft_pending_checkout';
const RECORDED_TX_KEY = 'furnicraft_recorded_transactions';

const TOAST_DURATION_MS = 3500;
const MAX_UPLOAD_IMAGE_BYTES = 1024 * 1024 * 2; // 2MB

const isQuotaExceededError = (error) => {
  if (!error) return false;
  if (error.name === 'QuotaExceededError') return true;
  return typeof error.message === 'string' && error.message.toLowerCase().includes('quota');
};

const sanitizeCustomProductForStorage = (product) => {
  const name = String(product?.name || 'Custom').slice(0, 120);
  const category = String(product?.category || 'Custom').slice(0, 80);
  const description = String(product?.description || '').slice(0, 600);
  const price = Number(product?.price || 0);
  const gallery = Array.isArray(product?.gallery) ? product.gallery.slice(0, 6).map(String) : [];

  // Never store base64 images in localStorage (it quickly exceeds the quota).
  const image = typeof product?.image === 'string' && product.image.startsWith('data:image')
    ? buildProductPlaceholder(name)
    : String(product?.image || '');

  return {
    id: String(product?.id || ''),
    name,
    category,
    description,
    price,
    image,
    gallery,
    source: 'custom',
  };
};

const loadCustomProductsFromStorage = () => {
  try {
    const raw = localStorage.getItem(CUSTOM_PRODUCTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => sanitizeCustomProductForStorage(item))
      .filter((item) => item.name && item.category && Number(item.price) > 0)
      .slice(0, MAX_CUSTOM_PRODUCTS);
  } catch (error) {
    return [];
  }
};

const persistCustomProductsToStorage = (items) => {
  const safeItems = Array.isArray(items) ? items.slice(0, MAX_CUSTOM_PRODUCTS) : [];

  try {
    localStorage.setItem(CUSTOM_PRODUCTS_KEY, JSON.stringify(safeItems));
    return { ok: true };
  } catch (error) {
    if (!isQuotaExceededError(error)) {
      return { ok: false, error };
    }

    // Quota exceeded: drop older entries and retry once.
    const trimmed = safeItems.slice(0, Math.max(5, Math.floor(safeItems.length / 2)));
    try {
      localStorage.setItem(CUSTOM_PRODUCTS_KEY, JSON.stringify(trimmed));
      return { ok: true, trimmed: true };
    } catch (retryError) {
      // Last resort: remove the key to unblock the app.
      try {
        localStorage.removeItem(CUSTOM_PRODUCTS_KEY);
      } catch (_) {}
      return { ok: false, error: retryError, cleared: true };
    }
  }
};

function App() {
  const [toasts, setToasts] = useState([]);

  const pushToast = (message, type = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const toast = { id, message: String(message || ''), type };
    setToasts((current) => [toast, ...current].slice(0, 4));

    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, TOAST_DURATION_MS);
  };

  const dismissToast = (toastId) => {
    setToasts((current) => current.filter((toast) => toast.id !== toastId));
  };

  const toastIcon = (type) => {
    if (type === 'success') {
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2Z"
            fill="currentColor"
          />
        </svg>
      );
    }
    if (type === 'error') {
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 14h-2v-2h2v2Zm0-4h-2V6h2v6Z"
            fill="currentColor"
          />
        </svg>
      );
    }
    if (type === 'warning') {
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M1 21h22L12 2 1 21Zm12-3h-2v-2h2v2Zm0-4h-2v-4h2v4Z"
            fill="currentColor"
          />
        </svg>
      );
    }
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M11 17h2v-6h-2v6Zm0-8h2V7h-2v2Zm1-7a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z"
          fill="currentColor"
        />
      </svg>
    );
  };

  const ToastStack = () => (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.type}`}>
          <span className="toast-icon">{toastIcon(toast.type)}</span>
          <span className="toast-message">{toast.message}</span>
          <button className="toast-action" type="button" onClick={() => dismissToast(toast.id)}>
            Okay
          </button>
        </div>
      ))}
    </div>
  );

  const [authUser, setAuthUser] = useState(() => {
    try {
      const token = localStorage.getItem(AUTH_TOKEN_KEY);
      const savedUser = localStorage.getItem(AUTH_USER_KEY);
      if (token && savedUser) {
        axios.defaults.headers.common.Authorization = `Bearer ${token}`;
        return JSON.parse(savedUser);
      }
    } catch (_) {
      /* ignore */
    }
    return null;
  });
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({
    name: '',
    email: '',
    password: '',
  });
  const [showSettings, setShowSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState({
    name: '',
    currentPassword: '',
    newPassword: '',
  });
  const [savingSettings, setSavingSettings] = useState(false);
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
  const [dailyAnalytics, setDailyAnalytics] = useState(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  const apiBaseUrl = useMemo(() => {
    return process.env.REACT_APP_API_URL || 'http://localhost:5000';
  }, []);

  useEffect(() => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) return;

    axios
      .get(`${apiBaseUrl}/api/auth/me`)
      .then((res) => {
        if (res.data?.user) {
          setAuthUser(res.data.user);
          localStorage.setItem(AUTH_USER_KEY, JSON.stringify(res.data.user));
        }
      })
      .catch(() => {
        localStorage.removeItem(AUTH_TOKEN_KEY);
        localStorage.removeItem(AUTH_USER_KEY);
        delete axios.defaults.headers.common.Authorization;
        setAuthUser(null);
      });
  }, [apiBaseUrl]);

  const [customProducts, setCustomProducts] = useState(() => loadCustomProductsFromStorage());

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
        const localCustom = loadCustomProductsFromStorage();
        setCustomProducts(localCustom);
        setProducts([...localCustom, ...list]);
        setActiveCategory('All');
        const initial = localCustom[0] || list[0];
        if (initial) {
          setSelectedProduct(initial);
        }
        pushToast('Products loaded successfully.', 'success');
      } catch (requestError) {
        const localCustom = loadCustomProductsFromStorage();
        setCustomProducts(localCustom);
        if (localCustom.length > 0) {
          setProducts(localCustom);
          setSelectedProduct(localCustom[0]);
          setActiveCategory('All');
        }
        pushToast(
          requestError.response?.data?.message ||
            'Unable to load products. Make sure backend is running on port 5000.',
          'error'
        );
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
    if (isResultPage) return;

    const fetchAnalytics = async () => {
      setLoadingAnalytics(true);
      try {
        const response = await axios.get(`${apiBaseUrl}/api/analytics/daily`);
        if (response.data?.success) {
          setDailyAnalytics(response.data);
        }
      } catch (_) {
        // ignore analytics errors
      } finally {
        setLoadingAnalytics(false);
      }
    };

    fetchAnalytics();
    const interval = window.setInterval(fetchAnalytics, 60_000);
    return () => window.clearInterval(interval);
  }, [apiBaseUrl, isResultPage]);

  useEffect(() => {
    if (!isResultPage) {
      return;
    }

    const fetchResult = async () => {
      setLoading(true);
      setError('');
      setShowSuccessDialog(false);

      try {
        if (gatewayParam === 'stripe') {
          if (statusParam !== 'success' || !stripeSessionId) {
            setPaymentResult({
              success: false,
              paymentMethod: 'Stripe',
              status: statusParam || 'cancelled',
              message: 'Stripe payment was cancelled.',
            });
            pushToast('Stripe payment was cancelled.', 'warning');
            return;
          }

          const response = await axios.get(`${apiBaseUrl}/api/stripe/session/${stripeSessionId}`);
          const result = {
            ...response.data,
            success: response.data?.success === true || response.data?.success === 'true',
          };
          setPaymentResult(result);
          if (result.success) setShowSuccessDialog(true);
          pushToast(
            result.success ? 'Stripe payment verified.' : result.message || 'Stripe payment check complete.',
            result.success ? 'success' : 'info'
          );
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
            pushToast('PayPal payment was cancelled.', 'warning');
            return;
          }

          const response = await axios.post(`${apiBaseUrl}/api/paypal/capture-order`, {
            orderId: paypalOrderToken,
          });
          const result = {
            ...response.data,
            success: response.data?.success === true || response.data?.success === 'true',
          };
          setPaymentResult(result);
          if (result.success) setShowSuccessDialog(true);
          pushToast(
            result.success ? 'PayPal payment captured.' : result.message || 'PayPal capture complete.',
            result.success ? 'success' : 'info'
          );
          return;
        }

        setError('Unknown payment result route.');
        pushToast('Unknown payment result route.', 'error');
      } catch (requestError) {
        pushToast(
          requestError.response?.data?.message ||
            'Unable to verify payment result. Please check backend logs.',
          'error'
        );
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

  useEffect(() => {
    if (!isResultPage) return;
    if (!paymentResult?.success) return;
    if (!paymentResult.transactionId) return;

    const txId = String(paymentResult.transactionId);
    try {
      const recorded = JSON.parse(localStorage.getItem(RECORDED_TX_KEY) || '[]');
      if (Array.isArray(recorded) && recorded.includes(txId)) {
        return;
      }
    } catch (_) {}

    let pending = null;
    try {
      pending = JSON.parse(localStorage.getItem(PENDING_CHECKOUT_KEY) || 'null');
    } catch (_) {
      pending = null;
    }

    const payload = {
      transactionId: txId,
      gateway: gatewayParam || 'unknown',
      // Fallback values let analytics still update even if pending checkout context is missing.
      productId: pending?.productId || 'unknown-checkout',
      productName: pending?.productName || 'Checkout payment',
      quantity: pending?.quantity || 1,
      amount: paymentResult.amount || pending?.amount || 0,
      currency: paymentResult.currency || pending?.currency || 'USD',
      soldAt: new Date().toISOString(),
    };

    axios
      .post(`${apiBaseUrl}/api/analytics/record-sale`, payload)
      .then(() => {
        try {
          const recorded = JSON.parse(localStorage.getItem(RECORDED_TX_KEY) || '[]');
          const next = Array.isArray(recorded) ? [txId, ...recorded] : [txId];
          localStorage.setItem(RECORDED_TX_KEY, JSON.stringify(Array.from(new Set(next)).slice(0, 50)));
        } catch (_) {
          localStorage.setItem(RECORDED_TX_KEY, JSON.stringify([txId]));
        }
        localStorage.removeItem(PENDING_CHECKOUT_KEY);
        pushToast('Sale recorded. Analytics updated.', 'success');
      })
      .catch(() => {
        pushToast('Payment succeeded, but analytics could not be updated.', 'warning');
      });
  }, [apiBaseUrl, gatewayParam, isResultPage, paymentResult]);

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
      pushToast('Please add a product to cart or select one product first.', 'error');
      return;
    }

    setLoading(true);
    setPaymentResult(null);
    setError('');

    try {
      // Store pending checkout context so we can record a sale after gateway redirect.
      try {
        localStorage.setItem(
          PENDING_CHECKOUT_KEY,
          JSON.stringify({
            productId: checkoutTarget.productId,
            productName: checkoutTarget.productName,
            quantity: checkoutTarget.productId === 'cart-bundle' ? cartCount : 1,
            amount: checkoutTarget.amount,
            currency: 'USD',
            createdAt: new Date().toISOString(),
          })
        );
      } catch (_) {}

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

        pushToast('Redirecting to Stripe checkout...', 'info');
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

      pushToast('Redirecting to PayPal approval...', 'info');
      window.location.href = response.data.approveUrl;
    } catch (requestError) {
      pushToast(
        requestError.response?.data?.message || requestError.message || 'Unable to start payment flow.',
        'error'
      );
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
      pushToast('Please upload a valid image file.', 'error');
      return;
    }

    if (file.size > MAX_UPLOAD_IMAGE_BYTES) {
      const maxMb = (MAX_UPLOAD_IMAGE_BYTES / 1024 / 1024).toFixed(0);
      setError(`Image is too large. Please upload an image smaller than ${maxMb}MB.`);
      pushToast(`Image is too large. Please upload an image smaller than ${maxMb}MB.`, 'error');
      setNewProduct((current) => ({ ...current, image: '', imageFileName: '' }));
      event.target.value = '';
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
      pushToast('Image uploaded successfully.', 'success');
    };
    reader.readAsDataURL(file);
  };

  const addManualProduct = async (event) => {
    event.preventDefault();
    if (!newProduct.name || !newProduct.price || !newProduct.category) {
      setError('Please fill product name, category, and price.');
      pushToast('Please fill product name, category, and price.', 'error');
      return;
    }

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

    try {
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
      pushToast('Product added successfully.', 'success');
    } catch (requestError) {
      // If backend is unavailable, save locally (without base64 images) to avoid losing the user's work.
      const localId = `local-${Date.now()}`;
      const fallbackProduct = sanitizeCustomProductForStorage({
        id: localId,
        ...payload,
      });

      const nextCustom = [fallbackProduct, ...customProducts].slice(0, MAX_CUSTOM_PRODUCTS);
      const persistResult = persistCustomProductsToStorage(nextCustom);
      setCustomProducts(nextCustom);
      setProducts((current) => [fallbackProduct, ...current]);
      setSelectedProduct(fallbackProduct);
      setActiveCategory('All');

      if (!persistResult.ok) {
        setError(
          'Could not save product in backend, and browser storage is full. Clear site data/storage and try again.'
        );
        pushToast(
          'Could not save product (backend failed and browser storage is full). Clear site storage and try again.',
          'error'
        );
        return;
      }

      setError(
        requestError.response?.data?.message ||
          'Backend save failed, so the product was saved locally in this browser.'
      );
      pushToast(
        requestError.response?.data?.message ||
          'Backend save failed, saved locally in this browser instead.',
        'warning'
      );
    }
  };

  const deleteProduct = async (product) => {
    if (!product) return;

    const confirmed = window.confirm(`Delete "${product.name}"?`);
    if (!confirmed) return;

    // Local-only products: remove from local storage and UI.
    if (String(product.id || '').startsWith('local-')) {
      const nextCustom = customProducts.filter((item) => item.id !== product.id);
      persistCustomProductsToStorage(nextCustom);
      setCustomProducts(nextCustom);
      setProducts((current) => current.filter((item) => item.id !== product.id));
      setSelectedProduct((current) => (current?.id === product.id ? null : current));
      setError('');
      pushToast('Product deleted.', 'success');
      return;
    }

    try {
      await axios.delete(`${apiBaseUrl}/api/products/${product.id}`);
      setProducts((current) => current.filter((item) => item.id !== product.id));
      setSelectedProduct((current) => (current?.id === product.id ? null : current));
      setError('');
      pushToast('Product deleted.', 'success');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Failed to delete product.');
      pushToast(requestError.response?.data?.message || 'Failed to delete product.', 'error');
    }
  };

  const onAuthFormChange = (event) => {
    const { name, value } = event.target;
    setAuthForm((current) => ({ ...current, [name]: value }));
  };

  const onAuthSubmit = async (event) => {
    event.preventDefault();
    const email = authForm.email.trim().toLowerCase();
    const password = authForm.password.trim();

    if (!email || !password) {
      setError('Please enter email and password.');
      pushToast('Please enter email and password.', 'error');
      return;
    }

    try {
      if (authMode === 'register') {
        const response = await axios.post(`${apiBaseUrl}/api/auth/register`, {
          name: authForm.name.trim() || 'Customer',
          email,
          password,
        });
        const { token, user } = response.data;
        localStorage.setItem(AUTH_TOKEN_KEY, token);
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
        axios.defaults.headers.common.Authorization = `Bearer ${token}`;
        setAuthUser(user);
        setError('');
        pushToast('Account created successfully.', 'success');
        return;
      }

      const response = await axios.post(`${apiBaseUrl}/api/auth/login`, { email, password });
      const { token, user } = response.data;
      localStorage.setItem(AUTH_TOKEN_KEY, token);
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
      axios.defaults.headers.common.Authorization = `Bearer ${token}`;
      setAuthUser(user);
      setError('');
      pushToast('Signed in successfully.', 'success');
    } catch (requestError) {
      const msg =
        requestError.response?.data?.message ||
        'Authentication failed. Ensure the server is running and MongoDB is connected.';
      setError(msg);
      pushToast(msg, 'error');
    }
  };

  const logout = async () => {
    try {
      if (localStorage.getItem(AUTH_TOKEN_KEY)) {
        await axios.post(`${apiBaseUrl}/api/auth/logout`);
      }
    } catch (_) {
      /* ignore */
    }
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
    delete axios.defaults.headers.common.Authorization;
    setAuthUser(null);
    setCartItems([]);
    setPaymentResult(null);
    setShowSuccessDialog(false);
    setShowSettings(false);
    setError('');
    pushToast('Logged out.', 'info');
  };

  const openSettings = () => {
    if (!authUser) return;
    setSettingsForm({
      name: authUser.name || '',
      currentPassword: '',
      newPassword: '',
    });
    setShowSettings(true);
    setError('');
  };

  const onSettingsChange = (event) => {
    const { name, value } = event.target;
    setSettingsForm((current) => ({ ...current, [name]: value }));
  };

  const onSettingsSubmit = async (event) => {
    event.preventDefault();
    setSavingSettings(true);
    setError('');
    try {
      const payload = { name: settingsForm.name.trim() };
      if (settingsForm.newPassword) {
        payload.currentPassword = settingsForm.currentPassword;
        payload.newPassword = settingsForm.newPassword;
      }
      const response = await axios.patch(`${apiBaseUrl}/api/auth/settings`, payload);
      if (response.data?.user) {
        setAuthUser(response.data.user);
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(response.data.user));
      }
      setShowSettings(false);
      setSettingsForm((current) => ({ ...current, currentPassword: '', newPassword: '' }));
      pushToast('Settings saved.', 'success');
    } catch (requestError) {
      const msg = requestError.response?.data?.message || 'Could not save settings.';
      setError(msg);
      pushToast(msg, 'error');
    } finally {
      setSavingSettings(false);
    }
  };

  if (!authUser) {
    return (
      <div className="App">
        <ToastStack />
        <main className="auth-page">
          <section className="auth-card">
            <h1>FurniCraft Login</h1>
            <p className="subtitle">
              Sign in to browse, add to cart, and checkout. Accounts use the server API (MongoDB required).
            </p>
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
        <ToastStack />
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
      <ToastStack />
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
          <span className="user-name">{authUser.name}</span>
          <button type="button" className="user-settings-btn" onClick={openSettings}>
            Settings
          </button>
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

          <SalesAnalytics apiBaseUrl={apiBaseUrl} />

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
                      <div className="product-media" onClick={() => setSelectedProduct(product)} role="button" tabIndex={0}>
                        <img
                          className="product-image"
                          src={resolveProductImage(product)}
                          alt={product.name}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          data-label={product.name}
                          onError={handleImageError}
                        />

                        {Number(product.soldCount || 0) > 0 && (
                          <div className="sold-pill" title="Units sold">
                            Sold {Number(product.soldCount || 0)}
                          </div>
                        )}

                        <button
                          className={`card-icon-btn heart ${isInWishlist(product.id) ? 'active' : ''}`}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleWishlist(product);
                          }}
                          aria-label="Toggle wishlist"
                          title="Wishlist"
                        >
                          {isInWishlist(product.id) ? '♥' : '♡'}
                        </button>

                        <button
                          className="card-icon-btn plus"
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            addToCart(product);
                          }}
                          aria-label="Add to cart"
                          title="Add to cart"
                        >
                          +
                        </button>
                      </div>

                      <div className="product-meta">
                        <div className="product-name">{product.name}</div>
                        <div className="product-price">${product.price.toFixed(2)}</div>
                        <div className="product-rating" aria-label="Rating">
                          {'★★★★★'}
                        </div>
                      </div>

                      {product.source === 'custom' && (
                        <div className="product-actions-row">
                          <button
                            className="icon-btn danger"
                            type="button"
                            onClick={() => deleteProduct(product)}
                            title="Delete product"
                            aria-label="Delete product"
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path
                                d="M9 3h6l1 2h5v2H3V5h5l1-2Zm1 6h2v9h-2V9Zm4 0h2v9h-2V9ZM6 9h2v9H6V9Zm2 12h8a2 2 0 0 0 2-2V9H6v10a2 2 0 0 0 2 2Z"
                                fill="currentColor"
                              />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <aside className="payment-card checkout-panel">
              <h2>Today’s Analytics</h2>
              {loadingAnalytics ? (
                <p className="empty-cart">Loading analytics...</p>
              ) : dailyAnalytics?.totals ? (
                <div className="analytics-box">
                  <div className="analytics-row">
                    <span>Sales</span>
                    <strong>{dailyAnalytics.totals.salesCount}</strong>
                  </div>
                  <div className="analytics-row">
                    <span>Units sold</span>
                    <strong>{dailyAnalytics.totals.unitsSold}</strong>
                  </div>
                  <div className="analytics-row">
                    <span>Revenue</span>
                    <strong>
                      {dailyAnalytics.totals.currency} {Number(dailyAnalytics.totals.revenue || 0).toFixed(2)}
                    </strong>
                  </div>

                  {Array.isArray(dailyAnalytics.topProducts) && dailyAnalytics.topProducts.length > 0 && (
                    <>
                      <p className="subtitle" style={{ marginTop: 10 }}>
                        Top products
                      </p>
                      <div className="analytics-top">
                        {dailyAnalytics.topProducts.map((p) => (
                          <div key={p.productId} className="analytics-top-row">
                            <span className="analytics-top-name">{p.productName || p.productId}</span>
                            <span className="analytics-top-units">{p.unitsSold}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <p className="empty-cart">No sales recorded today yet.</p>
              )}

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
      {showSettings && (
        <div className="dialog-backdrop" onClick={() => setShowSettings(false)}>
          <div className="dialog-card settings-dialog" onClick={(event) => event.stopPropagation()}>
            <h3>Account settings</h3>
            <p className="subtitle settings-email">{authUser?.email}</p>
            <form className="settings-form" onSubmit={onSettingsSubmit}>
              <label htmlFor="settings-name">Display name</label>
              <input
                id="settings-name"
                name="name"
                value={settingsForm.name}
                onChange={onSettingsChange}
                autoComplete="name"
              />
              <label htmlFor="settings-new-password">New password (optional)</label>
              <input
                id="settings-new-password"
                name="newPassword"
                type="password"
                value={settingsForm.newPassword}
                onChange={onSettingsChange}
                autoComplete="new-password"
                placeholder="Leave blank to keep current"
              />
              {settingsForm.newPassword ? (
                <>
                  <label htmlFor="settings-current-password">Current password</label>
                  <input
                    id="settings-current-password"
                    name="currentPassword"
                    type="password"
                    value={settingsForm.currentPassword}
                    onChange={onSettingsChange}
                    autoComplete="current-password"
                    required
                  />
                </>
              ) : null}
              <div className="settings-actions">
                <button className="pay-btn" type="submit" disabled={savingSettings}>
                  {savingSettings ? 'Saving...' : 'Save changes'}
                </button>
                <button className="settings-cancel" type="button" onClick={() => setShowSettings(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
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
