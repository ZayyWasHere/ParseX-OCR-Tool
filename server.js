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

// **IMPORTANT: ADD THIS SESSION_SECRET TO YOUR .env AND RENDER ENV VARS**
app.use(session({
    secret: process.env.SESSION_SECRET || 'T£0(Q1f;"xyGH9Lj}I0{0wxbZZ£Oi(4v', 
    resave: false,
    saveUninitialized: false,
    cookie: { secure: 'auto', maxAge: 24 * 60 * 60 * 1000 } // 1 day validity
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Passport Serialization (How to store user in session)
passport.serializeUser((user, done) => {
    // For now, store the Google ID
    done(null, user.id);
});

// Passport Deserialization (How to retrieve user from session)
passport.deserializeUser((id, done) => {
    // In a real app, look up the user by ID in your database here.
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
    return done(null, profile);
}));

// --- Passport/Session Middleware (END) ---


// Configure Storage for Multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Create an 'uploads' directory if it doesn't exist
        const uploadDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir);
        }
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        // Create a unique filename
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
    // NOTE: Tesseract.js will automatically download traineddata files for these languages if not found
    worker = await createWorker(languages.join('+'));
    console.log('Tesseract worker initialized and ready.');
}

initializeWorker();


// --- ROUTES (START) ---

// 1. Google Authentication Route (Initial redirect)
app.get('/auth/google',
    passport.authenticate('google', { scope: ['profile', 'email'] })
);

// 2. Google Authentication Callback Route
app.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/' }),
    (req, res) => {
        // Successful authentication, redirect home or to a dashboard
        res.redirect('/'); 
    }
);

// 3. Logout Route
app.get('/auth/logout', (req, res) => {
    req.logout((err) => {
        if (err) { return next(err); }
        res.redirect('/');
    });
});

// 4. OCR Processing Route
app.post('/api/ocr', upload.single('image'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No image file uploaded.' });
    }

    // Get the selected language from the form, default to English
    const lang = req.body.language || 'eng';

    try {
        const imagePath = req.file.path;

        // Ensure worker is ready before running recognition
        if (!worker) {
             await initializeWorker();
        }

        // Run OCR with the selected language
        const { data: { text } } = await worker.recognize(imagePath, lang);
        
        // Clean up the uploaded image after processing
        fs.unlinkSync(imagePath);

        res.json({
            text: text,
            filename: req.file.originalname,
            language: lang,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('OCR Error:', error);
        // Clean up on error, too
        if (req.file) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ error: 'OCR processing failed. Please try a different image.' });
    }
});

// 5. User Check Route (To update the front-end)
app.get('/api/user', (req, res) => {
    if (req.isAuthenticated()) {
        // Send a simplified user object if authenticated
        res.json({ isAuthenticated: true, username: req.user.displayName || 'User' });
    } else {
        res.json({ isAuthenticated: false });
    }
});

// --- ROUTES (END) ---


// Start the Server
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});