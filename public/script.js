// Local Storage Key
const HISTORY_KEY = 'ParseX_OCR_History';

document.addEventListener('DOMContentLoaded', () => {
    // 1. Get references to all necessary DOM elements
    const imageUpload = document.getElementById('image-upload');
    const languageSelect = document.getElementById('language-select');
    const convertButton = document.getElementById('convert-button');
    const imagePreview = document.getElementById('image-preview');
    const loadingSpinner = document.getElementById('loading-spinner');
    const resultTextarea = document.getElementById('result-text');
    const copyButton = document.getElementById('copy-button');
    const downloadTxtButton = document.getElementById('download-txt-button');
    const scanStatus = document.getElementById('scan-status');
    const scanMessage = document.getElementById('scan-message');
    const scanProgress = document.getElementById('scan-progress');
    const historyList = document.querySelector('.history-list'); // NEW: History container

    // Helper function to show/hide export buttons
    const toggleExportButtons = (show) => {
        copyButton.style.display = show ? 'inline-flex' : 'none';
        downloadTxtButton.style.display = show ? 'inline-flex' : 'none';
    };

    // --- HISTORY FUNCTIONS (NEW) ---

    // Load history from Local Storage
    const getHistory = () => {
        const historyJson = localStorage.getItem(HISTORY_KEY);
        return historyJson ? JSON.parse(historyJson) : [];
    };

    // Save a new result to history
    const saveToHistory = (file, language, text) => {
        const history = getHistory();
        const now = new Date();
        const newItem = {
            id: now.getTime(),
            fileName: file.name,
            language: languageSelect.options[languageSelect.selectedIndex].text,
            timestamp: now.toISOString(),
            extractedText: text,
        };

        // Add to the start of the array
        history.unshift(newItem);

        // Limit history to the 20 most recent items
        if (history.length > 20) {
            history.length = 20;
        }

        localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
        renderHistory(); // Re-render history after saving
    };

    // Render the history list in the History tab
    const renderHistory = () => {
        const history = getHistory();
        historyList.innerHTML = ''; // Clear existing list

        if (history.length === 0) {
            historyList.innerHTML = `
                <li style="color: var(--color-subtle-text); text-align: center; padding: 20px;">
                    No conversion history found. Convert an image in the OCR tab to save your first result!
                </li>`;
            return;
        }

        history.forEach(item => {
            const timeDiff = Math.floor((new Date() - new Date(item.timestamp)) / 3600000); // Difference in hours
            let timeAgo;

            if (timeDiff < 24) {
                timeAgo = `${Math.max(1, Math.ceil(timeDiff))} hour(s) ago`;
            } else {
                timeAgo = `${Math.floor(timeDiff / 24)} day(s) ago`;
            }

            const listItem = document.createElement('li');
            listItem.className = 'history-item';
            listItem.innerHTML = `
                <div class="history-details">
                    <span class="history-title">${item.fileName} (${item.language})</span>
                    <span class="history-meta">Saved Locally • ${timeAgo}</span>
                </div>
                <div class="history-actions">
                    <button data-id="${item.id}">Re-open</button>
                </div>
            `;
            historyList.appendChild(listItem);
        });

        // Attach click listeners to all new Re-open buttons
        document.querySelectorAll('.history-actions button').forEach(button => {
            button.addEventListener('click', (e) => {
                const id = parseInt(e.target.dataset.id);
                reopenResult(id);
            });
        });
    };

    // Function to re-open a result
    const reopenResult = (id) => {
        const history = getHistory();
        const item = history.find(i => i.id === id);

        if (item) {
            // 1. Update the OCR tab's result area
            resultTextarea.value = item.extractedText;
            resultTextarea.placeholder = 'Re-opened from History.';
            toggleExportButtons(item.extractedText.trim().length > 0);
            
            // 2. Clear image preview since we can't load the original file
            imagePreview.style.display = 'none';

            // 3. Switch back to the OCR tab (assuming openTab is globally available)
            if (typeof openTab === 'function') {
                // Manually trigger tab switch without an event object
                const ocrButton = document.querySelector('.tab-btn[onclick*="ocr"]');
                openTab({ currentTarget: ocrButton }, 'ocr'); 
            } else {
                alert("Result loaded, please switch to the OCR tab.");
            }
        }
    };
    
    // --- END HISTORY FUNCTIONS ---


    // 2. Handle Image Selection and Preview
    imageUpload.addEventListener('change', (event) => {
        const file = event.target.files[0];
        // ... (rest of the image upload logic remains the same) ...
        convertButton.disabled = !file; 

        // Clear previous results and preview state
        resultTextarea.value = '';
        resultTextarea.placeholder = 'Your extracted text will appear here...';
        toggleExportButtons(false);
        scanStatus.style.display = 'none';

        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                imagePreview.src = e.target.result;
                imagePreview.style.display = 'block'; 
            };
            reader.readAsDataURL(file);
        } else {
            imagePreview.style.display = 'none';
        }
    });

    // 3. Handle Conversion Button Click (MODIFIED to save to history)
    convertButton.addEventListener('click', async () => {
        const file = imageUpload.files[0];
        if (!file) {
            alert('Please select an image first.');
            return;
        }

        const selectedLanguage = languageSelect.value; 

        // --- Prepare the state for conversion ---
        convertButton.disabled = true;
        loadingSpinner.style.display = 'inline-block';
        resultTextarea.value = '';
        resultTextarea.placeholder = 'Extracting text...';
        toggleExportButtons(false);

        // --- Start Scanning Animation (30 sec) ---
        scanStatus.style.display = 'block';
        scanMessage.textContent = `Scanning image using ${languageSelect.options[languageSelect.selectedIndex].text}... (30 sec security scan)`;
        scanProgress.style.width = '100%';

        const formData = new FormData();
        formData.append('image', file); 
        formData.append('language', selectedLanguage); 

        try {
            const response = await fetch('/api/convert', {
                method: 'POST',
                body: formData 
            });

            // Stop the scanning animation
            scanProgress.style.transition = 'none';
            scanProgress.style.width = '0%';
            scanStatus.style.display = 'none';

            const data = await response.json();

            if (response.ok) {
                // Success
                const extractedText = data.text || 'No text was found in the image.';
                resultTextarea.value = extractedText;
                
                if (extractedText.trim().length > 0) {
                    toggleExportButtons(true);
                    // NEW: Save to history on success!
                    saveToHistory(file, selectedLanguage, extractedText);
                }
            } else {
                // Failure
                const errorMessage = data.error || 'Unknown error occurred.';
                resultTextarea.value = `Error: ${errorMessage}`;
                resultTextarea.placeholder = 'An error occurred during extraction.';
                alert(`Conversion Failed: ${errorMessage}`);
            }
        } catch (error) {
            console.error('Fetch error:', error);
            resultTextarea.value = 'A network error occurred. Check your server connection.';
            resultTextarea.placeholder = 'An error occurred during extraction.';
        } finally {
            // Reset UI elements
            convertButton.disabled = false;
            loadingSpinner.style.display = 'none';
            
            // Reset scan bar transition for next use
            setTimeout(() => {
                scanProgress.style.transition = 'width 30s linear';
            }, 50);
        }
    });

    // 4. Handle Copy Button Click
    copyButton.addEventListener('click', () => {
        resultTextarea.select(); 
        resultTextarea.setSelectionRange(0, 99999); 
        
        navigator.clipboard.writeText(resultTextarea.value).then(() => {
            copyButton.textContent = 'Copied!';
            setTimeout(() => {
                copyButton.textContent = 'Copy Text';
            }, 2000);
        }).catch(err => {
            console.error('Could not copy text: ', err);
            alert('Could not copy text to clipboard. Please copy manually.');
        });
    });

    // 5. Handle Download .txt Button Click
    downloadTxtButton.addEventListener('click', () => {
        const textToSave = resultTextarea.value;
        if (!textToSave) {
            alert("No text to download.");
            return;
        }

        const blob = new Blob([textToSave], { type: 'text/plain;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'ParseX_extracted_text.txt';
        
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    });

    // 6. INITIALIZATION: Render history when the page loads
    renderHistory();
});