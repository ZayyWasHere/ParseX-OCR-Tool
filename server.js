// Load environment variables (for port configuration)
require('dotenv').config();
const express = require('express');
const path = require('path');
const multer = require('multer');
const { createWorker } = require('tesseract.js');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middlewares ---
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json()); // To parse JSON bodies if needed (though not used for this POST)

// Set up Multer storage (in-memory storage for the image buffer)
const upload = multer({ storage: multer.memoryStorage() });

// --- Tesseract Initialization ---

let worker;
const SUPPORTED_LANGS = ['eng', 'spa', 'deu', 'fra', 'ita']; // Tesseract language codes
let isWorkerReady = false;

// Initialize Tesseract Worker with all required languages (concatenated)
async function initializeTesseract() {
    console.log("Initializing Tesseract worker for multiple languages...");
    // Tesseract uses '+' to combine languages: 'eng+spa+deu'
    const langs = SUPPORTED_LANGS.join('+'); 
    
    try {
        worker = await createWorker(langs); 
        isWorkerReady = true;
        console.log("Tesseract worker ready. Server is fully operational.");
    } catch (err) {
        console.error("Failed to initialize Tesseract. Check your internet connection for downloads:", err);
    }
}

// Start the worker immediately upon server launch
initializeTesseract();

// Custom delay function (30 seconds)
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- OCR Endpoint ---
app.post('/api/convert', upload.single('image'), async (req, res) => {
    
    if (!isWorkerReady) {
        return res.status(503).json({ error: 'OCR engine is still starting up. Please wait for the Tesseract worker to be ready.' });
    }

    if (!req.file) {
        return res.status(400).json({ error: 'No image file uploaded.' });
    }

    // Get the language from the body (sent as a hidden field or query param, but we'll use a direct header/query string for simplicity)
    // NOTE: For this new setup, the client will send the language in the form data (handled in script.js)
    const language = req.body.language || 'eng'; // Fallback to English

    // The image data is available as a Buffer from Multer
    const imageBuffer = req.file.buffer;

    try {
        console.log(`Starting OCR processing for file: ${req.file.originalname} using language: ${language}`);
        
        // --- FEATURE 3: ADD 30-SECOND SCANNING DELAY ---
        console.log("Applying 30-second scanning delay...");
        await delay(30000); 
        console.log("Delay complete. Performing OCR...");
        
        // --- FEATURE 2: LANGUAGE SELECTING FOR OCR ---
        // Tesseract processes the image, passing the specific language configuration
        const { data: { text } } = await worker.recognize(imageBuffer, language); 
        
        console.log("OCR processing complete.");

        if (!text || text.trim().length === 0) {
             return res.status(404).json({ 
                 error: `No text was detected in the image using language code: ${language}. Try a clearer image.` 
             });
        }

        // Success: Send the extracted text back to the client
        res.json({ text: text });

    } catch (error) {
        console.error('Tesseract OCR failed:', error);
        res.status(500).json({ error: 'Internal server error during OCR processing.' });
    }
});

// --- Server Startup ---

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});