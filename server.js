const express = require('express');
const multer = require('multer');
const { createWorker } = require('tesseract.js');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Passport and Session imports for Google Auth
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

// Load environment variables from .env file
dotenv.config();

const app = express();
// Use the capitalized PORT variable for compatibility with Render
const PORT = process.env.PORT || 3000;

// --- Passport/Session Middleware (START) ---

// Middleware to manage the user session
app.use(session({
    // IMPORTANT: Use your secure secret key from Render environment variables
    secret: process.env.SESSION_SECRET || 'YOUR_VERY_STRONG_SECRET_KEY', 
    resave: false,
    saveUninitialized: false,
    cookie: { secure: 'auto', maxAge: 24 * 60 * 60 * 1000 } // 1 day validity
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Passport Serialization (How to store user in session)
passport.serializeUser((user, done) => {
    // We only store the Google ID in the session
    done(null, user.id);
});

// Passport Deserialization (How to retrieve user from session)
passport.deserializeUser((id, done) => {
    // In a real app, look up the user by ID in your database here.
    // For now, we simulate the user object retrieval
    const mockUser = { id: id, displayName: 'Authenticated User' }; 
    done(null, mockUser);
});

// Configure Google Strategy
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    // Ensure this callbackURL matches the one in your Google Console settings!
    callbackURL: "https://parsex-ocr-tool.onrender.com/auth/google/callback" 
},
(accessToken, refreshToken, profile, done) => {
    // This is where you would process the user profile (save to database)
    // The profile object contains user details like ID, name, and emails
    return done(null, profile);
}));

// --- Passport/Session Middleware (END) ---


// --- Custom Middleware for Authentication ---

/**
 * Middleware to ensure a user is logged in.
 * If not authenticated, redirects them to the /login page.
 */
function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    // If not authenticated, redirect to login page
    res.redirect('/login');
}


// Configure Storage for Multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir);
        }
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

// Initialize Multer upload middleware
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Serve static files from the 'public' directory
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Tesseract Worker Initialization (Global for reuse)
const languages = ['eng', 'spa', 'deu', 'fra', 'ita'];
let worker;

async function initializeWorker() {
    console.log(`Initializing Tesseract worker for multiple languages...`);
    worker = await createWorker(languages.join('+'));
    console.log('Tesseract worker initialized and ready.');
}

initializeWorker();


// --- ROUTES (START) ---

// Route to serve the dedicated login page
app.get('/login', (req, res) => {
    // If the user is already logged in, redirect them home
    if (req.isAuthenticated()) {
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// 1. Google Authentication Route (Initial redirect)
app.get('/auth/google',
    passport.authenticate('google', { scope: ['profile', 'email'] })
);

// 2. Google Authentication Callback Route
app.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/login' }),
    (req, res) => {
        // Successful authentication, redirect to the main page
        res.redirect('/'); 
    }
);

// 3. Logout Route
app.get('/auth/logout', (req, res, next) => {
    req.logout((err) => {
        if (err) { return next(err); }
        // Redirect back to the login page after successful logout
        res.redirect('/login');
    });
});

// 4. OCR Processing Route (NOW PROTECTED)
// Only authenticated users can access this route
app.post('/api/ocr', ensureAuthenticated, upload.single('image'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No image file uploaded.' });
    }

    const lang = req.body.language || 'eng';

    try {
        const imagePath = req.file.path;

        if (!worker) {
             await initializeWorker();
        }

        const { data: { text } } = await worker.recognize(imagePath, lang);
        
        fs.unlinkSync(imagePath);

        res.json({
            text: text,
            filename: req.file.originalname,
            language: lang,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('OCR Error:', error);
        if (req.file) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ error: 'OCR processing failed. Please try a different image.' });
    }
});

// 5. User Check Route
app.get('/api/user', (req, res) => {
    if (req.isAuthenticated()) {
        // req.user comes from the deserializeUser function
        res.json({ isAuthenticated: true, username: req.user.displayName || 'User' });
    } else {
        res.json({ isAuthenticated: false });
    }
});

// 6. Root Route (Main OCR Page - Also protected, logic handled by script.js redirect)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- ROUTES (END) ---


// Start the Server
app.listen(PORT, () => {
    // NOTE: We use PORT here because we renamed the variable earlier
    console.log(`Server running at http://localhost:${PORT}`);
});