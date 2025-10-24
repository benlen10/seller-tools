require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const crypto = require('crypto');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:8080',
    credentials: true
}));
app.use(express.json());
app.use(express.static('.')); // Serve static files from current directory
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // Set to true in production with HTTPS
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Etsy API Configuration
const ETSY_API_KEY = process.env.ETSY_API_KEY;
const ETSY_SHARED_SECRET = process.env.ETSY_SHARED_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || 'http://localhost:3000/api/auth/etsy/callback';
const ETSY_BASE_URL = 'https://openapi.etsy.com/v3';

// Helper function to generate code verifier and challenge for PKCE
function generateCodeVerifier() {
    return crypto.randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier) {
    return crypto.createHash('sha256').update(verifier).digest('base64url');
}

// ============================================
// AUTHENTICATION ROUTES
// ============================================

// Start OAuth flow
app.get('/api/auth/etsy', (req, res) => {
    try {
        // Generate PKCE values
        const codeVerifier = generateCodeVerifier();
        const codeChallenge = generateCodeChallenge(codeVerifier);
        const state = crypto.randomBytes(16).toString('hex');

        // Store in session
        req.session.codeVerifier = codeVerifier;
        req.session.state = state;

        // Build authorization URL
        const authUrl = new URL('https://www.etsy.com/oauth/connect');
        authUrl.searchParams.append('response_type', 'code');
        authUrl.searchParams.append('client_id', ETSY_API_KEY);
        authUrl.searchParams.append('redirect_uri', REDIRECT_URI);
        // Request all read scopes for maximum access
        authUrl.searchParams.append('scope', 'listings_r listings_w shops_r shops_w transactions_r transactions_w address_r address_w email_r profile_r profile_w');
        authUrl.searchParams.append('state', state);
        authUrl.searchParams.append('code_challenge', codeChallenge);
        authUrl.searchParams.append('code_challenge_method', 'S256');

        res.json({ authUrl: authUrl.toString() });
    } catch (error) {
        console.error('Error starting OAuth flow:', error);
        res.status(500).json({ error: 'Failed to start authentication' });
    }
});

// OAuth callback
app.get('/api/auth/etsy/callback', async (req, res) => {
    try {
        const { code, state } = req.query;

        // Verify state parameter
        if (!state || state !== req.session.state) {
            return res.status(400).send('Invalid state parameter');
        }

        // Exchange authorization code for access token
        const tokenResponse = await axios.post('https://api.etsy.com/v3/public/oauth/token', {
            grant_type: 'authorization_code',
            client_id: ETSY_API_KEY,
            redirect_uri: REDIRECT_URI,
            code: code,
            code_verifier: req.session.codeVerifier
        }, {
            headers: {
                'Content-Type': 'application/json'
            }
        });

        // Store access token in session
        req.session.accessToken = tokenResponse.data.access_token;
        req.session.refreshToken = tokenResponse.data.refresh_token;
        req.session.expiresAt = Date.now() + (tokenResponse.data.expires_in * 1000);

        // Clear temporary session data
        delete req.session.codeVerifier;
        delete req.session.state;

        // Redirect back to app
        res.redirect('/app.html');
    } catch (error) {
        console.error('OAuth callback error:', error.response?.data || error.message);
        res.status(500).send('Authentication failed');
    }
});

// Check authentication status
app.get('/api/auth/status', (req, res) => {
    if (req.session.accessToken && req.session.expiresAt > Date.now()) {
        res.json({ authenticated: true });
    } else {
        res.json({ authenticated: false });
    }
});

// Logout
app.post('/api/auth/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// ============================================
// ETSY API ROUTES
// ============================================

// Middleware to check if user is authenticated
function requireAuth(req, res, next) {
    if (!req.session.accessToken) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    // Check if token is expired
    if (req.session.expiresAt <= Date.now()) {
        return res.status(401).json({ error: 'Token expired' });
    }

    next();
}

// Get user's shop information
app.get('/api/shop', requireAuth, async (req, res) => {
    try {
        const response = await axios.get(`${ETSY_BASE_URL}/application/users/me`, {
            headers: {
                'Authorization': `Bearer ${req.session.accessToken}`,
                'x-api-key': ETSY_API_KEY
            }
        });

        // Get the user's shop ID
        const userId = response.data.user_id;

        const shopsResponse = await axios.get(`${ETSY_BASE_URL}/application/users/${userId}/shops`, {
            headers: {
                'Authorization': `Bearer ${req.session.accessToken}`,
                'x-api-key': ETSY_API_KEY
            }
        });

        res.json(shopsResponse.data);
    } catch (error) {
        console.error('Error fetching shop:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            error: 'Failed to fetch shop information'
        });
    }
});

// Get all active listings from user's shop
app.get('/api/listings', requireAuth, async (req, res) => {
    try {
        // First get the user's shop ID
        const userResponse = await axios.get(`${ETSY_BASE_URL}/application/users/me`, {
            headers: {
                'Authorization': `Bearer ${req.session.accessToken}`,
                'x-api-key': ETSY_API_KEY
            }
        });

        console.log('User response:', JSON.stringify(userResponse.data, null, 2));

        // Get shop_id from user response (it's included directly)
        let shopId = userResponse.data.shop_id;

        // If shop_id not in user response, fetch from shops endpoint
        if (!shopId) {
            const userId = userResponse.data.user_id;
            const shopsResponse = await axios.get(`${ETSY_BASE_URL}/application/users/${userId}/shops`, {
                headers: {
                    'Authorization': `Bearer ${req.session.accessToken}`,
                    'x-api-key': ETSY_API_KEY
                }
            });

            console.log('Shops response:', JSON.stringify(shopsResponse.data, null, 2));

            // Handle single shop object or array of shops
            if (Array.isArray(shopsResponse.data)) {
                shopId = shopsResponse.data[0]?.shop_id;
            } else if (shopsResponse.data.results && Array.isArray(shopsResponse.data.results)) {
                shopId = shopsResponse.data.results[0]?.shop_id;
            } else {
                shopId = shopsResponse.data.shop_id;
            }
        }

        if (!shopId) {
            return res.status(404).json({
                error: 'No shop found',
                message: 'Your Etsy account does not have a shop associated with it.'
            });
        }

        console.log('Using shop ID:', shopId);

        // Get active listings with images and inventory
        // Fixed: state=active is a QUERY PARAMETER, not part of the path!
        console.log('Making request to:', `${ETSY_BASE_URL}/application/shops/${shopId}/listings`);
        console.log('With params:', { state: 'active', includes: 'Images,Inventory', limit: 100 });

        const listingsResponse = await axios.get(
            `${ETSY_BASE_URL}/application/shops/${shopId}/listings`,
            {
                params: {
                    state: 'active',  // Filter for active listings
                    includes: 'Images,Inventory',
                    limit: 100
                },
                headers: {
                    'Authorization': `Bearer ${req.session.accessToken}`,
                    'x-api-key': ETSY_API_KEY
                }
            }
        );

        console.log('Listings response:', JSON.stringify({
            count: listingsResponse.data.count,
            results_length: listingsResponse.data.results?.length,
            first_listing_title: listingsResponse.data.results?.[0]?.title
        }, null, 2));

        // Check if we got any results
        if (!listingsResponse.data.results || listingsResponse.data.results.length === 0) {
            console.log('No listings returned from Etsy API');
            return res.json({
                count: 0,
                results: []
            });
        }

        // Transform Etsy listings to our app format
        const transformedListings = listingsResponse.data.results.map(listing => {
            // Get listing images
            const photos = listing.images?.map(img => img.url_fullxfull || img.url_570xN) || [];

            // Get variations from inventory
            const variations = [];
            if (listing.inventory?.products) {
                listing.inventory.products.forEach(product => {
                    const variationData = {};

                    // Build variation object from property values
                    if (product.property_values) {
                        product.property_values.forEach(prop => {
                            const propName = prop.property_name || 'option';
                            variationData[propName.toLowerCase()] = prop.values?.[0] || '';
                        });
                    }

                    variationData.price = product.offerings?.[0]?.price?.amount /
                                         product.offerings?.[0]?.price?.divisor || listing.price.amount / listing.price.divisor;
                    variationData.quantity = product.offerings?.[0]?.quantity || 0;

                    if (Object.keys(variationData).length > 2) { // More than just price and quantity
                        variations.push(variationData);
                    }
                });
            }

            // If no variations, create a single default variation
            if (variations.length === 0) {
                variations.push({
                    option: 'Default',
                    price: listing.price.amount / listing.price.divisor,
                    quantity: listing.quantity
                });
            }

            return {
                id: listing.listing_id,
                title: listing.title,
                price: listing.price.amount / listing.price.divisor,
                description: listing.description || '',
                tags: listing.tags || [],
                photos: photos,
                variations: variations,
                lastBackup: null, // Will be set when backup is created
                etsyUrl: listing.url,
                state: listing.state
            };
        });

        res.json({
            count: transformedListings.length,
            results: transformedListings
        });
    } catch (error) {
        console.error('Error fetching listings:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            error: 'Failed to fetch listings',
            details: error.response?.data || error.message
        });
    }
});

// Get specific listing details
app.get('/api/listings/:listingId', requireAuth, async (req, res) => {
    try {
        const { listingId } = req.params;

        const response = await axios.get(
            `${ETSY_BASE_URL}/application/listings/${listingId}`,
            {
                params: {
                    includes: 'Images,Inventory'
                },
                headers: {
                    'Authorization': `Bearer ${req.session.accessToken}`,
                    'x-api-key': ETSY_API_KEY
                }
            }
        );

        res.json(response.data);
    } catch (error) {
        console.error('Error fetching listing:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            error: 'Failed to fetch listing'
        });
    }
});

// ============================================
// SERVER START
// ============================================

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📱 Frontend available at http://localhost:${PORT}/app.html`);
    console.log(`🔐 Etsy OAuth callback: ${REDIRECT_URI}`);
});
